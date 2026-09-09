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
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }

        .sjt {
          --paper:#f7f3ec; --card:#fffdf8; --ink:#1e1a15; --body:#4f473d;
          --muted:#8a8175; --line:#e8e1d4; --line-2:#ddd3c2;
          --accent:#b04a24; --accent-dark:#8f3a1a; --accent-soft:#f4e5da;
          background:var(--paper); color:var(--body);
          font-family:'Inter', system-ui, -apple-system, sans-serif;
          line-height:1.6; min-height:100vh; -webkit-font-smoothing:antialiased;
        }
        .sjt ::selection { background:var(--accent-soft); }
        .serif { font-family:'Fraunces', Georgia, 'Times New Roman', serif; font-optical-sizing:auto; }
        .wrap { max-width:1080px; margin:0 auto; padding:0 24px; }

        .nav { display:flex; align-items:center; justify-content:space-between; padding:22px 0; }
        .brand { display:flex; align-items:center; gap:11px; font-weight:600; font-size:17px; color:var(--ink); letter-spacing:-0.01em; }
        .brand-mark { width:28px; height:28px; border-radius:8px; background:var(--accent); color:#fff; display:grid; place-items:center; font-family:'Fraunces',serif; font-weight:600; font-size:16px; }

        .btn { font-family:inherit; font-weight:600; font-size:15px; padding:12px 20px; border-radius:11px; text-decoration:none; display:inline-flex; align-items:center; gap:9px; cursor:pointer; border:1px solid transparent; transition:transform .15s ease, background .15s ease, border-color .15s ease; }
        .btn-primary { background:var(--accent); color:#fff; box-shadow:0 1px 2px rgba(30,26,21,.12); }
        .btn-primary:hover { background:var(--accent-dark); transform:translateY(-1px); }
        .btn-ghost { background:transparent; color:var(--ink); border-color:var(--line-2); }
        .btn-ghost:hover { border-color:var(--ink); }
        .nav .btn { padding:10px 16px; font-size:14px; }

        .kick { font-size:12.5px; font-weight:600; letter-spacing:.09em; text-transform:uppercase; color:var(--accent); margin-bottom:14px; }
        .pill { display:inline-flex; align-items:center; gap:8px; font-size:13px; font-weight:600; letter-spacing:.02em; color:var(--accent-dark); background:var(--accent-soft); padding:6px 13px; border-radius:999px; }

        .hero { padding:38px 0 22px; }
        .hero h1 { font-weight:500; font-size:clamp(37px,5.4vw,60px); line-height:1.04; letter-spacing:-0.022em; color:var(--ink); margin:22px 0 0; max-width:800px; }
        .hl { background:linear-gradient(transparent 60%, var(--accent-soft) 60%); padding:0 .04em; }
        .lede { margin:20px 0 0; font-size:18px; color:var(--body); max-width:610px; }
        .ctas { margin-top:30px; display:flex; gap:12px; flex-wrap:wrap; }
        .free { margin:18px 0 0; font-size:14px; color:var(--muted); max-width:580px; }

        .flow { margin-top:44px; background:var(--card); border:1px solid var(--line); border-radius:18px; padding:26px 28px 24px; box-shadow:0 1px 3px rgba(30,26,21,.05); }
        .flow-label { font-size:13px; color:var(--muted); margin-bottom:22px; }
        .flow-steps { position:relative; display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
        .flow-steps::before { content:""; position:absolute; top:16px; left:6%; right:6%; height:2px; background:var(--line-2); }
        .flow-fill { position:absolute; top:16px; left:6%; height:2px; background:var(--accent); width:0; animation:grow 2.2s cubic-bezier(.6,.02,.3,1) forwards .35s; }
        @keyframes grow { to { width:44%; } }
        .fstep { position:relative; z-index:1; }
        .fnode { width:34px; height:34px; border-radius:50%; border:2px solid var(--line-2); background:var(--paper); display:grid; place-items:center; font-size:12.5px; font-weight:600; color:var(--muted); }
        .fstep.on .fnode { border-color:var(--accent); background:var(--accent); color:#fff; }
        .fstep h4 { margin:13px 0 3px; font-size:14.5px; font-weight:600; color:var(--ink); }
        .fstep p { margin:0; font-size:12.5px; color:var(--muted); line-height:1.45; max-width:180px; }

        .section { padding:54px 0; border-top:1px solid var(--line); }
        .head { max-width:660px; margin-bottom:36px; }
        .head h2 { font-weight:500; font-size:clamp(27px,3.4vw,35px); line-height:1.12; letter-spacing:-0.018em; color:var(--ink); margin:0; }
        .head p { margin:13px 0 0; font-size:16.5px; color:var(--body); }

        .steps { display:grid; grid-template-columns:repeat(4,1fr); gap:22px; }
        .step .n { font-family:'Fraunces',serif; font-size:34px; font-weight:500; color:var(--accent); line-height:1; }
        .step h3 { margin:14px 0 6px; font-size:16px; font-weight:600; color:var(--ink); }
        .step p { margin:0; font-size:14px; color:var(--body); }

        .groups { display:grid; grid-template-columns:repeat(2,1fr); gap:18px; }
        .group { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:28px; box-shadow:0 1px 3px rgba(30,26,21,.04); }
        .group-top { display:flex; align-items:center; gap:13px; margin-bottom:6px; }
        .group-ic { width:42px; height:42px; border-radius:12px; background:var(--accent-soft); color:var(--accent-dark); display:grid; place-items:center; flex-shrink:0; }
        .group h3 { margin:0; font-family:'Fraunces',serif; font-size:21px; font-weight:600; letter-spacing:-0.01em; color:var(--ink); }
        .group .lead { margin:0 0 18px; font-size:14px; color:var(--muted); }
        .flist { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:13px; }
        .flist li { display:flex; gap:11px; align-items:flex-start; font-size:14px; color:var(--body); line-height:1.5; }
        .flist .li-ic { color:var(--accent); flex-shrink:0; margin-top:3px; }
        .flist b { color:var(--ink); font-weight:600; }

        .new-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
        .newcard { position:relative; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:24px 22px; }
        .newcard .nc-ic { color:var(--accent); margin-bottom:15px; }
        .newcard h3 { margin:0 0 7px; font-size:15.5px; font-weight:600; color:var(--ink); }
        .newcard p { margin:0; font-size:13.5px; color:var(--muted); line-height:1.5; }
        .badge { position:absolute; top:15px; right:15px; font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--accent-dark); background:var(--accent-soft); border-radius:6px; padding:3px 7px; }

        .android { display:flex; align-items:center; gap:22px; flex-wrap:wrap; background:var(--card); border:1px solid var(--line); border-radius:18px; padding:26px 28px; box-shadow:0 1px 3px rgba(30,26,21,.04); }
        .android-ic { width:56px; height:56px; border-radius:14px; background:var(--accent-soft); color:var(--accent-dark); display:grid; place-items:center; flex-shrink:0; }
        .android .txt { flex:1; min-width:220px; }
        .android .txt b { display:block; font-family:'Fraunces',serif; font-size:18px; font-weight:600; color:var(--ink); margin-bottom:4px; }
        .android .txt span { font-size:14px; color:var(--muted); }

        .who { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
        .who-card { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:28px; }
        .who-ic { width:42px; height:42px; border-radius:12px; background:var(--accent-soft); color:var(--accent-dark); display:grid; place-items:center; margin-bottom:16px; }
        .who-card h3 { margin:0 0 9px; font-family:'Fraunces',serif; font-size:18px; font-weight:600; color:var(--ink); }
        .who-card p { margin:0; font-size:14px; color:var(--body); }

        footer { border-top:1px solid var(--line); padding:44px 0 56px; }
        .foot { display:grid; grid-template-columns:1.6fr 1fr 1fr; gap:36px; }
        .foot h4 { font-size:12px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin:0 0 14px; }
        .foot .origin { font-size:14px; color:var(--body); line-height:1.7; max-width:440px; }
        .foot .stack { font-size:14px; color:var(--body); line-height:1.9; }
        .foot-links { display:flex; flex-direction:column; gap:10px; font-size:14px; }
        .foot-links a { color:var(--body); text-decoration:none; display:inline-flex; align-items:center; gap:7px; }
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
          .nav .brand span.full { display:none; }
        }
      `}</style>

      <div className="wrap">
        {/* NAV */}
        <nav className="nav">
          <div className="brand">
            <span className="brand-mark">S</span>
            <span className="full">SmartJobTracker</span>
          </div>
          <button onClick={onLogin} className="btn btn-primary">Se connecter avec Google</button>
        </nav>

        {/* HERO */}
        <header className="hero">
          <span className="pill">Votre recherche d’emploi, enfin organisée</span>
          <h1 className="serif">Toutes vos candidatures, au <span className="hl">même endroit, au calme</span>.</h1>
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
            <h2 className="serif">Du chaos de la boîte mail à une prochaine action claire.</h2>
          </div>
          <div className="steps">
            {[
              ['1', 'Ajouter', 'Connectez Gmail, prenez une capture, utilisez l’extension, ou cherchez des offres dans l’app.'],
              ['2', 'Organiser', 'Les candidatures se rangent seules. Statuts, réponses et refus détectés automatiquement.'],
              ['3', 'Préparer', 'Adaptez un CV, rédigez la relance et entraînez-vous à l’oral, à voix haute.'],
              ['4', 'Décider', 'Comparez les offres, préparez la négociation et voyez ce qui marche vraiment.'],
            ].map(([n, title, desc]) => (
              <div key={n} className="step">
                <div className="n serif">{n}</div>
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
            <h2 className="serif">Un seul outil pour tout le parcours.</h2>
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
            <h2 className="serif">Tout frais de l’atelier.</h2>
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
            <h2 className="serif">Emportez-la partout.</h2>
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
            <h2 className="serif">Fait pour une vraie recherche active.</h2>
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
