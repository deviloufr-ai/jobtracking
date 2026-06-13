export const fr = {
  // Navigation & Tabs
  nav: {
    tabs: {
      tracker: 'Candidatures',
      search: 'Recherche',
      cv: 'Mon CV',
      settings: 'Réglages',
    },
    add: 'Ajouter',
    refresh: 'Synchroniser Gmail & Calendar',
    connectGmail: 'Connecter Gmail',
    lastSync: 'Dernière sync',
    connected: 'Connecté',
  },

  // Extension
  extension: {
    title: 'Extension Firefox JobTrackr active',
    label: 'Extension ✓',
  },

  // Mobile Menu
  mobileMenu: {
    navigation: 'Navigation',
    add: 'Ajouter',
    gmail: 'Gmail',
    gmailSub: 'Sync automatique',
    screenshot: 'Screenshot',
    screenshotSub: "Capture d'écran",
    manual: 'Manuel',
    manualSub: 'Saisie manuelle',
    connectGmail: 'Connecter Gmail',
  },

  // Add Menu
  addMenu: {
    import: 'Importer via',
    gmail: 'Gmail',
    gmailDesc: 'Sync automatique des emails',
    screenshot: 'Screenshot',
    screenshotDesc: "Colle une capture d'écran",
    installExt: 'Installer Extension',
    installExtDesc: "Importer depuis n'importe quelle offre",
    extActive: 'Extension Firefox',
    extActiveDesc: 'Importation activée ✓',
    manual: 'Manuel',
    manualDesc: 'Saisie manuelle',
  },

  // Header & Loading
  header: {
    loading: 'Synchronisation des données',
    loadingDesc: 'Récupération de vos candidatures depuis Supabase...',
  },

  // Job Application Messages
  notifications: {
    applicationAdded: 'Nouvelle candidature ajoutée',
    applicationUpdated: 'candidature mise à jour',
    applicationDeleted: 'Candidature supprimée',
    applicationsImported: 'candidature importée depuis Gmail',
    applicationImportedShort: 'candidature importée !',
    historyUpdated: 'historique mis à jour',
    thankYouEmailSent: 'Email de remerciement envoyé ✓',
    followUpEmailSent: 'Email de relance envoyé ✓',
    allApplicationsCleared: 'Toutes les candidatures ont été effacées (Supabase synchronisé)',
  },

  // Toast Messages
  toast: {
    added: 'Candidature ajoutée !',
    updated: 'Candidature mise à jour',
    deleted: 'Candidature supprimée',
  },

  // Empty States
  empty: {
    noApplications: 'Aucune candidature pour l instant',
    noApplicationsDesc: 'Ajoutez-en une manuellement, importez depuis Gmail ou via screenshot',
    screenshot: '🖼️ Screenshot',
    gmail: '📧 Gmail',
    addManually: '+ Ajouter manuellement',
    noResults: 'Aucune candidature trouvee',
    resetFilters: 'Reinitialiser les filtres',
  },

  // Stats & Actions
  stats: {
    favorites: '⭐ Favoris',
    otherApplications: 'Autres candidatures',
  },

  // Footer Actions
  footer: {
    mergeDuplicates: '🔀 Fusionner les doublons',
    clearAll: '🗑️ Effacer toutes les données',
    clearConfirm: 'Effacer toutes les {{count}} candidatures ? Cette action est irreversible.',
  },

  // Email Templates
  email: {
    thankYouSentTo: 'Email de remerciement envoyé à',
    followUpSentTo: 'Email de relance envoyé à',
  },

  // Settings
  settings: {
    profile: 'Profil',
    goals: 'Objectifs',
    automation: 'Automatisation',
    apiClaude: 'API Claude',
    notifications: 'Notifications',
    followups: 'Rappels',
    appearance: 'Apparence',
    data: 'Données',
    extension: 'Extension',
    language: 'Langue',
  },

  // Job Status Labels
  status: {
    todo: 'À faire',
    sent: 'Envoyée',
    reviewing: 'En examen',
    interview: 'Entretien',
    waiting: 'En attente',
    offer: 'Offre reçue',
    rejected: 'Rejetée',
    rejected_ats: 'Rejetée (ATS)',
    cancelled: 'Annulée',
    archived: 'Archivée',
    done: 'Acceptée',
  },

  // Column Headers
  table: {
    company: 'Entreprise / Poste',
    status: 'Statut',
    date: 'Date',
    notes: 'Notes',
  },

  // Settings Sidebar
  settingsSidebar: {
    profile: 'Profil',
    goals: 'Objectifs',
    automation: 'Automatisation',
    apiClaude: 'API Claude',
    notifications: 'Notifications',
    followups: 'Rappels',
    appearance: 'Apparence',
    data: 'Données',
    extension: 'Extension',
  },

  // Settings Descriptions
  settingsDesc: {
    profile: 'Gérez vos informations professionnelles',
    goals: 'Définissez vos cibles de candidatures',
    automation: 'Configurez l\'automatisation de votre recherche',
    apiClaude: 'Configurez votre propre clé API Claude',
    notifications: 'Gérez vos notifications',
    followups: 'Définissez les délais de suivi',
    appearance: 'Choisissez le thème de l\'application',
    data: 'Exportez, importez ou réinitialisez vos données',
    extension: 'Gérez l\'extension Firefox',
  },

  // JobModal
  jobModal: {
    editTitle: 'Modifier la candidature',
    newTitle: 'Nouvelle candidature',
    companyLabel: 'Entreprise',
    positionLabel: 'Poste',
    urlLabel: 'URL de l\'offre',
    dateLabel: 'Date',
    statusLabel: 'Statut',
    notesLabel: 'Notes',
    notesPlaceholder: 'Contexte, contacts, impressions...',
    companyPlaceholder: 'ex: Pennylane',
    positionPlaceholder: 'ex: Senior Product Manager',
    urlInvalid: '⚠ URL invalide (doit commencer par http)',
    duplicateWarning: '⚠️ Candidature existante',
    duplicateText: 'Une candidature pour {company} — {position} existe déjà ({status})',
    duplicateAsk: 'Voulez-vous continuer pour créer un doublon ?',
    cancel: 'Annuler',
    save: 'Enregistrer',
    required: '*',
  },

  // ConfirmDelete
  confirmDelete: {
    title: 'Confirmer la suppression',
    message: 'Êtes-vous sûr de vouloir supprimer cette candidature ?',
    warning: 'Cette action est irréversible.',
    cancel: 'Annuler',
    delete: 'Oui, supprimer',
  },

  // Filters
  filters: {
    search: 'Rechercher',
    period: 'Période',
    all: 'Tous',
    week: 'Cette semaine',
    month: 'Ce mois',
    favorites: 'Favoris',
    archived: 'Archivées',
    results: '{count} résultat{s}',
  },

  // Stats
  statsHeader: {
    title: 'Statistiques',
    summary: 'candidatures · %réponses · cette semaine',
  },
  statsPipeline: {
    title: 'Pipeline',
    activeApplications: 'candidatures actives',
    sent: 'Envoyées',
    interviews: 'Entretiens',
    offers: 'Offres',
  },
  statsResponse: {
    title: 'Taux de réponse',
    interviews: 'Entretiens',
    offers: 'Offres',
    active: 'En cours',
    insufficientData: '⚠ Données insuffisantes',
  },
  statsActivity: {
    title: 'Activité 7j',
    added: 'ajoutées',
    thisWeek: 'cette semaine',
  },
  statsDistribution: {
    title: 'Répartition',
  },

  // Filters
  filtersSearch: {
    placeholder: 'Entreprise ou poste...',
    reset: 'Réinitialiser',
    result: 'candidature',
    results: 'candidatures',
    of: '/',
  },
  filtersPeriod: {
    all: 'Toutes les périodes',
    week: 'Cette semaine',
    month: 'Ce mois',
  },
  filtersStatus: {
    tooltip1: '1× afficher · 2× masquer · 3× reset',
    show: 'Affichage — cliquer pour masquer',
    hidden: 'Masqué — cliquer pour reset',
  },

  // JobRow / JobCard
  jobActions: {
    edit: 'Modifier',
    delete: 'Supprimer',
    favorite: 'Favoris',
    archive: 'Archiver',
    restore: 'Restaurer',
    addStep: 'Ajouter une étape',
    steps: 'Étapes',
    notes: 'Notes',
    url: 'URL',
    status: 'Statut',
    date: 'Date',
    tips: 'Conseils pour cette étape',
    you: 'Vous',
  },

  // GmailImport
  gmailImport: {
    title: 'Importer depuis Gmail',
    connect: 'Connecter Gmail',
    disconnect: 'Déconnecter',
    importing: 'Importation...',
    import: 'Importer',
    noEmails: 'Aucun email trouvé',
    found: 'candidatures trouvées dans Gmail',
    importSuccess: 'Importation réussie!',
    errorConfigMissing: 'Clé Google Client ID manquante. Ajoutez VITE_GOOGLE_CLIENT_ID dans votre fichier .env',
    errorConnectionFailed: 'Connexion Gmail annulée ou échouée : ',
    errorSessionExpired: 'Session expirée — veuillez vous reconnecter.',
    errorNothingFound: 'Aucun email trouvé sur {months} mois. Essayez d\'augmenter la période ou vérifiez vos autorisations Gmail.',
  },

  // CVManager
  cvManager: {
    title: 'Mes CV',
    upload: 'Télécharger un CV',
    uploadNew: 'Télécharger',
    noCV: 'Aucun CV téléchargé',
    generate: 'Générer un CV',
    delete: 'Supprimer',
    preview: 'Aperçu',
    uploading: 'Téléchargement...',
    selectForJob: 'Sélectionner pour cette candidature',
  },

  // NextAction
  nextAction: {
    title: 'Prochaines étapes',
    urgentActions: 'Actions urgentes',
    recommendedSteps: 'Étapes recommandées',
    noActions: 'Aucune action requise',
  },

  // RowActions
  rowActions: {
    viewCV: 'Voir le CV',
    generateCV: 'Générer un CV',
    draftEmail: 'Rédiger un email',
    thankYou: 'Email de remerciement',
    followUp: 'Email de relance',
    star: 'Ajouter aux favoris',
    archive: 'Archiver',
  },

  // JobCard
  jobCard: {
    addStep: 'Ajouter une étape',
    sync: 'Sync',
    edit: 'Éditer',
    delete: 'Supprimer',
    fullDetailsDesktop: 'Détails complets disponibles en mode desktop',
    salary: 'Salaire',
    id: 'ID',
    location: 'Localisation',
  },

  // NextAction Rules
  nextActionRules: {
    caseSubmit: 'Rendre le cas pratique {company}',
    caseDeadlinePassed: 'Deadline dépassée de {days}j !',
    caseDeadlineToday: 'Deadline aujourd\'hui !',
    caseDeadlineIn: 'Il reste {days} jour{s} pour rendre le cas pratique.',
    followUpSent: 'Relancer {company}',
    noResponseSince: 'Aucune réponse depuis {days} jours. Un email de relance s\'impose.',
    followUpReviewing: 'Relancer {company}',
    reviewingNoResponse: 'Profil en examen depuis {days} jours sans retour.',
    followUpWaiting: 'Suivi {company}',
    waitingSince: 'En attente depuis {days} jours — relance appropriée.',
    respondToOffer: 'Répondre à l\'offre {company}',
    offerReceived: 'Offre reçue — négocie et réponds avant qu\'elle expire.',
    prepareInterview: 'Préparer entretien {company}',
    prepareInterviewTip: 'Recherche {company}, prépare 5 questions, révise tes réponses STAR et ton pitch.',
    prepareStar: 'Prépare tes réponses STAR, recherche l\'entreprise, prépare 5 questions.',
    prepareTechTest: 'Préparer le test technique {company}',
    prepareDocumentation: 'Prépare la documentation, un repo propre, soigne le README et tes explications de choix techniques.',
    viewAdvice: 'Voir les conseils',
    prepareNegotiation: 'Préparer la négociation {company}',
    negotiationTips: 'Salaire, télétravail, avantages, date de prise de poste — prépare chaque point avec des arguments marché.',
    offerNegotiateTip: 'Négocie avant d\'accepter. Demande un délai de 48-72h si besoin.',
    generateCVFor: 'Générer un CV pour {company}',
    generateCVTip: 'Adapte ton CV à l\'offre {position} avant de postuler.',
    generateCVButton: 'Générer le CV',
    followUpOverdue: 'Relancer {company}',
    followUpTip: 'Email court et poli : rappel de ta candidature + réaffirmation de ton intérêt.',
    draftEmail: 'Rédiger',
    sendThanks: 'Envoyer remerciement {company}',
    thanksTip: 'Un email de remerciement te différencie et maintient la relation pour l\'avenir.',
  },

  // AdvicePanel
  advicePanel: {
    tipsForStep: 'Conseils pour cette étape',
    personalizedAdvice: 'Conseils personnalisés',
    loading: 'Chargement des conseils...',
    noAdvice: 'Aucun conseil spécifique',
  },

  // CVGenerator
  cvGenerator: {
    title: 'Générer un CV',
    selectCV: 'Sélectionner un CV à personnaliser',
    before: 'Original',
    after: 'Personnalisé',
    generating: 'Génération...',
    download: 'Télécharger PDF',
    noCV: 'Aucun CV sélectionné',
  },

  // JobSearch
  jobSearch: {
    title: 'Recherche d\'emploi',
    location: 'Localisation',
    keyword: 'Mot-clé',
    search: 'Rechercher',
    searching: 'Recherche...',
    results: 'Offres d\'emploi',
    noResults: 'Aucune offre trouvée',
    addToTracker: 'Ajouter au suivi',
  },

  // CVGenerator
  cvGeneratorUI: {
    back: '← Retour',
    sourceCV: 'CV source :',
    photo: '📷 Photo',
    sideBySide: '⬛⬛ Côte à côte',
    before: '◀ Avant',
    after: '▶ Après',
    preview: '👁️ Aperçu',
    edit: '✏️ Éditer',
    regenerate: '↺ Regénérer',
    exportPDF: '⬇️ Exporter PDF',
    saved: '✓ Sauvegardé',
    fetchingJD: 'Récupération de l\'offre...',
    generating: 'Génération...',
    manualJDTitle: 'Aucune offre trouvée',
    manualJDHint: 'Veuillez coller l\'offre d\'emploi ci-dessous :',
    selectLanguage: 'Générer en :',
  },

  // CVManager
  cvManagerUI: {
    title: 'Mes CVs',
    storageInfo: 'CV stocké',
    dragDropPDF: 'Glisser un CV PDF ici',
    orClick: 'ou cliquer pour sélectionner • Max 5MB',
    readingPDF: 'Lecture du PDF en cours...',
    selectPDFFile: 'Veuillez sélectionner un fichier PDF',
    fileTooLarge: 'Fichier trop lourd (max 5MB)',
    errorReading: 'Erreur lors de la lecture du PDF',
    errorExtraction: 'Erreur extraction',
    cvUploaded: 'CV uploadé !',
    extractProfileAuto: 'Extraire ton profil automatiquement pour améliorer STAR, emails et autofill ?',
    later: 'Plus tard',
    extracting: 'Extraction…',
    extractProfile: 'Extraire le profil',
    profileExtracted: 'Profil extrait depuis {name} — visible dans Réglages → Profil candidat',
    generateForJob: 'Générer un CV pour {company}',
    generateAdapted: 'Générer un CV adapté',
    selectCVAndJob: 'Sélectionne un CV et une candidature pour générer une version optimisée :',
    uploadCVStart: 'Uploadez un CV PDF pour commencer',
    uploadCVForJob: 'Uploadez un CV pour générer une version adaptée à {company} — {position}',
    pages: 'page|pages',
    profileCheckmark: 'profil ✓',
  },

  // Common
  common: {
    notes: 'Notes',
    location: 'Localisation',
    salary: 'Salaire',
    save: 'Enregistrer',
    cancel: 'Annuler',
    delete: 'Supprimer',
    edit: 'Modifier',
    close: 'Fermer',
    add: 'Ajouter',
    ok: 'Ok',
    loading: 'Chargement...',
    error: 'Erreur',
    success: 'Succès',
  },
}
