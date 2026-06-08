# User Stories Enrichies - JobTrackr

## 1. Capture et Import de Candidatures via Extension Firefox

**Statut**: Production ✅  
**Priorité**: Critique | **Complexité**: Haute  
**Propriétaire**: Alexandre Leblanc

### Description
L'utilisateur peut installer une extension Firefox qui capture automatiquement les offres d'emploi depuis n'importe quel site web (LinkedIn, Glassdoor, Indeed, etc.) et envoie les données au tracker JobTrackr via URL parameters ou localStorage.

### Contexte Technique
- **Fichiers**: `/jobtrackr-extension/manifest.json`, `content.js`, `background.js`
- **Commits clés**: `257b9af`, `11c3901`, `863eee7`, `a5e61fd`, `da23669`
- **API**: Claude Vision pour extraction intelligente du contenu page
- **Stockage**: URL parameters + localStorage

### Critères d'Acceptation
- ✅ Extension installe et charge correctement en Firefox
- ✅ Content script capture le texte complet de la page
- ✅ Claude Vision analyse la page et extrait: titre, entreprise, lieu, description, salaire, lien JD
- ✅ Bouton "✦ Ajouter candidature" injecté dans le DOM du champ input (pas position:fixed)
- ✅ Autofill détecte et remplit les champs: titre, entreprise, description
- ✅ Fonctionne sur formulaires Easy Apply LinkedIn
- ✅ Détection automatique des formulaires ATS (Ashby, Greenhouse, Lever, Workable, TeamTailor)
- ✅ Aucune mutation DOM React (utilise requestAnimationFrame)
- ✅ Approuvé par AMO (Mozilla Add-ons Store) - données de collection minimales

### Zones d'Ombre / Edge Cases
- ⚠️ Sites avec JavaScript hautement obfusqué (difficile à parser)
- ⚠️ Formulaires multi-étapes avec chargement dynamique
- ⚠️ Pages protégées par paywall ou authentification
- ⚠️ Compatibilité future avec nouvelles versions LinkedIn UI

### Ressources
- 📄 Code: `jobtrackr-extension/`
- 📋 Notion: Backlog DB pour bugs extension
- 🔗 AMO: https://addons.mozilla.org/ (future submission)

---

## 2. Synchronisation Gmail et Extraction de Statuts

**Statut**: Production ✅  
**Priorité**: Critique | **Complexité**: Haute  
**Propriétaire**: Alexandre Leblanc

### Description
L'utilisateur se connecte avec OAuth Gmail et le système parse automatiquement les emails reçus des entreprises pour extraire les statuts (réception, présélection, entretien, rejet, offre) et les dates correspondantes.

### Contexte Technique
- **Fichiers**: `src/services/gmail.js`, `src/services/claude.js`, `src/components/GmailImport.jsx`
- **Stack**: OAuth 2.0 (Google), Claude Haiku API en batch (15 emails/appel)
- **Méthode**: 6 requêtes parallèles groupées par label Gmail
- **Commits clés**: `19cf657` (réduire faux positifs)

### Critères d'Acceptation
- ✅ OAuth Gmail initie correctement et persiste le token
- ✅ Récupère emails depuis: inbox, sent, archive avec labels personnalisés
- ✅ Extrait: date reçue, entreprise, titre poste, statut (rejected, interview, offer, etc)
- ✅ Batch processing: max 15 emails par appel Claude (optimisation coûts)
- ✅ Gère les doublets d'emails (mêmes envoyeurs, même date → fusionné)
- ✅ Détecte automatiquement les rejets ATS (Ashby, Greenhouse, etc)
- ✅ Convertit et stocke dates en format ISO 8601
- ✅ Gère expiration token (rafraîchissement localStorage)

### Zones d'Ombre / Edge Cases
- ⚠️ **Groupement dates**: Emails reçus le même jour parfois mal groupés → amélioration prompt Claude.js
- ⚠️ **Expiration token**: Token OAuth expire ~1h, actuellement contourné par localStorage (sécurité?)
- ⚠️ **Faux positifs**: Emails auto/spam ressemblant à réponses d'entreprise
- ⚠️ **Parsing multilangue**: Support FR/EN/JP non homogène
- ⚠️ **Intégration Calendar**: Dates d'entretien pas toujours dans Gmail

### Ressources
- 📄 Code: `src/services/gmail.js`, `claude.js`
- 🔗 Gmail API: https://developers.google.com/gmail/api
- 📊 Debug panel: Toggle "Force Import" dans UI

---

## 3. Gestion Timeline et Historique des Candidatures

**Statut**: Production ✅  
**Priorité**: Élevée | **Complexité**: Moyenne  
**Propriétaire**: Alexandre Leblanc

### Description
Chaque candidature affiche une timeline détaillée: dates d'actions (envoi, réception feedback, entretien, offre), notes utilisateur, événements enrichis automatiquement (Gmail, Calendar).

### Contexte Technique
- **Fichiers**: `src/components/JobRow.jsx`, `src/services/enrichTimeline.js`
- **Stockage**: localStorage avec structure: `{jobId: {timeline: [{date, action, source}]}}`
- **Enrichissement**: Auto-fusion Gmail + Calendar + notes manuelles

### Critères d'Acceptation
- ✅ Affiche chronologiquement: envoi CV, feedback reçu, date entretien, offre, rejet
- ✅ Notes avec ` | ` → split en entrées timeline distinctes (`splitPipeNotes`)
- ✅ Fusion automatique entrées même-date (`mergeSameDateEntries`)
- ✅ Import Gmail popule timeline avec email parsing Claude
- ✅ Calendar events (Google Calendar) enrichissent timeline avec lien Zoom/Teams
- ✅ Éditable: utilisateur peut ajouter/modifier/supprimer étapes manuellement
- ✅ Couleurs/icônes par statut pour clarté visuelle

### Zones d'Ombre / Edge Cases
- ⚠️ **Doublets timeline**: Même événement importé 2x (Gmail + Calendar)
- ⚠️ **Timezones**: Fuseaux horaires non normalisés, entrées peuvent être décalées
- ⚠️ **Événements partiels**: Entretien sans date confirmée (date approximative?)
- ⚠️ **Notes en markdown**: Pas de support markdown dans timeline

### Ressources
- 📄 Code: `src/services/enrichTimeline.js`
- 📋 Business Rules: Auto-archive `sent/reviewing/waiting` après 60j sans réponse

---

## 4. Gestion des Statuts et Auto-Archive

**Statut**: Production ✅  
**Priorité**: Élevée | **Complexité**: Basse  
**Propriétaire**: Alexandre Leblanc

### Description
Le système gère 10 statuts de candidature et archive automatiquement les vieilles candidatures selon des règles métier (60j sans réponse, 90j après rejet).

### Contexte Technique
- **Fichiers**: `src/hooks/useJobs.js`
- **Statuts**: `todo | sent | reviewing | interview | waiting | offer | rejected | rejected_ats | cancelled | archived`
- **Stockage**: localStorage avec timestamp chaque changement statut

### Critères d'Acceptation
- ✅ Interface: chips cliquables pour basculer statut
- ✅ Règle: `sent/reviewing/waiting` + 60j sans changement → archive auto
- ✅ Règle: `rejected/rejected_ats/cancelled` + 90j → archive auto
- ✅ Archive: candidatures non supprimées, archivées dans section dédiée
- ✅ Historique: Chaque changement statut timestamps enregistré
- ✅ Validation: Transition entre statuts sensible (ex: rejected → offer impossible)

### Zones d'Ombre / Edge Cases
- ⚠️ **Ré-activation**: Impossible de passer de `archived` → un autre statut (design?)
- ⚠️ **Timestamps manquants**: Candidatures importées sans date d'envoi initial
- ⚠️ **Edge case**: Offre acceptée → quel statut? (archived ou `offer`?)

### Ressources
- 📄 Code: `src/hooks/useJobs.js`
- 📊 Stats: Affiche counts par statut dans Stats.jsx

---

## 5. Génération de CV Personnalisé par IA

**Statut**: Production ✅  
**Priorité**: Haute | **Complexité**: Haute  
**Propriétaire**: Alexandre Leblanc

### Description
L'utilisateur upload son CV de base (PDF), le système l'analyse, puis l'utilisateur peut générer des versions personnalisées adaptées à chaque offre d'emploi (STAR format, mots-clés JD, etc).

### Contexte Technique
- **Fichiers**: `src/components/CVGenerator.jsx`, `src/components/CVManager.jsx`, `/api/generate-cv.js`, `/api/parse-pdf.js`
- **Stack**: Claude Haiku API, PDF.js (parsing), jsPDF (export)
- **Format sortie**: Markdown éditable + PDF exportable
- **Commits clés**: `a5d137c` (save CV), `6435d1f` (PDF export fix)

### Critères d'Acceptation
- ✅ Upload PDF: parser extrait texte + structure (Claude Document API)
- ✅ Split view: CV original (gauche) / version générée (droite)
- ✅ Génération: Analyse JD offre → remaniement CV (STAR format, matching keywords)
- ✅ Éditable: Markdown éditeur pour retouches manuelles
- ✅ Export PDF: Markdown → PDF stylisé, couleurs/mises en page
- ✅ Sauvegarde: CVs générés attachés à candidature, réutilisables
- ✅ Historique: Multiple versions per candidature sauvegardées

### Zones d'Ombre / Edge Cases
- ⚠️ **Format PDF**: Parsing peut échouer sur PDFs scanisés ou complexes
- ⚠️ **Qualité génération**: STAR format fonctionne mal si CV manque contexte chiffré
- ⚠️ **Longeur**: CV long (4+ pages) → genération fragmentée/incomplète
- ⚠️ **Coûts API**: Chaque génération appelle Claude (cumul si test multiples)
- ⚠️ **Édition markdown**: Utilisateur novice en markdown peut casser formatting

### Ressources
- 📄 Code: `src/components/CVGenerator.jsx`, `/api/generate-cv.js`
- 🔗 Anthropic API: Document parsing via `application/pdf`
- 📋 TODO: Supabase integration pour persistance CV long-terme

---

## 6. Conseil IA Personnalisé par Statut

**Statut**: Production ✅  
**Priorité**: Moyenne | **Complexité**: Basse  
**Propriétaire**: Alexandre Leblanc

### Description
Affichage dynamique de conseils/actionnables selon le statut actuel de la candidature (après envoi: "relancer dans 7j?", en entretien: "préparez vos questions", etc).

### Contexte Technique
- **Fichiers**: `src/components/AdvicePanel.jsx`, `src/components/NextAction.jsx`
- **Stack**: Use case rules hardcodées + Claude Haiku pour advice perso
- **Données**: Tire de JobRow + timeline pour context

### Critères d'Acceptation
- ✅ Affichage: Panneaux fixes par statut avec conseils génériques
- ✅ AI Advice: "Conseils Personnalisés" → appel Claude avec contexte candidature
- ✅ NextAction: Boutons "⚡ Urgent" (relancer, rejet) + "🗺️ Prochaines étapes"
- ✅ Use cases: Logique conditionnelle par statut (reviewing → 7j timeout warning)

### Zones d'Ombre / Edge Cases
- ⚠️ **Timing**: NextAction buttons pas de timer visible (utilisateur oublie relances)
- ⚠️ **Multi-langue**: Conseils hardcodés en FR, pas de switch langage
- ⚠️ **Contexte limité**: Advice ne voit pas JD/entreprise metadata

### Ressources
- 📄 Code: `src/components/AdvicePanel.jsx`, `NextAction.jsx`
- 🔗 Use cases rules: Codées dans mapping status → conseil

---

## 7. Recherche et Import d'Offres via Adzuna

**Statut**: Production ✅  
**Priorité**: Moyenne | **Complexité**: Moyenne  
**Propriétaire**: Alexandre Leblanc

### Description
Tab "Recherche Emploi" permet de chercher des offres sur Adzuna, filtrer par localisation/mots-clés, et importer directement des offres vers le tracker.

### Contexte Technique
- **Fichiers**: `src/components/JobSearch.jsx`, `/api/adzuna.js`
- **API**: Adzuna proxy (évite CORS)
- **Stack**: React hooks, Adzuna API credentials

### Critères d'Acceptation
- ✅ Barre recherche: keywords + location + contrat type
- ✅ Résultats: Pagination, affichage titre/entreprise/salaire/description
- ✅ Import: Bouton "Ajouter à candidatures" crée JobRow avec description
- ✅ Proxy API: `/api/adzuna.js` appelle Adzuna sans exposer credentials
- ✅ Fallback: Si API down, affiche message d'erreur gracieux

### Zones d'Ombre / Edge Cases
- ⚠️ **Couverture géographique**: Limité à certains pays (FR/UK/US)
- ⚠️ **Fraîcheur données**: Adzuna pas en temps réel, parfois offres expiré
- ⚠️ **Rate limiting**: API Adzuna peut throttle, UI doit gérer
- ⚠️ **Doublons**: Même offre réindexée 2x, confusion utilisateur

### Ressources
- 📄 Code: `src/components/JobSearch.jsx`, `/api/adzuna.js`
- 🔗 Adzuna API: https://developer.adzuna.com/
- 🔑 Credentials: `VITE_ADZUNA_APP_ID`, `VITE_ADZUNA_APP_KEY` (Vercel env)

---

## 8. Statistiques et Dashboards

**Statut**: Production ✅  
**Priorité**: Moyenne | **Complexité**: Basse  
**Propriétaire**: Alexandre Leblanc

### Description
Dashboard affiche 4 stat cards: Total candidatures, En cours, Offres, Taux succès (interviews/envois).

### Contexte Technique
- **Fichiers**: `src/components/Stats.jsx`
- **Calcul**: Filtre jobs par statut depuis useJobs hook
- **Stockage**: Calcul temps réel depuis localStorage

### Critères d'Acceptation
- ✅ Card 1: Total candidatures (somme tous statuts)
- ✅ Card 2: En cours (sent + reviewing + interview + waiting)
- ✅ Card 3: Offres (offer count)
- ✅ Card 4: Taux succès (interviews / sent)
- ✅ Mise à jour temps réel quand candidature changée
- ✅ UI: Tailwind cards avec icons, couleurs par metric

### Zones d'Ombre / Edge Cases
- ⚠️ **Formule taux succès**: Numérateur = interviews ou entretiens lancés?
- ⚠️ **Doublets**: Si même offre importée 2x, stats gonflées
- ⚠️ **Périodicité**: Stats globales (tout temps) ou par trimestre?

### Ressources
- 📄 Code: `src/components/Stats.jsx`
- 📊 Données: `useJobs()` hook

---

## 9. Filtres et Recherche

**Statut**: Production ✅  
**Priorité**: Moyenne | **Complexité**: Basse  
**Propriétaire**: Alexandre Leblanc

### Description
Barre de filtres: recherche texte (titre/entreprise), sélection période (ce mois, 3 mois, tout), statut chips cliquables.

### Contexte Technique
- **Fichiers**: `src/components/Filters.jsx`
- **State**: Remonte à App.jsx (global state)
- **Filtrage**: Pattern matching texte + date range + status chips

### Critères d'Acceptation
- ✅ Input recherche: Match titre OU entreprise (case-insensitive)
- ✅ Period selector: "Ce mois" / "3 mois" / "Tout" (change date filter)
- ✅ Status chips: Click togle on/off, multi-select possible
- ✅ Reset: Bouton clear tous filtres
- ✅ Résultats dynamiques: Table JobRow rafraîchit instantanément

### Zones d'Ombre / Edge Cases
- ⚠️ **Recherche**: Pas de fuzzy search (typos → aucun résultat)
- ⚠️ **Logique**: AND/OR? (recherche + status = AND?)
- ⚠️ **Unicode**: Accents non gérés (recherche "café" ≠ "cafe")

### Ressources
- 📄 Code: `src/components/Filters.jsx`

---

## 10. Intégration Google Calendar

**Statut**: En développement 🔄  
**Priorité**: Haute | **Complexité**: Haute  
**Propriétaire**: Alexandre Leblanc

### Description
Synchronisation bidirectionnelle: importer événements Calendar (entretiens) automatiquement → timeline, exporter dates confirmées → GCal.

### Contexte Technique
- **Fichiers**: `src/components/CalendarWidget.jsx`, `src/services/enrichTimeline.js`
- **API**: Google Calendar OAuth
- **Commits clés**: Plusieurs fixes récents sur meeting visibility

### Critères d'Acceptation
- ✅ OAuth: Connecter Google Calendar
- ✅ Import: Fetch events passés + futurs, matcher à candidatures
- ✅ Timeline: Ajouter événements Calendar dans timeline (lien Zoom/Teams)
- ✅ Export: Créer GCal event depuis entretien confirmé dans JobRow
- ✅ Widget: Affiche meetings à venir dans sidebar
- ✅ Gestion Timezone: Normaliser fuseaux horaires

### Zones d'Ombre / Edge Cases
- ⚠️ **Matching**: Titre event Calendar peut pas correspondre à candidature
- ⚠️ **Récurrence**: Événement d'entretien posé en série?
- ⚠️ **Confidentialité**: Afficher détails event dans timeline?
- ⚠️ **Sync duplex**: Maj dans app → GCal prend temps (lag sync)
- ⚠️ **Meeting same-day greyed out**: Bug sur affichage réunions même jour (cf commit cd6b56d)

### Ressources
- 📄 Code: `src/components/CalendarWidget.jsx`
- 🔗 Google Calendar API: https://developers.google.com/calendar
- 🐛 Known issue: "meetings greyed out same-day + calendar week counter reset" (cd6b56d)

---

## 11. STAR Generator pour Entretiens

**Statut**: Production ✅  
**Priorité**: Moyenne | **Complexité**: Basse  
**Propriétaire**: Alexandre Leblanc

### Description
Tool pour préparer réponses entretien format STAR (Situation, Task, Action, Result) en analysant CV + JD.

### Contexte Technique
- **Fichiers**: `src/components/STARGenerator.jsx`
- **Stack**: Claude Haiku API pour génération
- **Entrée**: Contexte JD + experience CV

### Critères d'Acceptation
- ✅ Interface: Input "question entretien"
- ✅ Génération: Claude STAR structure réponse
- ✅ Output: 4 sections structurées (Situation, Task, Action, Result)
- ✅ Éditable: Markdown editor pour refine
- ✅ Export: Copy to clipboard / PDF

### Zones d'Ombre / Edge Cases
- ⚠️ **Contenu**: Génération peut être générique si CV sparse
- ⚠️ **Langage**: Support FR/EN (JP?)
- ⚠️ **Timing**: Génération lente si Claude API throttling

### Ressources
- 📄 Code: `src/components/STARGenerator.jsx`

---

## 12. Email Draft Assistant

**Statut**: Production ✅  
**Priorité**: Moyenne | **Complexité**: Basse  
**Propriétaire**: Alexandre Leblanc

### Description
Tool pour générer brouillons emails professionnels: relances, négociation offre, refus polite.

### Contexte Technique
- **Fichiers**: `src/components/EmailDraft.jsx`
- **Stack**: Claude Haiku API
- **Templates**: Logique hardcodée par type email (relance, refus, acceptation)

### Critères d'Acceptation
- ✅ Selector: Type email (relance, rejet, offre acceptée, négociation)
- ✅ Génération: Claude forge contenu personnalisé avec contexte JD/timeline
- ✅ Output: Markdown éditeur pour retouches
- ✅ Copy: Bouton copy to clipboard (prêt Gmail)
- ✅ Tone: Options formalité (casual, professionnel, direct)

### Zones d'Ombre / Edge Cases
- ⚠️ **Contenu**: Peut manquer de contexte si email trigger tardif (relance 2 mois après)
- ⚠️ **Langage**: Support multi-langue limité

### Ressources
- 📄 Code: `src/components/EmailDraft.jsx`

---

## 13. Gestion Profil Candidat

**Statut**: Production ✅  
**Priorité**: Basse | **Complexité**: Basse  
**Propriétaire**: Alexandre Leblanc

### Description
Profil utilisateur: Nom, Email, Téléphone, Portfolio, LinkedIn, GitHub, etc. Utilisé pour pré-remplir CVs et signature emails.

### Contexte Technique
- **Fichiers**: `src/components/Settings.jsx`
- **Stockage**: localStorage (Supabase future)
- **Commits clés**: `67471e3` (portfolio field), `16688f2` (developer profile)

### Critères d'Acceptation
- ✅ Form fields: Nom, Email principal, Téléphone, Localisation
- ✅ URL fields: Portfolio, LinkedIn, GitHub, Stack Overflow
- ✅ CV fields: Résumé professionnel (1 ligne), années expérience
- ✅ Persistance: localStorage
- ✅ Utilisation: CVGenerator préremplit avec profil

### Zones d'Ombre / Edge Cases
- ⚠️ **Validation**: Email format, URL valides?
- ⚠️ **Multi-profil**: Une seule "candidature", pas de multi-profil géré

### Ressources
- 📄 Code: `src/components/Settings.jsx`

---

## 14. Notifications et Reminders

**Statut**: Production ✅  
**Priorité**: Basse | **Complexité**: Moyenne  
**Propriétaire**: Alexandre Leblanc

### Description
Bell notifications pour: relance urgente, offre expirée, entretien confirmé, auto-archives.

### Contexte Technique
- **Fichiers**: `src/components/NotificationBell.jsx`
- **Stack**: localStorage events, interval check
- **UI**: Badge count, dropdown history

### Critères d'Acceptation
- ✅ Badge: Count notifications non-lues
- ✅ Types: Relance due, offre 7j expiration, entretien demain, auto-archive
- ✅ Dropdown: Affiche historique notifications
- ✅ Clear: Mark as read, clear all
- ✅ Timing: Check notifications au mount + 30min interval

### Zones d'Ombre / Edge Cases
- ⚠️ **Permissions**: Pas de browser notifications push (future?)
- ⚠️ **Timing**: Interval check peut miss notifications si tab fermée
- ⚠️ **Langage**: Messages hardcodés FR

### Ressources
- 📄 Code: `src/components/NotificationBell.jsx`

---

## 15. Persistance localStorage → Supabase (TODO)

**Statut**: Backlog 📋  
**Priorité**: Haute | **Complexité**: Haute  
**Propriétaire**: À assigner

### Description
Migrer stockage depuis localStorage (limité, pas de sync multi-device) vers Supabase PostgreSQL (persistance, sync temps réel, auth).

### Contexte Technique
- **Cible**: Supabase PostgreSQL + Row Level Security
- **Migration**: Garder localStorage comme fallback (offline-first)
- **Tables**: jobs, cvs, candidat_profile, timeline_events
- **Auth**: OAuth Google (réutiliser Gmail setup)

### Critères d'Acceptation
- ✅ Schema PostgreSQL: Tables jobs, cvs, history, candidat_profile
- ✅ Auth: Supabase RLS politique par utilisateur
- ✅ Sync: Fetch from Supabase au mount, push mutations
- ✅ Offline: localStorage fallback si Supabase down
- ✅ Migration: Script migrate localStorage → Supabase
- ✅ Performance: Pagination/indexing optimisés

### Zones d'Ombre / Edge Cases
- ⚠️ **Timing**: localStorage + Supabase sync lag (conflict resolution?)
- ⚠️ **Données sensibles**: Tokens Gmail dans localStorage → Supabase?
- ⚠️ **Quotas**: Supabase free tier rate limits
- ⚠️ **Multi-device**: Sync temps réel implications (websockets?)

### Ressources
- 🔗 Supabase: https://supabase.com/
- 📋 Notion: Backlog DB pour planning

