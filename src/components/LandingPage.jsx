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
          max-width: 560px;
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
          .feature-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      <div className="page">
        {/* NAV */}
        <div className="nav">
          <div className="wordmark">
            <span className="dot"></span>
            JobTrackr
          </div>
          <button onClick={onLogin} className="btn btn-primary">
            Se connecter avec Google
          </button>
        </div>

        {/* HERO */}
        <section className="hero">
          <div className="eyebrow">Copilote IA pour la recherche d'emploi</div>
          <h1>Votre recherche d'emploi mérite un <em>pipeline</em>, pas un tableau Excel qui craque à la 30ᵉ ligne.</h1>
          <p className="lede">JobTrackr synchronise vos emails, détecte les statuts, priorise vos relances et prépare vos entretiens — pour que vous gardiez le contrôle sur 15 à 50 candidatures en parallèle, sans y passer vos soirées.</p>
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
                <div className="stage-desc">Prép. STAR générée, meeting détecté, rappel J-1.</div>
              </div>
              <div className="stage">
                <div className="node">04</div>
                <div className="stage-title">Offre</div>
                <div className="stage-desc">Objectif atteint — le pipeline a fait son travail.</div>
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
              { num: '06 / Outils inadaptés', title: 'CRM lourd ou Excel mort', desc: 'Les CRM sont pensés pour des équipes commerciales. Excel craque dès la 30ᵉ ligne.' }
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

        {/* FEATURES */}
        <section>
          <div className="section-head">
            <div className="kicker">Fonctionnalités</div>
            <h2>Votre allié IA pour gérer la vraie recherche.</h2>
            <p>Tout ce qu'il faut pour organiser, enrichir et accélérer vos candidatures — sans jamais ouvrir un tableur.</p>
          </div>
          <div className="feature-grid">
            {[
              { icon: '📋', title: 'Tableau de bord intelligent', desc: 'Vue d\'ensemble claire de toutes vos candidatures. Filtrez par statut, période, ou mots-clés. Statistiques et tendances en temps réel pour suivre votre progression.' },
              { icon: '📧', title: 'Gmail synchronisé automatiquement', desc: 'Connectez-vous une fois, et vos emails font le travail. L\'IA détecte les offres, les relances, les refus — tout se met à jour sans que vous ayez à saisir quoi que ce soit.' },
              { icon: '⏰', title: 'Historique complet et intelligent', desc: '10 statuts professionnels, détection automatique des refus ATS (Ashby, Greenhouse, Lever...). Un timeline daté pour chaque candidature, consolidé et facile à lire.' },
              { icon: '⚡', title: 'Quoi faire maintenant?', desc: 'Un moteur qui vous dit clairement: qui relancer, quel entretien préparer, où avancer. Alertes classées par urgence pour rester focalisé.' },
              { icon: '📅', title: 'Entretiens bien synchronisés', desc: 'Google Calendar intégré. Les entretiens apparaissent automatiquement avec les liens Zoom/Teams. Rappel J-1, rien n\'est oublié.' },
              { icon: '💌', title: 'Rédaction IA: emails & CVs', desc: 'Brouillons d\'emails intelligents prêts à envoyer. CVs réadaptés par candidature. Lettres de motivation générées en 2 clics. Prêts à copier-coller ou customiser.' },
              { icon: '⭐', title: 'Préparation entretien', desc: '3 réponses STAR générées par fiche de poste. Conseils IA contextualisés. Visualisez votre CV avant export, format une page optimisé.' },
              { icon: '🎯', title: 'Ajouter des candidatures facilement', desc: 'Gmail, screenshot (LinkedIn, job boards), extension Firefox, ou ajout manuel. 4 façons différentes, tous les chemins mènent au pipeline.' },
              { icon: '🎯', title: 'Suivre vos progrès', desc: 'Objectifs de candidatures, taux de réussite, insights personnalisés. Voyez semaine après semaine comment vous avancez vers votre objectif.' },
              { icon: '🤖', title: 'Conseils IA à chaque étape', desc: 'Des suggestions vraiment utiles basées sur votre situation: quand relancer sans être lourd, comment optimiser votre taux de réponse, comment préparer cet entretien.' },
              { icon: '💾', title: 'Sur tous vos appareils', desc: 'Synchronisation instantanée. Accédez à vos candidatures sur le téléphone, la tablette, l\'ordi — tout reste à jour partout.' },
              { icon: '🎨', title: 'Votre style', desc: 'Mode clair, sombre, ou l\'un de nos 6 thèmes spécialisés (midnight, ocean, forest...). Adaptez l\'interface à votre préférence, c\'est synchronisé partout.' },
              { icon: '📊', title: 'Analytics pour s\'améliorer', desc: 'Tendances (candidatures/semaine, taux réponse, velocity). Insights personnalisés pour ajuster votre stratégie et faire mieux la prochaine fois.' },
              { icon: '🔔', title: 'Notifications quand ça compte', desc: 'Alertes pour les nouveaux emails, les relances en retard, les entretiens imminents. Desktop ou in-app, c\'est vous qui choisissez.' },
              { icon: '🔀', title: 'Gestion flexible', desc: 'Sélectionnez plusieurs candidatures à la fois. Fusionnez les doublons automatiquement. Nettoyez et organisez en quelques clics.' },
              { icon: '🔍', title: 'Recherche instantanée', desc: 'Tapez pour chercher: par entreprise, poste, ou mots-clés spécifiques. Résultats en temps réel, jamais d\'attente.' }
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
                desc: 'Gmail, screenshot, extension Firefox, ou ajout manuel — les candidatures arrivent dans votre pipeline.'
              },
              {
                step: '2',
                title: 'Enrichir',
                desc: 'L\'IA analyse vos emails, détecte les statuts, consolide l\'historique, prépare des réponses STAR et des relances.'
              },
              {
                step: '3',
                title: 'Agir',
                desc: 'Suivez les recommandations (relances urgentes, entretiens à préparer). Utilisez les brouillons IA, les CV adaptés, les notes de prep.'
              },
              {
                step: '4',
                title: 'Réussir',
                desc: 'Décrochez l\'offre. Quand c\'est fait, l\'historique reste : analyse de votre stratégie, amélioration continue.'
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
            <h2>6 niveaux d'automatisation, du parsing au coaching entretien.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
            {[
              { icon: '📧', level: 'Niveau 1', title: 'Parsing emails', desc: 'Parse par lots de 15 emails, extraction structurée des offres.' },
              { icon: '🏷️', level: 'Niveau 2', title: 'Détection statut', desc: 'Identifie automatiquement refus ATS, étapes de process, entreprises.' },
              { icon: '⭐', level: 'Niveau 3', title: 'Réponses STAR', desc: 'Génère 3 anecdotes STAR prêtes pour l\'entretien oral.' },
              { icon: '💌', level: 'Niveau 4', title: 'Relances IA', desc: 'Brouillon d\'email contextualisé, détection boîte ATS (pas d\'envoi).' },
              { icon: '📄', level: 'Niveau 5', title: 'CV adaptatif', desc: 'Réécriture PDF selon la JD, optimisation scoring recruteur.' },
              { icon: '🔍', level: 'Niveau 6', title: 'Analyse offre', desc: 'Scrape JD, extrait mots-clés, suggests prep points via extension.' }
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
            <p>JobTrackr ne vous limite pas — c'est pensé pour gérer la vraie charge d'une recherche parallèle massive.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            {[
              { value: '40+', label: 'candidatures actives en parallèle, sans perte d\'information' },
              { value: '100%', label: 'données locales — jamais envoyées à des tiers' },
              { value: '10', label: 'statuts métier granulaires pour classifier chaque étape' },
              { value: '6', label: 'niveaux d\'IA (parsing → coaching d\'entretien)' },
              { value: '12', label: 'requêtes Gmail parallèles au démarrage' },
              { value: '<2s', label: 'temps moyen pour activer une relance IA' },
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
                desc: 'Vous changez de secteur ou démarrez votre carrière. Besoin d\'une stratégie claire, de prep intensive, de feedback sur votre CV.'
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
              <p className="origin">Construit par <b>Alexandre Leblanc</b> — PM Senior, 18 ans d'expérience (gaming, AdTech, Web3, mobile), trilingue FR/EN/JP. JobTrackr est né d'une frustration personnelle en recherche active d'emploi, et est devenu la meilleure démonstration de ce qu'un PM peut livrer seul à l'intersection du product thinking, du no-code/low-code et de l'IA générative. Projet personnel, en développement continu depuis avril 2026, en production depuis la v0.5.</p>
            </div>
            <div>
              <h4>Stack technique</h4>
              <div style={{ fontSize: '13.5px', color: '#9aa3ba', lineHeight: 1.9 }}>
                React · Tailwind · Vite<br/>
                Vercel Serverless<br/>
                Claude Haiku (Anthropic)<br/>
                Gmail & Calendar API<br/>
                Adzuna API<br/>
                localStorage → Supabase
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
