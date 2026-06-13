export default function PrivacyPolicy({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto">
      <div className="min-h-screen flex items-start justify-center pt-8 pb-8">
        <div className="bg-white rounded-xl max-w-4xl w-full mx-4 p-8 shadow-2xl">
          <button
            onClick={onClose}
            className="float-right text-gray-500 hover:text-gray-700 text-2xl"
          >
            ✕
          </button>

          <h1 className="text-3xl font-bold text-gray-900 mb-8">Politique de Confidentialité</h1>

          <div className="prose prose-sm max-w-none text-gray-700 space-y-6">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">1. Introduction</h2>
              <p>
                JobTrackr (« l'Application ») est engagée à protéger votre vie privée. Cette Politique de Confidentialité explique comment nous collectons, utilisons, divulguons et traitons vos données personnelles.
              </p>
              <p>
                <strong>Principe fondamental:</strong> Vos données vous appartiennent. Nous ne les vendons jamais à des tiers. Elles sont stockées de manière sécurisée et traitées uniquement pour améliorer votre expérience.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">2. Données Collectées</h2>
              <p className="font-semibold">Données d'authentification:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Email Google (via OAuth Google)</li>
                <li>Nom et photo de profil (le cas échéant)</li>
                <li>Token d'accès Gmail (stocké localement sur votre appareil)</li>
              </ul>

              <p className="font-semibold mt-4">Données de candidatures:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Informations des offres d'emploi (entreprise, poste, lien, description)</li>
                <li>Historique des candidatures et statuts</li>
                <li>Emails échangés avec les recruteurs (parsés depuis Gmail)</li>
                <li>Dates d'entretiens (récupérées depuis Google Calendar)</li>
                <li>Notes personnelles et mémos</li>
              </ul>

              <p className="font-semibold mt-4">Données de CV:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Fichiers PDF uploadés</li>
                <li>Texte extrait et versions adaptées</li>
              </ul>

              <p className="font-semibold mt-4">Données de profil:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Informations professionnelles optionnelles (expérience, compétences, etc.)</li>
                <li>Préférences et paramètres de l'application</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">3. Comment Nous Utilisons Vos Données</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Fonctionnalité de base:</strong> Traiter et afficher vos candidatures</li>
                <li><strong>Sync Gmail/Calendar:</strong> Récupérer et enrichir automatiquement vos données</li>
                <li><strong>Analyse IA:</strong> Générer des réponses STAR, des relances, adapter votre CV (via Claude API)</li>
                <li><strong>Recommandations:</strong> Identifier les relances en retard, entretiens imminents</li>
                <li><strong>Amélioration:</strong> Analyser les tendances d'utilisation (anonymisées) pour améliorer l'app</li>
                <li><strong>Communication:</strong> Vous envoyer des notifications sur l'app ou par email</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">4. Stockage et Sécurité</h2>
              <p className="font-semibold">Où vos données sont stockées:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Appareil local:</strong> localStorage pour cache et paramètres</li>
                <li><strong>Supabase:</strong> Base de données sécurisée pour sync multi-device (chiffrement en transit TLS 1.2+)</li>
                <li><strong>Google APIs:</strong> Nous n'hébergeons pas vos emails - Gmail API les récupère en lecture seule</li>
              </ul>

              <p className="font-semibold mt-4">Sécurité:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Tokens OAuth stockés localement, jamais sur nos serveurs</li>
                <li>Pas de mots de passe stockés (authentification via Google OAuth uniquement)</li>
                <li>Chiffrement des données en transit (HTTPS/TLS)</li>
                <li>Accès aux données contrôlé par authentification</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">5. Partage de Données Tierces</h2>
              <p className="font-semibold">Nous partageons vos données UNIQUEMENT avec:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Google:</strong> OAuth, Gmail API, Calendar API (à votre demande explicite)</li>
                <li><strong>Anthropic:</strong> Claude API pour traitement IA (voir détails ci-dessous)</li>
                <li><strong>Adzuna:</strong> API de recherche d'emploi (requêtes volontaires uniquement)</li>
                <li><strong>Supabase:</strong> Stockage de données de sync multi-device</li>
              </ul>

              <p className="font-semibold mt-4">Traitement IA (Claude API):</p>
              <p>
                Quand vous utilisez des features IA (STAR, relances, CV adaptatif), le contenu est envoyé à Anthropic (Claude) via proxy Vercel Serverless. Le texte est traité temporairement et n'est pas utilisé pour entraîner les modèles Anthropic. Voir la <a href="https://www.anthropic.com/privacy" className="text-indigo-600 hover:underline" target="_blank" rel="noreferrer">Privacy Policy Anthropic</a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">6. Droits de l'Utilisateur</h2>
              <p>Vous avez le droit de:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Accéder:</strong> Télécharger vos données en JSON (Settings → Données)</li>
                <li><strong>Rectifier:</strong> Modifier vos informations à tout moment</li>
                <li><strong>Supprimer:</strong> Effacer toutes vos données (Settings → Données → Réinitialiser)</li>
                <li><strong>Porter:</strong> Exporter vos candidatures pour utiliser ailleurs</li>
                <li><strong>Retirer le consentement:</strong> Déconnecter votre compte Google</li>
              </ul>

              <p className="font-semibold mt-4">Pour exercer ces droits, contactez: deviloufr@gmail.com</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">7. Cookies & Tracking</h2>
              <p>
                <strong>Pas de cookies de tracking.</strong> JobTrackr n'utilise pas de cookies pour vous tracker ou vous profiler. Les données stockées le sont uniquement pour la fonctionnalité de l'app.
              </p>
              <p className="mt-2">
                Vercel (hébergeur) peut utiliser des analytics anonymisées. Vous pouvez vous en exempter via les paramètres de votre navigateur.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">8. Conformité Légale</h2>
              <p>
                JobTrackr respecte le RGPD (Règlement Général sur la Protection des Données) pour les utilisateurs en Europe et les lois de confidentialité applicables dans votre juridiction.
              </p>
              <p className="mt-2">
                Si vous avez des préoccupations, vous pouvez contacter l'autorité de protection des données de votre pays.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">9. Modifications de Cette Politique</h2>
              <p>
                Nous pouvons mettre à jour cette Politique à tout moment. Les changements significants seront communiqués via l'app ou par email. Votre utilisation continue implique l'acceptation des changements.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">10. Contact</h2>
              <p>
                Pour toute question sur cette Politique de Confidentialité:
              </p>
              <p className="mt-2">
                <strong>Email:</strong> deviloufr@gmail.com<br/>
                <strong>Projet:</strong> <a href="https://github.com/deviloufr-ai/jobtracking" className="text-indigo-600 hover:underline" target="_blank" rel="noreferrer">GitHub JobTrackr</a>
              </p>
            </section>

            <section className="border-t pt-6 mt-8">
              <p className="text-sm text-gray-500">
                <strong>Dernière mise à jour:</strong> Janvier 2026<br/>
                <strong>Version:</strong> 1.0
              </p>
            </section>
          </div>

          <button
            onClick={onClose}
            className="mt-8 w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 font-semibold"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
