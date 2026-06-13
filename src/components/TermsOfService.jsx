export default function TermsOfService({ onClose }) {
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

          <h1 className="text-3xl font-bold text-gray-900 mb-8">Conditions d'Utilisation</h1>

          <div className="prose prose-sm max-w-none text-gray-700 space-y-6">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">1. Acceptation des Conditions</h2>
              <p>
                En accédant et en utilisant JobTrackr (l'« Application »), vous acceptez d'être lié par ces Conditions d'Utilisation. Si vous n'acceptez pas ces conditions, vous ne devez pas utiliser l'Application.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">2. Licence d'Utilisation</h2>
              <p>
                JobTrackr vous accorde une licence limitée, non-exclusive et révocable pour utiliser l'Application à titre personnel et non-commercial. Vous n'avez pas le droit de:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Reproduire ou dupliquer l'Application</li>
                <li>Revendre ou louer l'Application</li>
                <li>Modifier ou créer des travaux dérivés</li>
                <li>Utiliser l'Application pour un usage commercial sans permission</li>
                <li>Reverse-engineer ou accéder au code source</li>
                <li>Automatiser le scraping ou l'extraction de données</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">3. Compte Utilisateur</h2>
              <p>
                L'Application utilise l'authentification Google OAuth. Vous êtes responsable de:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Maintenir la confidentialité de votre compte Google</li>
                <li>Toutes les activités sous votre compte</li>
                <li>Notifier immédiatement de tout accès non autorisé</li>
              </ul>

              <p className="mt-4">
                Vous ne devez pas utiliser l'Application pour un autre utilisateur ou permettre à d'autres d'accéder via votre compte sans permission explicite.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">4. Utilisation Acceptable</h2>
              <p>Vous acceptez de ne pas utiliser l'Application pour:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Violer des lois ou réglementations</li>
                <li>Harceler, menacer ou intimider d'autres utilisateurs</li>
                <li>Transmettre des virus, malwares ou code malveillant</li>
                <li>Usurper l'identité ou feindre une affiliation</li>
                <li>Collecter ou tracker les données personnelles sans consentement</li>
                <li>Spammer ou envoyer des communications non sollicitées</li>
                <li>Accéder sans autorisation aux systèmes ou données</li>
                <li>Tester la sécurité sans permission écrite</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">5. Contenu Utilisateur</h2>
              <p>
                Vous conservez la propriété de tout contenu que vous uploadez ou créez via l'Application (candidatures, notes, CVs, etc.).
              </p>

              <p className="font-semibold mt-4">Droits d'utilisation:</p>
              <p>
                En uploadant du contenu, vous accordez à JobTrackr une licence pour stocker, afficher et traiter ce contenu pour fournir l'Application, y compris:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Stockage sécurisé (localStorage, Supabase)</li>
                <li>Traitement par IA (parsing d'emails, génération de réponses, adaptation CV)</li>
                <li>Affichage dans votre tableau de bord et rapports</li>
              </ul>

              <p className="mt-4">
                Vous acceptez que vos données soient traitées par des services tiers (Google, Anthropic, Supabase) selon leur politique de confidentialité.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">6. Limitation de Responsabilité</h2>
              <p>
                <strong>Fourni « Tel Quel »:</strong> JobTrackr est fourni sans garantie de quelque sorte. Nous ne garantissons pas:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>L'exactitude ou la complétude des données</li>
                <li>L'accès ininterrompu ou sans erreurs</li>
                <li>Que les recommandations IA augmenteront votre taux d'entretiens ou d'offres</li>
              </ul>

              <p className="font-semibold mt-4">Limitation de dommages:</p>
              <p>
                En aucun cas JobTrackr ne sera responsable pour les dommages indirects, accidentels, spéciaux ou consécutifs (y compris les pertes de profits, de données ou d'opportunités d'emploi) même si informé de la possibilité de tels dommages.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">7. Indemnisation</h2>
              <p>
                Vous acceptez d'indemniser et de défendre JobTrackr contre les réclamations, dommages, pertes ou dépenses (y compris les frais d'avocat) découlant de:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Votre violation de ces Conditions</li>
                <li>Votre utilisation de l'Application</li>
                <li>Votre contenu ou données</li>
                <li>Vos actions envers d'autres utilisateurs</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">8. Résiliation</h2>
              <p>
                Vous pouvez arrêter d'utiliser l'Application à tout moment. JobTrackr peut résilier votre accès:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Immédiatement pour violation de ces Conditions</li>
                <li>Avec préavis si nécessaire pour maintenance ou raisons légales</li>
                <li>Sans responsabilité pour perte de données après résiliation</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">9. Disponibilité et Maintenance</h2>
              <p>
                JobTrackr est fourni sur une base « best effort ». Nous n'offrons aucune garantie de disponibilité continue. L'Application peut être indisponible pour:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Maintenance et mises à jour</li>
                <li>Raisons techniques ou de sécurité</li>
                <li>Raisons hors de notre contrôle</li>
              </ul>

              <p className="mt-2">
                Pendant ces périodes, vous ne pouvez pas accéder à votre compte ou vos données.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">10. Propriété Intellectuelle</h2>
              <p>
                <strong>Code source:</strong> Le code source de JobTrackr est disponible sur <a href="https://github.com/deviloufr-ai/jobtracking" className="text-indigo-600 hover:underline" target="_blank" rel="noreferrer">GitHub sous licence MIT</a>. Vous pouvez l'utiliser selon les termes de cette licence.
              </p>

              <p className="font-semibold mt-4">Marques:</p>
              <p>
                « JobTrackr » et le logo sont des marques d'Alexandre Leblanc. Vous n'avez pas le droit d'utiliser ces marques sans permission écrite.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">11. Données & Sauvegardes</h2>
              <p>
                <strong>Vous êtes responsable des sauvegardes.</strong> Bien que nous utilisions Supabase pour la synchronisation, vous devez:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Exporter régulièrement vos données (Settings → Exporter)</li>
                <li>Maintenir des copies de sauvegarde</li>
              </ul>

              <p className="mt-2">
                JobTrackr ne peut pas être tenu responsable de la perte de données, même si nous les stockons.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">12. Modifications des Conditions</h2>
              <p>
                JobTrackr peut modifier ces Conditions à tout moment. Les changements entrent en vigueur immédiatement après publication. Votre utilisation continue implique l'acceptation des changements.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">13. Loi Applicable & Juridiction</h2>
              <p>
                Ces Conditions sont régies par les lois de la France. Tout différend sera résolu selon les lois françaises et les tribunaux compétents.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-3">14. Contacte & Support</h2>
              <p>
                Pour toute question sur ces Conditions:
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
