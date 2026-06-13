export const en = {
  // Navigation & Tabs
  nav: {
    tabs: {
      tracker: 'Applications',
      search: 'Search',
      cv: 'My CV',
      settings: 'Settings',
    },
    add: 'Add',
    refresh: 'Sync Gmail & Calendar',
    connectGmail: 'Connect Gmail',
    lastSync: 'Last sync',
    connected: 'Connected',
  },

  // Extension
  extension: {
    title: 'JobTrackr Firefox Extension active',
    label: 'Extension ✓',
  },

  // Mobile Menu
  mobileMenu: {
    navigation: 'Navigation',
    add: 'Add',
    gmail: 'Gmail',
    gmailSub: 'Auto sync',
    screenshot: 'Screenshot',
    screenshotSub: 'Screenshot capture',
    manual: 'Manual',
    manualSub: 'Manual entry',
    connectGmail: 'Connect Gmail',
  },

  // Add Menu
  addMenu: {
    import: 'Import via',
    gmail: 'Gmail',
    gmailDesc: 'Auto sync emails',
    screenshot: 'Screenshot',
    screenshotDesc: 'Paste a screenshot',
    installExt: 'Install Extension',
    installExtDesc: 'Import from any job posting',
    extActive: 'Firefox Extension',
    extActiveDesc: 'Import enabled ✓',
    manual: 'Manual',
    manualDesc: 'Manual entry',
  },

  // Header & Loading
  header: {
    loading: 'Syncing data',
    loadingDesc: 'Fetching your applications from Supabase...',
  },

  // Job Application Messages
  notifications: {
    applicationAdded: 'New application added',
    applicationUpdated: 'application updated',
    applicationDeleted: 'Application deleted',
    applicationsImported: 'application imported from Gmail',
    applicationImportedShort: 'application imported!',
    historyUpdated: 'history updated',
    thankYouEmailSent: 'Thank you email sent ✓',
    followUpEmailSent: 'Follow-up email sent ✓',
    allApplicationsCleared: 'All applications cleared (Supabase synced)',
  },

  // Toast Messages
  toast: {
    added: 'Application added!',
    updated: 'Application updated',
    deleted: 'Application deleted',
  },

  // Empty States
  empty: {
    noApplications: 'No applications yet',
    noApplicationsDesc: 'Add one manually, import from Gmail or via screenshot',
    screenshot: '🖼️ Screenshot',
    gmail: '📧 Gmail',
    addManually: '+ Add manually',
    noResults: 'No applications found',
    resetFilters: 'Reset filters',
  },

  // Stats & Actions
  stats: {
    favorites: '⭐ Favorites',
    otherApplications: 'Other applications',
  },

  // Footer Actions
  footer: {
    mergeDuplicates: '🔀 Merge duplicates',
    clearAll: '🗑️ Clear all data',
    clearConfirm: 'Clear all {{count}} applications? This action is irreversible.',
  },

  // Email Templates
  email: {
    thankYouSentTo: 'Thank you email sent to',
    followUpSentTo: 'Follow-up email sent to',
  },

  // Settings
  settings: {
    profile: 'Profile',
    goals: 'Goals',
    automation: 'Automation',
    apiClaude: 'Claude API',
    notifications: 'Notifications',
    followups: 'Reminders',
    appearance: 'Appearance',
    data: 'Data',
    extension: 'Extension',
    language: 'Language',
  },

  // Job Status Labels
  status: {
    todo: 'To do',
    sent: 'Sent',
    reviewing: 'Reviewing',
    interview: 'Interview',
    waiting: 'Waiting',
    offer: 'Offer received',
    rejected: 'Rejected',
    rejected_ats: 'Rejected (ATS)',
    cancelled: 'Cancelled',
    archived: 'Archived',
    done: 'Accepted',
  },

  // Column Headers
  table: {
    company: 'Company / Position',
    status: 'Status',
    date: 'Date',
    notes: 'Notes',
  },

  // Settings Sidebar
  settingsSidebar: {
    profile: 'Profile',
    goals: 'Goals',
    automation: 'Automation',
    apiClaude: 'Claude API',
    notifications: 'Notifications',
    followups: 'Reminders',
    appearance: 'Appearance',
    data: 'Data',
    extension: 'Extension',
  },

  // Settings Descriptions
  settingsDesc: {
    profile: 'Manage your professional information',
    goals: 'Set your application targets',
    automation: 'Configure your job search automation',
    apiClaude: 'Configure your own Claude API key',
    notifications: 'Manage your notifications',
    followups: 'Set follow-up reminders',
    appearance: 'Choose the application theme',
    data: 'Export, import or reset your data',
    extension: 'Manage the Firefox extension',
  },

  // JobModal
  jobModal: {
    editTitle: 'Edit application',
    newTitle: 'New application',
    companyLabel: 'Company',
    positionLabel: 'Position',
    urlLabel: 'Job posting URL',
    dateLabel: 'Date',
    statusLabel: 'Status',
    notesLabel: 'Notes',
    notesPlaceholder: 'Context, contacts, impressions...',
    companyPlaceholder: 'ex: Pennylane',
    positionPlaceholder: 'ex: Senior Product Manager',
    urlInvalid: '⚠ Invalid URL (must start with http)',
    duplicateWarning: '⚠️ Existing application',
    duplicateText: 'An application for {company} — {position} already exists ({status})',
    duplicateAsk: 'Continue to create a duplicate?',
    cancel: 'Cancel',
    save: 'Save',
    required: '*',
  },

  // ConfirmDelete
  confirmDelete: {
    title: 'Confirm deletion',
    message: 'Are you sure you want to delete this application?',
    warning: 'This action is irreversible.',
    cancel: 'Cancel',
    delete: 'Yes, delete',
  },

  // Filters
  filters: {
    search: 'Search',
    period: 'Period',
    all: 'All',
    week: 'This week',
    month: 'This month',
    favorites: 'Favorites',
    archived: 'Archived',
    results: '{count} result{s}',
  },

  // Stats
  stats: {
    totalApplications: 'Total applications',
    activeApplications: 'Active applications',
    interviewsScheduled: 'Interviews scheduled',
    offerReceived: 'Offers received',
  },

  // Common
  common: {
    notes: 'Notes',
    location: 'Location',
    salary: 'Salary',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    add: 'Add',
    ok: 'OK',
  },
}
