export default function LandingPage({ onLogin }) {
  return (
    <div style={{
      background: '#0c0f16',
      color: '#eef0f6',
      fontFamily: "'Inter', sans-serif",
      lineHeight: 1.55,
      minHeight: '100vh'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

        * { box-sizing: border-box; }

        .page {
          max-width: 1040px;
          margin: 0 auto;
          padding: 0 28px;
        }

        .nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 26px 0;
          border-bottom: 1px solid #2b3242;
        }

        .wordmark {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          font-size: 19px;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .dot {
          width: 10px;
          height: 10px;
          border-radius: 2px;
          background: #7b7bf7;
          transform: rotate(45deg);
        }

        .hero {
          padding: 64px 0 56px;
        }

        .eyebrow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #7b7bf7;
          margin-bottom: 18px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .eyebrow::before {
          content: "";
          display: block;
          width: 26px;
          height: 1px;
          background: #7b7bf7;
        }

        .hero h1 {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 50px;
          font-weight: 700;
          line-height: 1.12;
          letter-spacing: -1px;
          max-width: 760px;
          margin: 0;
        }

        .hero h1 em {
          font-style: normal;
          color: #7b7bf7;
        }

        .lede {
          margin-top: 20px;
          font-size: 17px;
          color: #9aa3ba;
          max-width: 580px;
        }

        .ctas {
          margin-top: 32px;
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .btn {
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 14px;
          padding: 12px 22px;
          border-radius: 8px;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: transform .15s ease, border-color .15s ease;
          border: none;
          cursor: pointer;
        }

        .btn-primary {
          background: #7b7bf7;
          color: #0c0f16;
        }

        .btn-primary:hover {
          transform: translateY(-1px);
        }

        .btn-secondary {
          background: transparent;
          color: #eef0f6;
          border: 1px solid #2b3242;
        }

        .btn-secondary:hover {
          border-color: #7b7bf7;
        }

        .badge {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: #0c0f16;
          background: #f4a73c;
          border-radius: 4px;
          padding: 2px 7px;
          font-weight: 700;
        }

        .pipeline {
          margin-top: 56px;
          background: #161b26;
          border: 1px solid #2b3242;
          border-radius: 14px;
          padding: 28px 28px 22px;
          overflow: hidden;
          position: relative;
        }

        .pipeline-label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #6b7488;
          margin-bottom: 24px;
        }

        .pipeline-track {
          position: relative;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
        }

        .pipeline-track::before {
          content: "";
          position: absolute;
          top: 17px;
          left: 5%;
          right: 5%;
          height: 2px;
          background: #2b3242;
          z-index: 0;
        }

        .stage {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .node {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 2px solid #2b3242;
          background: #0c0f16;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          font-weight: 600;
          color: #9aa3ba;
          margin-bottom: 14px;
        }

        .stage.active .node {
          border-color: #7b7bf7;
          color: #7b7bf7;
          background: rgba(123,123,247,0.14);
        }

        .stage-title {
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 4px;
        }

        .stage-desc {
          font-size: 12.5px;
          color: #6b7488;
          line-height: 1.45;
          max-width: 180px;
        }

        .runner {
          position: absolute;
          top: 13px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #7b7bf7;
          box-shadow: 0 0 0 4px rgba(123,123,247,0.12);
          animation: run 9s linear infinite;
        }

        @keyframes run {
          0% { left: 5%; opacity: 0; }
          8% { opacity: 1; }
          92% { opacity: 1; }
          100% { left: 95%; opacity: 0; }
        }

        section { padding: 56px 0; }

        .section-head {
          margin-bottom: 32px;
        }

        .kicker {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #6b7488;
          margin-bottom: 10px;
        }

        .section-head h2 {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 30px;
          font-weight: 700;
          letter-spacing: -0.5px;
          margin: 0;
        }

        .section-head p {
          margin-top: 10px;
          color: #9aa3ba;
          max-width: 600px;
          font-size: 15px;
        }

        .problem-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: #2b3242;
          border: 1px solid #2b3242;
          border-radius: 12px;
          overflow: hidden;
        }

        .problem-item {
          background: #161b26;
          padding: 22px;
        }

        .problem-item .num {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          color: #f4a73c;
          margin-bottom: 10px;
        }

        .problem-item h3 {
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 6px;
          margin-top: 0;
        }

        .problem-item p {
          font-size: 13px;
          color: #9aa3ba;
          margin: 0;
        }

        .spotlight-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .spotlight {
          background: #161b26;
          border: 1px solid #2b3242;
          border-radius: 14px;
          padding: 26px;
          transition: border-color .15s ease;
        }

        .spotlight:hover { border-color: #7b7bf7; }

        .spotlight-head {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
        }

        .spotlight-head .s-icon { font-size: 26px; }

        .spotlight-head h3 {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 18px;
          font-weight: 700;
          margin: 0;
          flex: 1;
        }

        .spotlight > p {
          font-size: 13.5px;
          color: #9aa3ba;
          margin: 0 0 16px;
          line-height: 1.55;
        }

        .spotlight ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .spotlight li {
          font-size: 12.5px;
          color: #c3cad9;
          padding-left: 18px;
          position: relative;
          line-height: 1.45;
        }

        .spotlight li::before {
          content: "\\2192";
          position: absolute;
          left: 0;
          color: #7b7bf7;
        }

        .feature-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }

        .feature {
          background: #161b26;
          border: 1px solid #2b3242;
          border-radius: 12px;
          padding: 20px;
          transition: border-color .15s ease;
        }

        .feature:hover { border-color: #7b7bf7; }

        .feature .icon {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: rgba(123,123,247,0.14);
          color: #7b7bf7;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
          font-size: 18px;
        }

        .feature h3 {
          font-size: 14.5px;
          font-weight: 600;
          margin-bottom: 6px;
          margin-top: 0;
        }

        .feature p {
          font-size: 12.5px;
          color: #9aa3ba;
          line-height: 1.5;
          margin: 0;
        }

        .rule { border: none; border-top: 1px solid #2b3242; }

        footer { border-top: 1px solid #2b3242; padding: 40px 0 48px; }

        .footer-grid {
          display: grid;
          grid-template-columns: 1.4fr 1fr 1fr;
          gap: 36px;
        }

        .footer-grid h4 {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #6b7488;
          margin-bottom: 12px;
          margin-top: 0;
        }

        .footer-grid .origin {
          font-size: 13.5px;
          color: #9aa3ba;
          line-height: 1.7;
          max-width: 420px;
        }

        .footer-links { display: flex; flex-direction: column; gap: 8px; font-size: 13.5px; }
        .footer-links a { color: #eef0f6; text-decoration: none; }
        .footer-links a:hover { color: #7b7bf7; }

        @media (max-width: 800px) {
          .hero h1 { font-size: 36px; }
          .pipeline-track { grid-template-columns: 1fr 1fr; row-gap: 28px; }
          .pipeline-track::before { display: none; }
          .problem-grid { grid-template-columns: 1fr; }
          .spotlight-grid { grid-template-columns: 1fr; }
          .feature-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      <div className="page">
        {/* NAV */}
        <div className="nav">
          <div className="wordmark">
            <span className="dot"></span>
            JobTrackerAI
          </div>
          <button onClick={onLogin} className="btn btn-primary">
            Se connecter avec Google
          </button>
        </div>

        {/* HERO */}
        <section className="hero">
          <div className="eyebrow">Copilote IA pour la recherche d'emploi</div>
          <h1>Gérez 50 candidatures en parallèle sans y passer vos soirées.</h1>
          <p className="lede">JobTrackerAI synchronise vos emails, détecte les statuts, adapte vos CV, rédige vos relances et vous entraîne à l'oral — pour garder le contrôle sur 15 à 50 candidatures en parallèle, sans y passer vos soirées.</p>
          <p style={{ marginTop: '12px', fontSize: '14px', color: '#7b7bf7' }}>💡 Démarrez gratuitement — 15 actions IA offertes. Ensuite, ajoutez votre propre clé API Anthropic (gratuite) pour continuer.</p>
          <div className="ctas">
            <button className="btn btn-primary" onClick={onLogin}>
              Se connecter avec Google
            </button>
            <a href="https://github.com/deviloufr-ai/jobtracking" target="_blank" rel="noreferrer" className="btn btn-secondary">
              Code source sur GitHub
            </a>
          </div>

          {/* SIGNATURE PIPELINE */}
          <div className="pipeline">
            <div className="pipeline-label">Le cœur du produit — chaque candidature suit ce pipeline, automatiquement tenu à jour</div>
            <div className="pipeline-track">
              <div className="runner"></div>
              <div className="stage active">
                <div className="node">01</div>
                <div className="stage-title">Envoyée</div>
                <div className="stage-desc">Détectée et créée automatiquement depuis Gmail, sans saisie.</div>
              </div>
              <div className="stage active">
                <div className="node">02</div>
                <div className="stage-title">En cours</div>
                <div className="stage-desc">Statut mis à jour à chaque échange — accusés, relances, refus ATS.</div>
              </div>
              <div className="stage">
                <div className="node">03</div>
                <div className="stage-title">Entretien</div>
                <div className="stage-desc">CV adapté, réponses STAR et entretien blanc vocal — prêt le jour J.</div>
              </div>
              <div className="stage">
                <div className="node">04</div>
                <div className="stage-title">Offre</div>
                <div className="stage-desc">Objectif atteint. L'historique reste pour analyser votre stratégie.</div>
              </div>
            </div>
          </div>
        </section>

        <hr className="rule" />

        {/* PROBLEM */}
        <section>
          <div className="section-head">
            <div className="kicker">Le problème</div>
            <h2>Chercher un emploi sans outil adapté, c'est un deuxième emploi.</h2>
            <p>Au-delà de 20 candidatures actives, les outils classiques ne tiennent plus la charge — et c'est le candidat qui compense.</p>
          </div>
          <div className="problem-grid">
            {[
              { num: '01 / Dispersion', title: 'Cinq canaux, zéro hub', desc: 'LinkedIn, jobboards, emails directs, réseau, candidatures spontanées — aucune vue d\'ensemble.' },
              { num: '02 / Contexte perdu', title: '"Où en étais-je avec eux ?"', desc: 'Impossible de retrouver l\'historique d\'une candidature sans rouvrir 10 emails.' },
              { num: '03 / Emails noyés', title: 'Refus ATS invisibles', desc: 'Confirmations, relances et refus automatiques se perdent dans la boîte de réception.' },
              { num: '04 / Pas de priorités', title: 'Quoi faire aujourd\'hui ?', desc: 'Aucun signal pour savoir qui relancer, quel entretien préparer, ce qui est mort.' },
              { num: '05 / CV rigide', title: 'Le même CV partout', desc: 'Envoyé tel quel, sans adaptation à la fiche de poste — au détriment du taux de réponse.' },
              { num: '06 / Oral non préparé', title: 'Entretien improvisé', desc: 'Aucun entraînement, aucun feedback avant de se retrouver face au recruteur.' }
            ].map((item, i) => (
              <div key={i} className="problem-item">
                <div className="num">{item.num}</div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule" />

        {/* WHAT'S NEW — SPOTLIGHT */}
        <section>
          <div className="section-head">
            <div className="kicker">Nouveautés</div>
            <h2>Quatre nouveaux modules qui font le gros du travail à votre place.</h2>
            <p>Depuis la v0.5, JobTrackerAI ne se contente plus de suivre : il rédige, adapte, entraîne et synchronise.</p>
          </div>
          <div className="spotlight-grid">
            {[
              {
                icon: '🎤',
                title: 'Coach d\'entretien vocal',
                desc: 'Un entretien blanc où vous répondez à la voix. L\'IA joue le recruteur, pose des questions tirées de la fiche de poste et de votre CV, puis note votre prestation.',
                points: [
                  'Reconnaissance vocale in-browser (Whisper WASM) — marche aussi sur Firefox & Safari',
                  'Persona recruteur adapté au poste et à votre parcours',
                  'Analyse et score en fin de session',
                  'Onglet Pratique pour suivre vos progrès dans le temps'
                ]
              },
              {
                icon: '📄',
                title: 'CV Studio adaptatif',
                desc: 'Un CV réécrit pour chaque offre, directement depuis la candidature. Score ATS auto-vérifié jusqu\'à ≥ 90 %, export PDF en un clic.',
                points: [
                  '5 templates repensés, marges aérées, coupures de page propres',
                  'Score de correspondance + couverture ATS, forces et manques détaillés',
                  'Règles de génération ajustables (langue, ton, niveau ATS, zéro info inventée)',
                  'Génération en lot pour toutes les candidatures sans CV'
                ]
              },
              {
                icon: '✉️',
                title: 'Rédaction IA : emails & lettres',
                desc: 'Des relances et des remerciements post-refus prêts à envoyer, et des lettres de motivation qui sonnent humain. Vous gardez la main — aucun envoi automatique.',
                points: [
                  'Remerciement envoyé en réponse dans le fil du refus, langue détectée',
                  'Le recruteur salué par son nom quand il est connu',
                  'Composeur d\'email complet avec bloc signature',
                  'Lettre de motivation avec zone de contexte optionnelle'
                ]
              },
              {
                icon: '☁️',
                title: 'Comptes réels & multi-appareils',
                desc: 'Connexion Google, données isolées par compte, synchronisées en temps réel. Retrouvez tout sur le téléphone, la tablette et l\'ordi.',
                points: [
                  'Candidatures, CV, lettres, scores et données d\'entretien synchronisés',
                  'Suppressions propagées entre appareils',
                  'Profil et CV de base disponibles partout',
                  'Isolation par compte (Supabase RLS) — rien n\'est vendu ni partagé'
                ]
              }
            ].map((item, i) => (
              <div key={i} className="spotlight">
                <div className="spotlight-head">
                  <span className="s-icon">{item.icon}</span>
                  <h3>{item.title}</h3>
                  <span className="badge">Nouveau</span>
                </div>
                <p>{item.desc}</p>
                <ul>
                  {item.points.map((pt, j) => <li key={j}>{pt}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule" />

        {/* FEATURES */}
        <section>
          <div className="section-head">
            <div className="kicker">Fonctionnalités</div>
            <h2>Tout le produit, d'un coup d'œil.</h2>
            <p>Organiser, enrichir, rédiger, s'entraîner et suivre ses progrès — sans jamais ouvrir un tableur.</p>
          </div>
          <div className="feature-grid">
            {[
              { icon: '📋', title: 'Tableau de bord + 3 vues', desc: 'Vue Table, tableau Kanban en glisser-déposer, et vue Plateformes qui regroupe par job board. Filtres statut/période/mots-clés et recherche instantanée.' },
              { icon: '📧', title: 'Gmail synchronisé', desc: 'Connectez-vous une fois : l\'IA détecte offres, accusés, relances et refus ATS, et met tout à jour sans la moindre saisie.' },
              { icon: '📅', title: 'Calendrier synchronisé', desc: 'Google Calendar intégré. Les entretiens apparaissent seuls avec les liens Zoom/Teams. Rappel J-1, rien n\'est oublié.' },
              { icon: '⏰', title: 'Historique consolidé', desc: '10 statuts métier, détection auto des refus ATS (Ashby, Greenhouse, Lever, Workday, Teamtailor...). Une timeline datée par candidature.' },
              { icon: '⚡', title: 'Quoi faire maintenant', desc: 'Un moteur qui vous dit qui relancer, quel entretien préparer, où avancer. Actions classées par urgence pour rester focalisé.' },
              { icon: '🎤', title: 'Coach d\'entretien vocal', desc: 'Entretien blanc à la voix, persona recruteur, questions tirées de la fiche de poste et de votre CV, analyse et score à la fin.' },
              { icon: '📄', title: 'CV adapté par candidature', desc: 'CV réécrit pour chaque offre, 5 templates, score ATS auto-vérifié ≥ 90 %, aperçu et export PDF en un clic.' },
              { icon: '✉️', title: 'Emails & lettres IA', desc: 'Relances et remerciements post-refus prêts à envoyer, lettres de motivation qui sonnent humain. Aucun envoi automatique.' },
              { icon: '⭐', title: 'Préparation STAR', desc: '3 réponses STAR générées par fiche de poste, plus un onglet Pratique pour suivre votre progression d\'entretien.' },
              { icon: '📊', title: 'Analytics + récap hebdo', desc: 'Tendances (candidatures/semaine, taux de réponse, velocity) et une carte récap chaque semaine : ajouts, réponses, entretiens, offres.' },
              { icon: '☁️', title: 'Sur tous vos appareils', desc: 'Comptes Google et synchronisation temps réel des candidatures, CV, lettres, scores et données d\'entretien.' },
              { icon: '🎯', title: '4 façons d\'ajouter', desc: 'Gmail, capture d\'écran (LinkedIn, job boards), extension Firefox ou ajout manuel — tous les chemins mènent au pipeline.' },
              { icon: '🧩', title: 'Extension Firefox', desc: 'Scannez une page de résultats entière : chaque offre est scorée contre votre CV, vous validez, tout arrive dans le pipeline.' },
              { icon: '🔀', title: 'Actions groupées', desc: 'Sélection multiple, fusion automatique des doublons, génération de CV en lot. Nettoyez et organisez en quelques clics.' },
              { icon: '🎨', title: '8 thèmes', desc: 'Clair, sombre, et 6 ambiances (midnight, nocturne, ocean, forest, sunset, minimal). Synchronisé partout.' },
              { icon: '🔔', title: 'Notifications utiles', desc: 'Alertes pour les nouveaux emails, les relances en retard, les entretiens imminents. Desktop ou in-app, à votre choix.' }
            ].map((item, i) => (
              <div key={i} className="feature">
                <div className="icon">{item.icon}</div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule" />

        {/* HOW IT WORKS */}
        <section>
          <div className="section-head">
            <div className="kicker">Comment ça marche</div>
            <h2>Un workflow en 4 étapes pour dominer votre recherche.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
            {[
              {
                step: '1',
                title: 'Importer',
                desc: 'Gmail, capture d\'écran, extension Firefox ou ajout manuel — les candidatures arrivent dans votre pipeline.'
              },
              {
                step: '2',
                title: 'Enrichir',
                desc: 'L\'IA analyse vos emails, détecte les statuts, consolide l\'historique, adapte vos CV et prépare vos relances.'
              },
              {
                step: '3',
                title: 'Agir & s\'entraîner',
                desc: 'Suivez les recommandations, envoyez les brouillons, passez un entretien blanc vocal et corrigez le tir.'
              },
              {
                step: '4',
                title: 'Réussir',
                desc: 'Décrochez l\'offre. L\'historique reste : analyse de votre stratégie, amélioration continue.'
              }
            ].map((item, i) => (
              <div key={i} style={{
                background: '#161b26',
                border: '1px solid #2b3242',
                borderRadius: '12px',
                padding: '24px',
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '36px',
                  fontWeight: '700',
                  color: '#7b7bf7',
                  marginBottom: '12px'
                }}>
                  {item.step}
                </div>
                <div style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  marginBottom: '8px',
                  color: '#eef0f6'
                }}>
                  {item.title}
                </div>
                <div style={{
                  fontSize: '14px',
                  color: '#9aa3ba',
                  lineHeight: 1.5
                }}>
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule" />

        {/* AI CAPABILITIES */}
        <section>
          <div className="section-head">
            <div className="kicker">L'IA à votre service</div>
            <h2>Du parsing d'email au coaching d'entretien, sur toute la chaîne.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
            {[
              { icon: '📧', level: 'Capture', title: 'Parsing emails', desc: 'Analyse par lots, extraction structurée des offres, filtre pré-parse pour économiser les tokens.' },
              { icon: '🏷️', level: 'Classement', title: 'Détection statut', desc: 'Identifie refus ATS, accusés, étapes de process et entreprises, même sur les boîtes multi-tenants.' },
              { icon: '📄', level: 'Candidature', title: 'CV adaptatif', desc: 'Réécrit le CV selon la fiche de poste et s\'auto-vérifie jusqu\'à un score ATS ≥ 90 %.' },
              { icon: '💌', level: 'Relance', title: 'Emails contextualisés', desc: 'Rédige relances et remerciements à partir du message du recruteur (pas d\'envoi automatique).' },
              { icon: '📝', level: 'Motivation', title: 'Lettres humaines', desc: 'Génère des lettres qui ne sonnent pas robot, avec zone de contexte optionnelle.' },
              { icon: '🎤', level: 'Oral', title: 'Coach d\'entretien', desc: 'Entretien blanc vocal, questions sur mesure, analyse et score en fin de session.' },
              { icon: '⭐', level: 'Prépa', title: 'Réponses STAR', desc: 'Génère 3 anecdotes STAR prêtes pour l\'entretien, par fiche de poste.' },
              { icon: '🔍', level: 'Analyse', title: 'Analyse d\'offre', desc: 'Scrape la fiche de poste, extrait les mots-clés et alimente le scoring et la prépa.' }
            ].map((item, i) => (
              <div key={i} style={{
                background: '#161b26',
                border: '1px solid #2b3242',
                borderRadius: '12px',
                padding: '20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ fontSize: '28px' }}>{item.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: '#6b7488', fontWeight: '600', marginBottom: '4px' }}>
                      {item.level}
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '6px', color: '#eef0f6' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '13px', color: '#9aa3ba' }}>
                      {item.desc}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule" />

        {/* NUMBERS */}
        <section>
          <div className="section-head">
            <div className="kicker">Conçu pour la réalité</div>
            <h2>Les chiffres d'une recherche active intense.</h2>
            <p>JobTrackerAI ne vous limite pas — c'est pensé pour gérer la vraie charge d'une recherche parallèle massive.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            {[
              { value: '50+', label: 'candidatures actives en parallèle, sans perte d\'information' },
              { value: '10', label: 'statuts métier granulaires pour classifier chaque étape' },
              { value: '3', label: 'vues du pipeline : table, kanban, plateformes' },
              { value: '5', label: 'templates de CV adaptés à la fiche de poste' },
              { value: '90%+', label: 'score ATS visé et auto-vérifié sur chaque CV généré' },
              { value: '8', label: 'thèmes clair/sombre, synchronisés sur tous vos appareils' },
              { value: '1 clic', label: 'pour exporter votre CV adapté en PDF' },
              { value: '∞', label: 'historique consolidé, jamais perdu' }
            ].map((card, i) => (
              <div key={i} style={{ border: '1px solid #2b3242', borderRadius: '12px', padding: '22px 20px', textAlign: 'left' }}>
                <div style={{ fontFamily: '\'IBM Plex Mono\', monospace', fontSize: '28px', fontWeight: '600', color: '#7b7bf7', marginBottom: '8px' }}>
                  {card.value}
                </div>
                <div style={{ fontSize: '12.5px', color: '#9aa3ba', lineHeight: '1.45' }}>
                  {card.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* USE CASES */}
        <hr className="rule" />
        <section>
          <div className="section-head">
            <div className="kicker">Pour qui?</div>
            <h2>Fait pour les recherches actives, dès 15 candidatures parallèles.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            {[
              {
                icon: '🚀',
                title: 'Candidat en recherche active',
                desc: 'Vous envoyez 20-50 candidatures/mois, gérez les relances, les entretiens, les offres. Excel vous a déjà laissé tomber.'
              },
              {
                icon: '📚',
                title: 'Junior en transition',
                desc: 'Vous changez de secteur ou démarrez votre carrière. Besoin d\'une stratégie claire, de prep intensive, de feedback sur votre CV et vos entretiens.'
              },
              {
                icon: '🎯',
                title: 'Senior en repositionnement',
                desc: 'Vous avez 10+ ans d\'expérience, vous visez 5-10 opportunités haut de gamme. Besoin d\'une analyse précise, pas du bruit.'
              }
            ].map((item, i) => (
              <div key={i} style={{
                background: '#161b26',
                border: '1px solid #2b3242',
                borderRadius: '12px',
                padding: '28px'
              }}>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>{item.icon}</div>
                <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '10px', color: '#eef0f6' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '14px', color: '#9aa3ba', lineHeight: '1.6' }}>
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule" />

        {/* FOOTER */}
        <footer>
          <div className="footer-grid">
            <div>
              <h4>Origine du projet</h4>
              <p className="origin">Construit par <b>Alexandre Leblanc</b> — PM Senior, 18 ans d'expérience (gaming, AdTech, Web3, mobile), trilingue FR/EN/JP. JobTrackerAI est né d'une frustration personnelle en recherche active d'emploi, et est devenu la meilleure démonstration de ce qu'un PM peut livrer seul à l'intersection du product thinking, du no-code/low-code et de l'IA générative. Projet personnel, en développement continu depuis avril 2026, en production depuis la v0.5.</p>
            </div>
            <div>
              <h4>Stack technique</h4>
              <div style={{ fontSize: '13.5px', color: '#9aa3ba', lineHeight: 1.9 }}>
                React · Tailwind · Vite<br/>
                Vercel Serverless<br/>
                Claude (Anthropic) + Whisper (voix)<br/>
                Gmail & Calendar API<br/>
                Supabase (comptes + sync, RLS)<br/>
                Extension Firefox
              </div>
            </div>
            <div>
              <h4>Légal & Accès</h4>
              <div className="footer-links">
                <a href="https://jobtracking-three.vercel.app" target="_blank" rel="noreferrer">→ jobtracking-three.vercel.app</a>
                <a href="https://github.com/deviloufr-ai/jobtracking" target="_blank" rel="noreferrer">→ github.com/deviloufr-ai/jobtracking</a>
                <a href="/privacy-policy" target="_blank" rel="noreferrer">→ Politique de confidentialité</a>
                <a href="/terms-of-service" target="_blank" rel="noreferrer">→ Conditions d'utilisation</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
