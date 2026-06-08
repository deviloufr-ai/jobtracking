// Migration Notion JobTrackr Backlog → Linear
// Usage: node migrate_to_linear.js lin_api_VOTRE_CLE

const LINEAR_API = "https://api.linear.app/graphql";
const API_KEY = process.argv[2];

if (!API_KEY || !API_KEY.startsWith("lin_api_")) {
  console.error("Usage: node migrate_to_linear.js lin_api_VOTRE_CLE");
  process.exit(1);
}

const TICKETS = [
  { id:"BUG-001", title:"BUG-001: Email doublets (Gmail sync)", type:"Bug", priority:2, status:"A faire", effort:"4h", version:"v0.8", context:"Parser retourne duplicates lors du batch processing de 15 emails", solution:"Ajouter Set<messageId> en mémoire + déduplication avant insert" },
  { id:"BUG-002", title:"BUG-002: PDF parsing scannés", type:"Bug", priority:2, status:"A faire", effort:"6h", version:"v0.8", context:"Les CVs scannés retournent du texte inutilisable", solution:"Intégrer Tesseract.js ou API OCR externe" },
  { id:"BUG-009", title:"BUG-009: Améliorer implémentation historique", type:"Bug", priority:1, status:"A faire", effort:"3h", version:"v0.7", context:"Dates incorrectes dans l'historique (ex: Publidata groupé au 02/06)", solution:"Fixer le parsing de dateStr dans claude.js" },
  { id:"FEAT-001", title:"FEAT-001: Notifications browser", type:"Feature", priority:2, status:"A faire", effort:"8h", version:"v0.8", context:"Pas d'alertes pour relances ou entretiens", solution:"Web Push API + Service Worker" },
  { id:"FEAT-002", title:"FEAT-002: Export avancé", type:"Feature", priority:3, status:"A faire", effort:"5h", version:"v0.9", context:"Export limité au PDF CV", solution:"Export CSV/Excel des candidatures + filtres" },
  { id:"FEAT-003", title:"FEAT-003: Dashboard analytics", type:"Feature", priority:3, status:"A faire", effort:"12h", version:"v0.9", context:"Pas de vision globale des stats de recherche", solution:"Recharts + métriques taux réponse, conversion" },
  { id:"FEAT-004", title:"FEAT-004: CV Optimizer IA", type:"Feature", priority:2, status:"A faire", effort:"10h", version:"v0.9", context:"Pas d'analyse du match CV / offre", solution:"Claude analyse JD vs CV + score ATS + suggestions" },
  { id:"FEAT-005", title:"FEAT-005: Outlook + Exchange", type:"Feature", priority:3, status:"A faire", effort:"15h", version:"v1.0", context:"Support Gmail uniquement", solution:"Microsoft Graph API integration" },
  { id:"FEAT-006", title:"FEAT-006: LinkedIn profile import", type:"Feature", priority:3, status:"A faire", effort:"8h", version:"v1.0", context:"Saisie manuelle des infos profil", solution:"Extension scrape LinkedIn profile + auto-fill CV" },
  { id:"FEAT-007", title:"FEAT-007: Slack integration", type:"Feature", priority:4, status:"A faire", effort:"6h", version:"v1.0", context:"Pas de notifs dans workflow existant", solution:"Slack webhook + commandes /jobtrackr" },
  { id:"FEAT-008", title:"FEAT-008: Interview prediction ML", type:"Feature", priority:4, status:"A faire", effort:"20h", version:"v1.0", context:"Pas de prédiction de succès", solution:"Scoring ML basé sur historique + profil" },
  { id:"FEAT-009", title:"FEAT-009: ATS score card", type:"Feature", priority:2, status:"A faire", effort:"7h", version:"v0.9", context:"Pas de score ATS par offre", solution:"Parser JD + matcher keywords CV + score 0-100" },
  { id:"FEAT-010", title:"FEAT-010: Chat IA interview prep", type:"Feature", priority:3, status:"A faire", effort:"10h", version:"v0.9", context:"Pas d'entraînement entretien intégré", solution:"Chat Claude contextualisé par offre + STAR method" },
  { id:"FEAT-011", title:"FEAT-011: Multi-language UI", type:"Feature", priority:4, status:"A faire", effort:"8h", version:"v1.0", context:"UI en français uniquement", solution:"i18n avec react-intl, EN/FR/JA" },
  { id:"INFRA-001", title:"INFRA-001: Supabase auth + sync", type:"Infra", priority:2, status:"A faire", effort:"20h", version:"v0.9", context:"Pas d'auth, données localStorage uniquement", solution:"Supabase Auth + PostgreSQL sync" },
  { id:"INFRA-002", title:"INFRA-002: Tests unitaires", type:"Infra", priority:3, status:"A faire", effort:"15h", version:"v0.9", context:"0% de couverture de tests", solution:"Vitest + React Testing Library" },
  { id:"INFRA-003", title:"INFRA-003: GitHub Actions CI/CD", type:"Infra", priority:3, status:"A faire", effort:"8h", version:"v0.9", context:"Déploiement manuel Vercel", solution:"GH Actions: lint → test → deploy Vercel" },
  { id:"PERF-001", title:"PERF-001: Optimiser imports Claude", type:"Performance", priority:2, status:"A faire", effort:"5h", version:"v0.8", context:"Trop d'appels API Claude par import Gmail", solution:"Batching + cache + Gemini pre-filter" },
  { id:"PERF-002", title:"PERF-002: Image optimization", type:"Performance", priority:4, status:"A faire", effort:"3h", version:"v0.9", context:"Pas d'optimisation des assets", solution:"Next/Image ou sharp + lazy loading" },
];

async function gql(query, variables = {}) {
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": API_KEY },
    body: JSON.stringify({ query, variables })
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log("🔌 Connexion à Linear...");
  const me = await gql(`{ viewer { name email } }`);
  console.log(`✅ Connecté en tant que: ${me.viewer.name} (${me.viewer.email})\n`);

  const teamsData = await gql(`{ teams { nodes { id name } } }`);
  const team = teamsData.teams.nodes[0];
  console.log(`📋 Équipe: ${team.name} (${team.id})\n`);

  const statesData = await gql(`{ team(id: "${team.id}") { states { nodes { id name type } } } }`);
  const states = statesData.team.states.nodes;
  const todoState = states.find(s => s.type === "unstarted") || states[0];
  console.log(`📊 Statut "A faire" → "${todoState.name}" (${todoState.id})\n`);

  let ok = 0, fail = 0;

  for (const ticket of TICKETS) {
    const description = [
      ticket.context ? `**Contexte:** ${ticket.context}` : "",
      ticket.solution ? `**Solution proposée:** ${ticket.solution}` : "",
      `**Effort estimé:** ${ticket.effort}  |  **Version cible:** ${ticket.version}`,
      `\n---\n*Migré depuis le backlog Notion JobTrackr*`
    ].filter(Boolean).join("\n\n");

    try {
      const result = await gql(`
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue { id identifier title url }
          }
        }
      `, {
        input: {
          teamId: team.id,
          title: ticket.title,
          description,
          priority: ticket.priority,
          stateId: todoState.id
        }
      });

      const issue = result.issueCreate.issue;
      console.log(`✅ ${issue.identifier}: ${ticket.id} → ${issue.url}`);
      ok++;
    } catch (e) {
      console.error(`❌ ${ticket.id}: ${e.message}`);
      fail++;
    }

    await sleep(300);
  }

  console.log(`\n🎉 Migration terminée: ${ok} créés, ${fail} erreur(s)`);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
