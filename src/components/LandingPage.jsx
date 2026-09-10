import { Icon } from './landingIcons'

const GROUPS = [
  {
    icon: 'layers',
    title: 'Tout suivre',
    lead: 'Toute votre recherche au même endroit, tenue à jour pour vous.',
    items: [
      ['Synchro Gmail', 'Offres, réponses et refus détectés tout seuls — sans rien saisir.'],
      ['Google Agenda', 'Les entretiens apparaissent avec le lien de visio et un rappel J-1.'],
      ['Une timeline claire', 'Chaque étape par candidature, en trois vues : tableau, kanban, plateformes.'],
      ['Quoi faire maintenant', 'Une liste courte et priorisée : qui relancer, quoi préparer aujourd’hui.'],
      ['Alertes utiles', 'Nouveaux emails, relances en retard, entretiens qui approchent.'],
    ],
  },
  {
    icon: 'fileText',
    title: 'Candidater mieux',
    lead: 'Une candidature plus solide, en une fraction du temps.',
    items: [
      ['CV Studio', 'Un CV réécrit pour chaque offre, vérifié ATS, export PDF en un clic.'],
      ['Lettres & relances', 'Des brouillons qui sonnent humain — c’est vous qui envoyez.'],
      ['Recherche d’offres intégrée', 'Parcourez les jobboards, voyez le temps de trajet, ajoutez en un clic.'],
      ['Extension navigateur', 'Scannez une page de résultats : chaque offre est notée face à votre CV.'],
    ],
  },
  {
    icon: 'mic',
    title: 'Réussir l’entretien',
    lead: 'Arriver préparé plutôt que d’improviser.',
    items: [
      ['Entretien blanc vocal', 'Vous répondez à voix haute ; l’IA joue le recruteur et vous note.'],
      ['Réponses STAR', 'Trois anecdotes prêtes à l’emploi, adaptées à chaque poste.'],
      ['Espace Entretiens', 'Un onglet dédié à chaque candidature arrivée en entretien.'],
      ['Contacts', 'Recruteurs et mises en relation réunis, avec des rappels pour relancer.'],
    ],
  },
  {
    icon: 'scale',
    title: 'Décrocher l’offre',
    lead: 'Trancher avec de vrais chiffres, pas au feeling.',
    items: [
      ['Suivi de rémunération', 'Fixe, variable, equity et avantages, côte à côte.'],
      ['Comparaison d’offres', 'Classez les offres concurrentes par package total.'],
      ['Assistant négociation', 'Un email ou un script d’appel ancré sur vos chiffres réels.'],
      ['Analytics', 'Taux de réponse, dynamique et récap hebdo — découpés à votre façon.'],
    ],
  },
]

const NEW = [
  { icon: 'search', title: 'Recherche d’offres intégrée', desc: 'Trouvez des postes sur de vrais jobboards et ajoutez-les sans quitter l’app.' },
  { icon: 'mic', title: 'Espace Entretiens', desc: 'Un lieu pour chaque entretien, avec la préparation à portée de main.' },
  { icon: 'scale', title: 'Offres & négociation', desc: 'Suivez la rému, comparez les offres et rédigez votre demande.' },
  { icon: 'sparkles', title: 'Votre propre IA', desc: 'Claude, Gemini ou une clé compatible OpenAI — au choix.' },
]

const WHO = [
  { icon: 'zap', title: 'Candidat en recherche active', desc: 'Vous envoyez 20 à 50 candidatures par mois et jonglez avec réponses, entretiens et offres. Excel a lâché depuis longtemps.' },
  { icon: 'repeat', title: 'En reconversion', desc: 'Nouveau secteur, nouveau départ. Il vous faut une stratégie claire, de la prépa réelle et un retour honnête sur votre CV.' },
  { icon: 'target', title: 'Senior en repositionnement', desc: '10 ans et plus d’expérience, quelques postes premium en vue. Vous voulez du signal précis, pas du bruit.' },
]

export default function LandingPage({ onLogin }) {
  return (
    <div className="sjt">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

        * { box-sizing: border-box; }

        .sjt {
          --paper:#0c0f16; --card:#161b26; --ink:#eef0f6;
          --body:#9aa3ba; --body-2:#c3cad9; --muted:#6b7488;
          --line:#2b3242; --line-2:#343d4d;
          --accent:#7b7bf7; --accent-soft:rgba(123,123,247,0.14); --amber:#f4a73c;
          background:var(--paper); color:var(--body);
          font-family:'Inter', system-ui, -apple-system, sans-serif;
          line-height:1.6; min-height:100vh; -webkit-font-smoothing:antialiased;
        }
        .sjt ::selection { background:rgba(123,123,247,0.3); }
        .display { font-family:'Space Grotesk', sans-serif; }
        .wrap { max-width:1080px; margin:0 auto; padding:0 24px; }

        .nav { display:flex; align-items:center; justify-content:space-between; padding:24px 0; border-bottom:1px solid var(--line); }
        .brand { display:flex; align-items:center; gap:11px; font-family:'Space Grotesk', sans-serif; font-weight:700; font-size:18px; color:var(--ink); letter-spacing:.3px; }
        .dot { width:11px; height:11px; border-radius:2px; background:var(--accent); transform:rotate(45deg); }

        .btn { font-family:inherit; font-weight:600; font-size:15px; padding:12px 20px; border-radius:9px; text-decoration:none; display:inline-flex; align-items:center; gap:9px; cursor:pointer; border:1px solid transparent; transition:transform .15s ease, border-color .15s ease; }
        .btn-primary { background:var(--accent); color:#0c0f16; }
        .btn-primary:hover { transform:translateY(-1px); }
        .btn-ghost { background:transparent; color:var(--ink); border-color:var(--line); }
        .btn-ghost:hover { border-color:var(--accent); }
        .nav .btn { padding:10px 16px; font-size:14px; border-radius:8px; }

        .kick { font-family:'IBM Plex Mono', monospace; font-size:12px; font-weight:600; letter-spacing:.16em; text-transform:uppercase; color:var(--accent); margin-bottom:14px; }
        .pill { display:inline-flex; align-items:center; gap:8px; font-family:'IBM Plex Mono', monospace; font-size:11px; font-weight:600; letter-spacing:.13em; text-transform:uppercase; color:var(--accent); background:var(--accent-soft); padding:7px 13px; border-radius:999px; }

        .hero { padding:56px 0 40px; }
        .hero h1 { font-family:'Space Grotesk', sans-serif; font-weight:700; font-size:clamp(36px,5.2vw,54px); line-height:1.08; letter-spacing:-1px; color:var(--ink); margin:22px 0 0; max-width:800px; }
        .hl { color:var(--accent); }
        .lede { margin:20px 0 0; font-size:17px; color:var(--body); max-width:620px; }
        .ctas { margin-top:30px; display:flex; gap:12px; flex-wrap:wrap; }
        .free { margin:18px 0 0; font-size:14px; color:var(--body); max-width:620px; }

        .flow { margin-top:48px; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:26px 28px 24px; }
        .flow-label { font-family:'IBM Plex Mono', monospace; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin-bottom:24px; }
        .flow-steps { position:relative; display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
        .flow-steps::before { content:""; position:absolute; top:17px; left:6%; right:6%; height:2px; background:var(--line-2); }
        .flow-fill { position:absolute; top:17px; left:6%; height:2px; background:var(--accent); box-shadow:0 0 12px rgba(123,123,247,.5); width:0; animation:grow 2.2s cubic-bezier(.6,.02,.3,1) forwards .35s; }
        @keyframes grow { to { width:44%; } }
        .fstep { position:relative; z-index:1; }
        .fnode { width:36px; height:36px; border-radius:50%; border:2px solid var(--line-2); background:var(--paper); display:grid; place-items:center; font-family:'IBM Plex Mono', monospace; font-size:12px; font-weight:600; color:var(--muted); }
        .fstep.on .fnode { border-color:var(--accent); background:var(--accent-soft); color:var(--accent); }
        .fstep h4 { font-family:'Space Grotesk', sans-serif; margin:14px 0 3px; font-size:14.5px; font-weight:600; color:var(--ink); }
        .fstep p { margin:0; font-size:12.5px; color:var(--muted); line-height:1.45; max-width:185px; }

        .section { padding:56px 0; border-top:1px solid var(--line); }
        .head { max-width:680px; margin-bottom:36px; }
        .head h2 { font-family:'Space Grotesk', sans-serif; font-weight:700; font-size:clamp(26px,3.3vw,32px); line-height:1.14; letter-spacing:-.5px; color:var(--ink); margin:0; }
        .head p { margin:13px 0 0; font-size:16px; color:var(--body); }

        .steps { display:grid; grid-template-columns:repeat(4,1fr); gap:22px; }
        .step .n { font-family:'Space Grotesk', sans-serif; font-size:34px; font-weight:700; color:var(--accent); line-height:1; }
        .step h3 { font-family:'Space Grotesk', sans-serif; margin:14px 0 6px; font-size:16px; font-weight:600; color:var(--ink); }
        .step p { margin:0; font-size:14px; color:var(--body); }

        .groups { display:grid; grid-template-columns:repeat(2,1fr); gap:18px; }
        .group { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:28px; transition:border-color .15s ease; }
        .group:hover { border-color:var(--accent); }
        .group-top { display:flex; align-items:center; gap:13px; margin-bottom:6px; }
        .group-ic { width:42px; height:42px; border-radius:11px; background:var(--accent-soft); color:var(--accent); display:grid; place-items:center; flex-shrink:0; }
        .group h3 { font-family:'Space Grotesk', sans-serif; margin:0; font-size:20px; font-weight:700; letter-spacing:-.3px; color:var(--ink); }
        .group .lead { margin:0 0 18px; font-size:14px; color:var(--muted); }
        .flist { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:13px; }
        .flist li { display:flex; gap:11px; align-items:flex-start; font-size:14px; color:var(--body-2); line-height:1.5; }
        .flist .li-ic { color:var(--accent); flex-shrink:0; margin-top:3px; }
        .flist b { color:var(--ink); font-weight:600; }

        .new-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
        .newcard { position:relative; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:24px 22px; transition:border-color .15s ease; }
        .newcard:hover { border-color:var(--accent); }
        .newcard .nc-ic { color:var(--accent); margin-bottom:15px; }
        .newcard h3 { font-family:'Space Grotesk', sans-serif; margin:0 0 7px; font-size:15.5px; font-weight:600; color:var(--ink); }
        .newcard p { margin:0; font-size:13.5px; color:var(--body); line-height:1.5; }
        .badge { position:absolute; top:14px; right:14px; font-family:'IBM Plex Mono', monospace; font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#0c0f16; background:var(--amber); border-radius:4px; padding:3px 7px; }

        .android { display:flex; align-items:center; gap:22px; flex-wrap:wrap; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:26px 28px; }
        .android-ic { width:56px; height:56px; border-radius:14px; background:var(--accent-soft); color:var(--accent); display:grid; place-items:center; flex-shrink:0; }
        .android .txt { flex:1; min-width:220px; }
        .android .txt b { font-family:'Space Grotesk', sans-serif; display:block; font-size:18px; font-weight:700; color:var(--ink); margin-bottom:4px; }
        .android .txt span { font-size:14px; color:var(--muted); }

        .who { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
        .who-card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:28px; }
        .who-ic { width:42px; height:42px; border-radius:11px; background:var(--accent-soft); color:var(--accent); display:grid; place-items:center; margin-bottom:16px; }
        .who-card h3 { font-family:'Space Grotesk', sans-serif; margin:0 0 9px; font-size:18px; font-weight:700; color:var(--ink); }
        .who-card p { margin:0; font-size:14px; color:var(--body); }

        footer { border-top:1px solid var(--line); padding:44px 0 56px; }
        .foot { display:grid; grid-template-columns:1.6fr 1fr 1fr; gap:36px; }
        .foot h4 { font-family:'IBM Plex Mono', monospace; font-size:11px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); margin:0 0 14px; }
        .foot .origin { font-size:14px; color:var(--body); line-height:1.7; max-width:440px; }
        .foot .origin b { color:var(--body-2); }
        .foot .stack { font-size:14px; color:var(--body); line-height:1.9; }
        .foot-links { display:flex; flex-direction:column; gap:10px; font-size:14px; }
        .foot-links a { color:var(--ink); text-decoration:none; display:inline-flex; align-items:center; gap:7px; }
        .foot-links a svg { color:var(--accent); }
        .foot-links a:hover { color:var(--accent); }

        @media (max-width:860px) {
          .flow-steps { grid-template-columns:1fr 1fr; row-gap:26px; }
          .flow-steps::before, .flow-fill { display:none; }
          .fstep p { max-width:none; }
          .steps { grid-template-columns:1fr 1fr; }
          .groups { grid-template-columns:1fr; }
          .new-grid { grid-template-columns:1fr 1fr; }
          .who { grid-template-columns:1fr; }
          .foot { grid-template-columns:1fr; gap:28px; }
        }
        @media (max-width:520px) {
          .steps, .new-grid { grid-template-columns:1fr; }
          .hero h1 { font-size:34px; }
        }
      `}</style>

      <div className="wrap">
        {/* NAV */}
        <nav className="nav">
          <div className="brand">
            <span className="dot" />
            SmartJobTracker
          </div>
          <button onClick={onLogin} className="btn btn-primary">Se connecter avec Google</button>
        </nav>

        {/* HERO */}
        <header className="hero">
          <span className="pill">Votre recherche d’emploi, enfin organisée</span>
          <h1 className="display">Toutes vos candidatures, au <span className="hl">même endroit, au calme</span>.</h1>
          <p className="lede">SmartJobTracker lit votre boîte mail, suit chaque candidature, adapte votre CV, vous entraîne à l’oral et vous aide à peser l’offre — pour gérer 15 à 50 candidatures en parallèle sans y passer vos soirées.</p>
          <div className="ctas">
            <button onClick={onLogin} className="btn btn-primary">Se connecter avec Google</button>
            <a href="https://github.com/deviloufr-ai/jobtracking" target="_blank" rel="noreferrer" className="btn btn-ghost">
              <Icon name="github" size={17} /> Voir le code
            </a>
          </div>
          <p className="free">Gratuit pour commencer — 15 actions IA offertes. Ensuite, branchez votre propre clé API gratuite (Claude, Gemini ou OpenAI). Vos données restent les vôtres.</p>

          {/* LIFECYCLE */}
          <div className="flow">
            <div className="flow-label">Chaque candidature suit le même pipeline simple — tenu à jour pour vous.</div>
            <div className="flow-steps">
              <div className="flow-fill" />
              {[
                ['01', 'Envoyée', 'Repérée dans Gmail et créée toute seule — aucune saisie.', true],
                ['02', 'En cours', 'Le statut évolue à chaque réponse, relance et refus.', true],
                ['03', 'Entretien', 'CV adapté, réponses STAR et entretien blanc vocal — prêt le jour J.', false],
                ['04', 'Offre', 'Comparez, négociez, décidez. L’historique reste pour la suite.', false],
              ].map(([n, title, desc, on]) => (
                <div key={n} className={`fstep${on ? ' on' : ''}`}>
                  <div className="fnode">{n}</div>
                  <h4>{title}</h4>
                  <p>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* HOW IT WORKS */}
        <section className="section">
          <div className="head">
            <div className="kick">Comment ça marche</div>
            <h2 className="display">Du chaos de la boîte mail à une prochaine action claire.</h2>
          </div>
          <div className="steps">
            {[
              ['1', 'Ajouter', 'Connectez Gmail, prenez une capture, utilisez l’extension, ou cherchez des offres dans l’app.'],
              ['2', 'Organiser', 'Les candidatures se rangent seules. Statuts, réponses et refus détectés automatiquement.'],
              ['3', 'Préparer', 'Adaptez un CV, rédigez la relance et entraînez-vous à l’oral, à voix haute.'],
              ['4', 'Décider', 'Comparez les offres, préparez la négociation et voyez ce qui marche vraiment.'],
            ].map(([n, title, desc]) => (
              <div key={n} className="step">
                <div className="n">{n}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURE GROUPS */}
        <section className="section">
          <div className="head">
            <div className="kick">Ce que vous obtenez</div>
            <h2 className="display">Un seul outil pour tout le parcours.</h2>
            <p>De la première candidature à l’offre signée — organiser, rédiger, s’entraîner et décider, sans jamais ouvrir un tableur.</p>
          </div>
          <div className="groups">
            {GROUPS.map((g) => (
              <div key={g.title} className="group">
                <div className="group-top">
                  <span className="group-ic"><Icon name={g.icon} size={22} /></span>
                  <h3>{g.title}</h3>
                </div>
                <p className="lead">{g.lead}</p>
                <ul className="flist">
                  {g.items.map(([t, d]) => (
                    <li key={t}>
                      <span className="li-ic"><Icon name="check" size={17} strokeWidth={2} /></span>
                      <span><b>{t}</b> — {d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* NEW */}
        <section className="section">
          <div className="head">
            <div className="kick">Nouveau</div>
            <h2 className="display">Tout frais de l’atelier.</h2>
            <p>Les dernières nouveautés vous emmènent jusqu’à la signature — trouver le poste, préparer l’entretien, conclure.</p>
          </div>
          <div className="new-grid">
            {NEW.map((c) => (
              <div key={c.title} className="newcard">
                <span className="badge">Nouveau</span>
                <div className="nc-ic"><Icon name={c.icon} size={24} /></div>
                <h3>{c.title}</h3>
                <p>{c.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ANDROID */}
        <section className="section">
          <div className="head">
            <div className="kick">Android</div>
            <h2 className="display">Emportez-la partout.</h2>
            <p>La même app, en natif sur Android et synchronisée avec le web. Installez l’APK directement — autorisez les « sources inconnues » à l’invite.</p>
          </div>
          <div className="android">
            <span className="android-ic"><Icon name="smartphone" size={28} /></span>
            <div className="txt">
              <b>SmartJobTracker pour Android</b>
              <span>Téléchargement direct · Android 7+ · synchronisé avec le web</span>
            </div>
            <a href="/smartjobtracker.apk" download className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
              <Icon name="download" size={17} /> Télécharger l’APK
            </a>
          </div>
        </section>

        {/* WHO */}
        <section className="section">
          <div className="head">
            <div className="kick">Pour qui</div>
            <h2 className="display">Fait pour une vraie recherche active.</h2>
          </div>
          <div className="who">
            {WHO.map((w) => (
              <div key={w.title} className="who-card">
                <span className="who-ic"><Icon name={w.icon} size={22} /></span>
                <h3>{w.title}</h3>
                <p>{w.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FOOTER */}
        <footer>
          <div className="foot">
            <div>
              <h4>À propos de SmartJobTracker</h4>
              <p className="origin">Créé par <b>Alexandre Leblanc</b> — product manager senior lassé de gérer sa propre recherche d’emploi dans un tableur. Ce qui a commencé comme un remède personnel est devenu un vrai produit, et la démonstration de ce qu’un PM peut livrer seul à l’intersection du product thinking, du low-code et de l’IA. Projet personnel, en développement continu.</p>
            </div>
            <div>
              <h4>Construit avec</h4>
              <div className="stack">
                React · Tailwind · Vite<br />
                Vercel serverless<br />
                Claude, Gemini ou OpenAI (votre clé)<br />
                Gmail &amp; Agenda<br />
                Supabase (comptes + synchro)
              </div>
            </div>
            <div>
              <h4>Liens</h4>
              <div className="foot-links">
                <a href="https://smartjobtracker.com" target="_blank" rel="noreferrer"><Icon name="arrow" size={15} /> smartjobtracker.com</a>
                <a href="https://github.com/deviloufr-ai/jobtracking" target="_blank" rel="noreferrer"><Icon name="arrow" size={15} /> GitHub</a>
                <a href="/privacy-policy.html" target="_blank" rel="noreferrer"><Icon name="arrow" size={15} /> Politique de confidentialité</a>
                <a href="/terms-of-service.html" target="_blank" rel="noreferrer"><Icon name="arrow" size={15} /> Conditions d’utilisation</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
