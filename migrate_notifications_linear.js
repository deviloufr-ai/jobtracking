// Migration Système de Notifications JobTrackr → Linear
// Usage: node migrate_notifications_linear.js lin_api_VOTRE_CLE

const LINEAR_API = "https://api.linear.app/graphql";
const API_KEY = process.argv[2];

if (!API_KEY || !API_KEY.startsWith("lin_api_")) {
  console.error("Usage: node migrate_notifications_linear.js lin_api_VOTRE_CLE");
  process.exit(1);
}

// ─── EPIC ────────────────────────────────────────────────────────────────────
const EPIC = {
  title: "🔔 Système de Notifications",
  description: `## Contexte
JobTrackr est une application passive : l'utilisateur doit l'ouvrir pour savoir si quelque chose a changé. Il rate des relances importantes (J+14 sans réponse), des entretiens à préparer, des offres qui expirent.

**Problème** : "Je ne reviens pas sur l'app assez souvent et je rate des opportunités de relancer ou de préparer mes entretiens."

## Métriques de succès
- Taux d'ouverture des notifications > 30%
- Taux de désabonnement < 5%
- Actions réalisées suite à notification > 20%

## Versioning
| Version | Périmètre | Effort |
|---------|-----------|--------|
| V1 | Notifications browser (in-app), permission flow, scénarios clés | 5j |
| V2 | Email digest hebdo + alertes critiques email (Resend API + Vercel Cron) | 6j |
| V3 | Push mobile PWA, préférences granulaires par canal, sync multi-device | 10j |

## Hors scope
- Push notifications mobiles natives (→ V3)
- Notifications Slack / SMS
- Notifications pour d'autres utilisateurs
- IA générative pour contenu email (→ V3)

## Dépendances techniques
- V1 Browser : Web Notifications API (natif, 0 dépendance)
- V2 Email : Resend API (gratuit jusqu'à 3 000 emails/mois)
- V2 Cron : Vercel Cron Jobs (plan Pro ~20$/mois)
- V3 Push : Service Worker + Web Push API

> ⚠️ Vercel Cron nécessite un plan payant. V1 est 100% client-side, sans coût supplémentaire.

---
*Specs complètes : https://app.notion.com/p/379cc77e6ec18136b7b1da99e5e5d2c8*`
};

// ─── TICKETS ─────────────────────────────────────────────────────────────────
const TICKETS = [
  {
    title: "NOTIF-001: Permission flow — banner + dialog natif browser",
    priority: 2,
    description: `## User Story
En tant qu'utilisateur, je veux être invité à activer les notifications de façon non-intrusive, afin de rester informé sans friction.

## Parcours
\`\`\`
[Première visite]
      |
[Banner non-intrusif]
"Activez les notifications pour ne jamais manquer une relance"
[Activer] [Plus tard]
      |
[Browser Permission Dialog natif]
      |
[Accordé] -> Confirmation toast "Notifications activées"
[Refusé]  -> "Tu peux activer depuis les paramètres"
\`\`\`

## Critères d'acceptance
- [ ] Banner affiché à la première visite si permission non encore demandée
- [ ] Bouton "Plus tard" : réaffiche le banner à J+3
- [ ] Permission accordée → toast de confirmation + disparition du banner
- [ ] Permission refusée → message d'aide vers les paramètres navigateur
- [ ] Permission révoquée depuis le navigateur → banner réapparaît au prochain chargement
- [ ] RGPD : banner opt-in explicite avant activation (consentement exprès)

## Effort : 1j Frontend
## Version : V1`,
  },
  {
    title: "NOTIF-002: Page Paramètres Notifications",
    priority: 2,
    description: `## User Story
En tant qu'utilisateur, je veux gérer finement mes préférences de notifications, afin de ne recevoir que ce qui m'est utile.

## Wireframe
\`\`\`
+------------------------------------------+
| Notifications                            |
+------------------------------------------+
| Canal Browser          [ ON  toggle ]    |
| Canal Email            [ OFF toggle ]    |
|                                          |
| -- Scénarios --                          |
| [x] Relances (J+14)                      |
| [x] Entretiens (J-1)                     |
| [x] Offres reçues                        |
| [x] Refus reçus                          |
| [x] Auto-archivage                       |
| [ ] Digest hebdomadaire (email seul)     |
|                                          |
| -- Email --                              |
| Adresse : alex@gmail.com    [Modifier]   |
|                                          |
| [Tester une notification]                |
| [Désactiver toutes les notifications]    |
+------------------------------------------+
\`\`\`

## Critères d'acceptance
- [ ] Accessible depuis l'icône ⋮ du header
- [ ] Toggle canal Browser (on/off)
- [ ] Toggle canal Email (on/off, masqué si pas d'email configuré)
- [ ] Checkboxes par scénario activables indépendamment
- [ ] Bouton "Tester une notification" envoie une notif test
- [ ] Bouton "Désactiver tout" désactive tous les canaux + scénarios
- [ ] Variante mobile : toggles en stack vertical
- [ ] Préférences persistées en localStorage (V1) / Supabase (V2+)

## Zones d'ombre
- Digest hebdomadaire masqué si email non configuré

## Effort : 1j Frontend + 0.5j Design
## Version : V1`,
  },
  {
    title: "NOTIF-003: Scénario N01 — Relance candidature sans réponse (J+14)",
    priority: 2,
    description: `## User Story
En tant qu'utilisateur, je veux recevoir une notification quand une candidature est sans réponse depuis 14 jours, afin de ne pas manquer l'opportunité de relancer.

## Format notification browser
\`\`\`
JobTrackr
Relancer [Entreprise]
Aucune réponse depuis 14 jours
[Ouvrir] [Ignorer]
\`\`\`

## Critères d'acceptance
- [ ] Déclenchement : J+14 après la date d'envoi, statut encore "Envoyé"
- [ ] Une seule notification N01 par candidature (pas de répétition)
- [ ] Si statut change après envoi → notification annulée pour ce cycle
- [ ] Plage horaire : 8h-20h uniquement (heure locale navigateur)
- [ ] Max 3 notifications browser par jour au total
- [ ] Max 1 notification par candidature par jour
- [ ] 3 ignores consécutifs sur ce scénario → désactivation automatique

## Règles métier
- N01 envoyée une seule fois par candidature
- Fuseau horaire : Intl.DateTimeFormat pour détecter le TZ navigateur

## Effort : 1j Frontend
## Version : V1`,
  },
  {
    title: "NOTIF-004: Scénario N02 — Rappel entretien J-1",
    priority: 2,
    description: `## User Story
En tant qu'utilisateur, je veux un rappel la veille d'un entretien, afin de le préparer à temps.

## Critères d'acceptance
- [ ] Déclenchement : J-1 via événement Google Calendar lié à la candidature
- [ ] Fallback : détection du mot "entretien" dans les notes + date de la candidature si pas de Calendar
- [ ] Notification à 8h heure locale
- [ ] Plage horaire : 8h-20h
- [ ] Max 1 notification par candidature par jour

## Zones d'ombre
- Entretien sans Google Calendar = fallback sur notes + date
- Multi-appareils V1 : par appareil (sync V3)

## Effort : 1j Frontend + 0.5j Backend (Calendar API)
## Version : V1`,
  },
  {
    title: "NOTIF-005: Scénarios N03/N04 — Offre reçue & Refus",
    priority: 2,
    description: `## User Story
En tant qu'utilisateur, je veux être notifié immédiatement quand une candidature passe en statut "Offre" ou "Refus", afin de réagir sans délai.

## Critères d'acceptance
- [ ] N03 : déclenchement quand statut → "Offre reçue"
- [ ] N04 : déclenchement quand statut → "Refus"
- [ ] Notification immédiate (déclencheur = changement de statut)
- [ ] Plage horaire : 8h-20h
- [ ] Max 1 notification par candidature par jour

## Format
\`\`\`
JobTrackr
Offre reçue — [Entreprise]   (N03)
Refus — [Entreprise]          (N04)
[Voir la candidature]
\`\`\`

## Effort : 0.5j Frontend
## Version : V1`,
  },
  {
    title: "NOTIF-006: Scénario N05 — Profil en examen > 7j",
    priority: 3,
    description: `## User Story
En tant qu'utilisateur, je veux être alerté quand mon profil est en examen depuis plus de 7 jours, afin d'évaluer si une relance est pertinente.

## Critères d'acceptance
- [ ] Déclenchement : J+7 après passage en statut "En examen" / "Reviewing"
- [ ] Une notification par candidature pour ce scénario
- [ ] Plage horaire : 8h-20h
- [ ] Annulation si statut change entre-temps

## Effort : 0.5j Frontend
## Version : V1`,
  },
  {
    title: "NOTIF-007: Scénario N07 — Auto-archivage candidature 60j",
    priority: 3,
    description: `## User Story
En tant qu'utilisateur, je veux être prévenu avant qu'une candidature soit auto-archivée après 60 jours sans réponse, afin de décider si je la conserve active.

## Critères d'acceptance
- [ ] Déclenchement : J+60 sans réponse ni changement de statut
- [ ] Notification envoyée avant archivage (J+58 ou J+59 en preview)
- [ ] Action "Garder active" disponible depuis la notification
- [ ] Plage horaire : 8h-20h

## Effort : 0.5j Frontend
## Version : V1`,
  },
  {
    title: "NOTIF-008: Scénario N08 — Rappel use case / test technique J-2",
    priority: 2,
    description: `## User Story
En tant qu'utilisateur, je veux un rappel 2 jours avant la deadline d'un test technique ou use case, afin de ne pas le rater.

## Critères d'acceptance
- [ ] Déclenchement : J-2 avant la deadline renseignée sur la candidature
- [ ] Notification uniquement si deadline explicitement saisie
- [ ] Plage horaire : 8h-20h
- [ ] Annulation si statut change (ex: refus avant deadline)

## Effort : 0.5j Frontend
## Version : V1`,
  },
  {
    title: "NOTIF-009: Email digest hebdomadaire (V2)",
    priority: 3,
    description: `## User Story
En tant qu'utilisateur, je veux recevoir un récap email chaque lundi matin, afin d'avoir une vue globale de ma recherche sans ouvrir l'app.

## Format email
\`\`\`
Objet : Tes candidatures cette semaine — 3 actions à faire

Bonjour [Prénom],

Cette semaine :
- XX candidatures actives
- X entretiens planifiés
- X relances à faire

Actions urgentes :
1. Relancer [Entreprise] (J+16 sans réponse)
2. Préparer entretien [Entreprise] (demain 14h30)

[Voir mes candidatures]
[Se désabonner]
\`\`\`

## Critères d'acceptance
- [ ] Envoi chaque lundi à 8h heure locale (Vercel Cron)
- [ ] Contenu : stats semaine + actions urgentes triées par priorité
- [ ] Lien "Se désabonner" fonctionnel (1 clic)
- [ ] SPF/DKIM configuré via Resend + domaine custom
- [ ] Email masqué dans les paramètres si non configuré
- [ ] Option digest masquée si canal email off

## Dépendances
- Resend API (gratuit jusqu'à 3 000 emails/mois)
- Vercel Cron Jobs (plan Pro ~20$/mois)

## Zones d'ombre
- Spam folder : SPF/DKIM via Resend + domaine custom
- Digest sans email configuré : masquer l'option

## Effort : 3j Backend + 1j Frontend + 1j Design
## Version : V2`,
  },
  {
    title: "NOTIF-010: Logique anti-spam & règles métier",
    priority: 2,
    description: `## Description
Implémenter le moteur de règles métier pour éviter la sur-notification et le spam utilisateur.

## Règles à implémenter
- [ ] Max 1 notification par candidature par jour
- [ ] Max 3 notifications browser par jour au total
- [ ] 3 ignores consécutifs sur un scénario → désactivation automatique du scénario
- [ ] Plage horaire browser : 8h-20h uniquement (heure locale)
- [ ] Plage horaire email : 8h heure locale
- [ ] N01 (relance) envoyée une seule fois par candidature
- [ ] Si statut change après déclenchement → notification annulée pour ce cycle
- [ ] Fuseau horaire : Intl.DateTimeFormat pour détecter le TZ navigateur

## Critères d'acceptance
- [ ] Compteur de notifications journalier reset à minuit
- [ ] Compteur d'ignores par scénario persisté
- [ ] Désactivation auto loguée + visible dans les paramètres
- [ ] Aucune notification hors plage 8h-20h
- [ ] Tests unitaires couvrant chaque règle

## Effort : 1j Frontend + 1j Backend (V2)
## Version : V1 (règles browser) + V2 (règles email)`,
  },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
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

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔌 Connexion à Linear...");
  const me = await gql(`{ viewer { name email } }`);
  console.log(`✅ Connecté : ${me.viewer.name} (${me.viewer.email})\n`);

  const teamsData = await gql(`{ teams { nodes { id name } } }`);
  const team = teamsData.teams.nodes[0];
  console.log(`📋 Équipe : ${team.name} (${team.id})\n`);

  // States
  const statesData = await gql(`{ team(id: "${team.id}") { states { nodes { id name type } } } }`);
  const states = statesData.team.states.nodes;
  const todoState = states.find(s => s.type === "unstarted") || states[0];
  console.log(`📊 Statut → "${todoState.name}"\n`);

  // Labels — on cherche ou crée "Feature"
  const labelsData = await gql(`{ issueLabels { nodes { id name } } }`);
  const featureLabel = labelsData.issueLabels.nodes.find(l => l.name === "Feature Request" || l.name === "Feature");
  if (featureLabel) console.log(`🏷  Label : ${featureLabel.name}\n`);

  // ── Créer l'Epic (comme issue parent) ────────────────────────────────────
  console.log("📌 Création de l'Epic...");
  const epicResult = await gql(`
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) { success issue { id identifier title url } }
    }
  `, {
    input: {
      teamId: team.id,
      title: EPIC.title,
      description: EPIC.description,
      priority: 2,
      stateId: todoState.id,
      ...(featureLabel ? { labelIds: [featureLabel.id] } : {})
    }
  });

  const epic = epicResult.issueCreate.issue;
  console.log(`✅ Epic créé : ${epic.identifier} → ${epic.url}\n`);
  await sleep(400);

  // ── Créer les tickets enfants ─────────────────────────────────────────────
  let ok = 0, fail = 0;
  console.log(`🎫 Création de ${TICKETS.length} tickets...\n`);

  for (const ticket of TICKETS) {
    try {
      const result = await gql(`
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) { success issue { id identifier title url } }
        }
      `, {
        input: {
          teamId: team.id,
          title: ticket.title,
          description: ticket.description,
          priority: ticket.priority,
          stateId: todoState.id,
          parentId: epic.id,
          ...(featureLabel ? { labelIds: [featureLabel.id] } : {})
        }
      });

      const issue = result.issueCreate.issue;
      console.log(`  ✅ ${issue.identifier}: ${ticket.title.substring(0, 60)}...`);
      console.log(`     ${issue.url}`);
      ok++;
    } catch (e) {
      console.error(`  ❌ ${ticket.title.substring(0, 50)}: ${e.message}`);
      fail++;
    }
    await sleep(300);
  }

  console.log(`\n🎉 Terminé : ${ok} tickets créés${fail ? `, ${fail} erreur(s)` : ""}`);
  console.log(`📌 Epic parent : ${epic.url}`);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
