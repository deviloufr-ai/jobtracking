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
  },

  // NextAction
  nextAction: {
    title: 'Prochaines étapes',
    urgentActions: 'Actions urgentes',
    recommendedSteps: 'Étapes recommandées',
    noActions: 'Aucune action requise',
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
