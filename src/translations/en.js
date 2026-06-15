export const en = {
  analytics: {
    empty: 'No applications yet. Once you start applying and tracking responses, your metrics will appear here.',
    metrics: {
      totalApps: 'Applications',
      responseRate: 'Response rate',
      avgTimeToInterview: 'Avg. time to interview',
      interviewRate: 'Interview rate',
      days: 'days',
      noData: 'not enough data',
    },
    funnel: {
      title: 'Conversion funnel',
      sent: 'Applied',
      reviewing: 'Responded',
      interview: 'Interview',
      offer: 'Offer',
    },
    trend: {
      title: 'Applications per week',
      subtitle: 'last 12 weeks',
    },
  },
  // Navigation & Tabs
  nav: {
    tabs: {
      tracker: 'Applications',
      analytics: 'Analytics',
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
    favorites: 'Favorites',
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
    score: 'Score',
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
  statsHeader: {
    title: 'Statistics',
    summary: 'applications · % responses · this week',
  },
  statsPipeline: {
    title: 'Pipeline',
    activeApplications: 'active applications',
    sent: 'Sent',
    interviews: 'Interviews',
    offers: 'Offers',
  },
  statsResponse: {
    title: 'Response rate',
    interviews: 'Interviews',
    offers: 'Offers',
    active: 'In progress',
    insufficientData: '⚠ Insufficient data',
  },
  statsActivity: {
    title: '7-day activity',
    added: 'added',
    thisWeek: 'this week',
  },
  statsDistribution: {
    title: 'Distribution',
  },

  // Filters
  filtersSearch: {
    placeholder: 'Company or position...',
    reset: 'Reset filters',
    result: 'application',
    results: 'applications',
    of: '/',
  },
  filtersPeriod: {
    all: 'All periods',
    week: 'This week',
    month: 'This month',
  },
  filtersStatus: {
    tooltip1: '1× show · 2× hide · 3× reset',
    show: 'Showing — click to hide',
    hidden: 'Hidden — click to reset',
  },

  // JobRow / JobCard
  jobActions: {
    edit: 'Edit',
    delete: 'Delete',
    favorite: 'Favorite',
    archive: 'Archive',
    restore: 'Restore',
    addStep: 'Add step',
    steps: 'Steps',
    notes: 'Notes',
    url: 'URL',
    status: 'Status',
    date: 'Date',
    tips: 'Tips for this step',
    you: 'You',
    past: 'Past',
    upcoming: 'Upcoming',
  },

  // GmailImport
  gmailImport: {
    title: 'Import from Gmail',
    connect: 'Connect Gmail',
    disconnect: 'Disconnect',
    importing: 'Importing...',
    import: 'Import',
    noEmails: 'No emails found',
    found: 'applications found in Gmail',
    importSuccess: 'Import successful!',
    errorConfigMissing: 'Google Client ID key missing. Add VITE_GOOGLE_CLIENT_ID to your .env file',
    errorConnectionFailed: 'Gmail connection canceled or failed: ',
    errorSessionExpired: 'Session expired — please reconnect.',
    errorNothingFound: 'No emails found in {months} months. Try increasing the period or check your Gmail permissions.',
  },

  // CVManager
  cvManager: {
    title: 'My CVs',
    upload: 'Upload CV',
    uploadNew: 'Upload',
    noCV: 'No CV uploaded',
    generate: 'Generate CV',
    delete: 'Delete',
    preview: 'Preview',
    uploading: 'Uploading...',
    selectForJob: 'Select for this application',
  },

  // NextAction
  nextAction: {
    title: 'Next steps',
    urgentActions: 'Urgent actions',
    recommendedSteps: 'Recommended steps',
    noActions: 'No actions required',
  },

  // RowActions
  rowActions: {
    viewCV: 'View CV',
    generateCV: 'Generate CV',
    draftEmail: 'Draft email',
    thankYou: 'Thank you email',
    followUp: 'Follow-up email',
    star: 'Add to favorites',
    archive: 'Archive',
  },

  // JobCard
  jobCard: {
    addStep: 'Add step',
    sync: 'Sync',
    edit: 'Edit',
    delete: 'Delete',
    fullDetailsDesktop: 'Full details available in desktop mode',
    salary: 'Salary',
    id: 'ID',
    location: 'Location',
  },

  // NextAction Rules
  nextActionRules: {
    caseSubmit: 'Submit case study for {company}',
    caseDeadlinePassed: 'Deadline passed by {days}d!',
    caseDeadlineToday: 'Deadline today!',
    caseDeadlineIn: '{days} day{s} left to submit case study.',
    followUpSent: 'Follow up with {company}',
    noResponseSince: 'No response in {days} days. Time to follow up.',
    followUpReviewing: 'Follow up with {company}',
    reviewingNoResponse: 'Application under review for {days} days without response.',
    followUpWaiting: 'Follow up {company}',
    waitingSince: 'Waiting {days} days — appropriate to follow up.',
    respondToOffer: 'Respond to {company} offer',
    offerReceived: 'Offer received — negotiate and respond before it expires.',
    prepareInterview: 'Prepare interview for {company}',
    prepareInterviewTip: 'Research {company}, prepare 5 questions, review your STAR answers and pitch.',
    prepareStar: 'Prepare STAR responses, research the company, prepare 5 questions.',
    prepareTechTest: 'Prepare tech test for {company}',
    prepareDocumentation: 'Prepare documentation, clean repo, polish README and technical explanations.',
    viewAdvice: 'View advice',
    prepareNegotiation: 'Prepare negotiation for {company}',
    negotiationTips: 'Salary, remote days, perks, start date — prepare arguments for each.',
    offerNegotiateTip: 'Negotiate before accepting. Ask for 48-72h to think if needed.',
    generateCVFor: 'Generate CV for {company}',
    generateCVTip: 'Customize your CV for the {position} offer before applying.',
    generateCVButton: 'Generate CV',
    followUpOverdue: 'Follow up with {company}',
    followUpTip: 'Short and polite email: reminder of application + reaffirm interest.',
    draftEmail: 'Draft email',
    sendThanks: 'Send thanks to {company}',
    thanksTip: 'Thank you email sets you apart and maintains relationship for future.',
  },

  // AdvicePanel
  advicePanel: {
    tipsForStep: 'Tips for this step',
    personalizedAdvice: 'Personalized advice',
    loading: 'Loading advice...',
    noAdvice: 'No specific advice',
  },

  // CVGenerator
  cvGenerator: {
    title: 'Generate CV',
    selectCV: 'Select a CV to customize',
    before: 'Original',
    after: 'Customized',
    generating: 'Generating...',
    download: 'Download PDF',
    noCV: 'No CV selected',
  },

  // JobSearch
  jobSearch: {
    title: 'Job Search',
    location: 'Location',
    keyword: 'Keyword',
    search: 'Search',
    searching: 'Searching...',
    results: 'Job listings',
    noResults: 'No jobs found',
    addToTracker: 'Add to tracker',
  },

  // CVGenerator
  cvGeneratorUI: {
    back: 'Back',
    sourceCV: 'Source CV:',
    photo: 'Photo',
    sideBySide: 'Side by side',
    before: 'Before',
    after: 'After',
    preview: 'Preview',
    edit: 'Edit',
    regenerate: 'Regenerate',
    exportPDF: 'Export PDF',
    saved: 'Saved',
    fetchingJD: 'Fetching job description...',
    generating: 'Generating...',
    manualJDTitle: 'No job description found',
    manualJDHint: 'Please paste the job description below:',
    selectLanguage: 'Generate in:',
  },

  // CVManager
  cvManagerUI: {
    title: 'My CVs',
    storageInfo: 'CV stored',
    dragDropPDF: 'Drag a CV PDF here',
    orClick: 'or click to select • Max 5MB',
    readingPDF: 'Reading PDF...',
    selectPDFFile: 'Please select a PDF file',
    fileTooLarge: 'File too large (max 5MB)',
    errorReading: 'Error reading PDF',
    errorExtraction: 'Extraction error',
    cvUploaded: 'CV uploaded!',
    extractProfileAuto: 'Extract your profile automatically to improve STAR, emails and autofill?',
    later: 'Later',
    extracting: 'Extracting...',
    extractProfile: 'Extract profile',
    profileExtracted: 'Profile extracted from {name} — visible in Settings → Candidate Profile',
    generateForJob: 'Generate a CV for {company}',
    generateAdapted: 'Generate adapted CV',
    selectCVAndJob: 'Select a CV and application to generate an optimized version:',
    uploadCVStart: 'Upload a PDF CV to get started',
    uploadCVForJob: 'Upload a CV to generate an adapted version for {company} — {position}',
    pages: 'page|pages',
    profileCheckmark: 'profile ✓',
  },

  // UpcomingMeetings
  upcomingMeetings: {
    title: 'Upcoming Meetings',
    today: 'Today',
    tomorrow: 'Tomorrow',
    join: 'Join',
    joinVia: 'Join via {platform}',
  },

  // Goals
  goals: {
    title: 'Goals',
    applicationsPerWeek: 'Applications / week',
    responseRate: 'Response rate',
    interviewsPerMonth: 'Interviews / month',
    thisWeek: 'this week',
  },

  // Settings - Profile Tab
  settingsProfile: {
    autoFillSubtitle: 'Auto-fill your profile from your CV',
    extractingFromCV: 'Extract from CV',
    profileExtractedFrom: 'Profile extracted from {{cvName}}{{date}}',
    zeroManualEntry: 'Zero manual entry — extraction from your CV.',
    reExtract: '🔄 Re-extract',
    extract: '✦ Extract',
    basicInfo: 'Basic information',
    fullName: 'Full name',
    fullNameHint: 'As it will appear on forms',
    jobTitle: 'Job title / Target position',
    email: 'Email',
    emailHint: 'Contact address',
    phone: 'Phone',
    phoneHint: 'Used by extension autofill',
    linkedin: 'LinkedIn',
    linkedinHint: 'LinkedIn profile',
    website: 'Website / Portfolio',
    websiteHint: 'Displayed in CV and emails',
    languages: 'Languages',
    education: 'Education',
    experienceAndSkills: 'Experience and skills',
    companies: 'Companies',
    companiesHint: 'One per line, ex: Acme Inc (2020-2023)',
    experienceSummary: 'Experience summary',
    experienceSummaryHint: '18 years of experience summary',
    keySkills: 'Key skills',
    keySkillsHint: 'Separated by commas',
    aiExperience: 'AI experience / Recent projects',
    motivation: 'Motivation / Default pitch',
    keyAchievements: 'Key achievements',
    saved: '✓ Saved',
  },

  // Settings - Goals Tab
  settingsGoals: {
    title: 'Your goals',
    applicationsPerWeek: 'Applications / week',
    applicationsPerWeekHint: 'Target number of applications',
    responseRateTarget: 'Target response rate',
    responseRateTargetHint: '% of employer responses',
    interviewsPerMonth: 'Interviews / month',
    interviewsPerMonthHint: 'Monthly target',
  },

  // Settings - Automation Tab
  settingsAutomation: {
    title: 'Automation settings',
    autoArchiveNoResponse: 'Auto-archive after X days without response',
    autoArchiveNoResponseHint: 'For: Sent, Reviewing, Waiting',
    autoArchiveRejected: 'Auto-archive rejections after X days',
    autoArchiveRejectedHint: 'For: Rejected, Rejected ATS, Cancelled',
    gmailSync: 'Gmail auto-sync',
    gmailSyncHint: 'Interval between synchronizations',
    gmailPeriod: 'Gmail search period',
    gmailPeriodHint: 'How many days back to fetch emails',
    checkPositionAvailability: 'Check position availability',
    checkPositionAvailabilityHint: 'Auto-detect if position is still open',
  },

  // Settings - API Tab
  settingsAPI: {
    subtitle: 'Use your own Claude API key to avoid rate limits',
    privateKeyInfo: 'Your API key remains private and stored locally',
    neverSentToServer: 'It is never sent to JobTrackerAI server',
    claudeAPIKey: 'Claude API key',
    yourAPIKey: 'Your API key',
    yourAPIKeyHint: 'Create a key at https://console.anthropic.com/api/keys',
    show: 'Show',
    hide: 'Hide',
    saveKey: 'Save',
    enterKey: 'Enter a key',
    testKey: '🧪 Test',
    testing: '⏳ Testing...',
    testSuccess: '✓ OK',
    errorEmpty: 'API key cannot be empty',
    errorEnterBeforeTest: 'Enter an API key before testing',
    errorConnection: 'Connection error',
    deleteKey: '🗑️ Delete key',
    options: 'Options:',
    about: 'About',
    aboutSubtitle: 'Understanding the configuration',
    whereStored: '📍 Where is my key stored?',
    whereStoredAnswer: 'Your API key is saved locally in the browser storage (localStorage). It is never sent to JobTrackerAI servers.',
    howCommunication: '🔄 How does communication work?',
    howCommunicationAnswer: 'Your requests are sent directly to the Claude API with your personal key. Each call uses your API quota.',
    costs: '💰 Costs',
    costsAnswer: 'Usage fees are charged to your Anthropic account. Claude Haiku is the most economical model (5x cheaper than Sonnet).',
    security: '🔐 Security',
    securityAnswer: 'Keep your key secret. If you compromise it, regenerate it immediately from the Anthropic console.',
    keySaved: '✓ Saved',
  },

  // Settings - Followups Tab
  settingsFollowups: {
    title: 'Action deadline',
    subtitle: 'Configure reminders for each status',
    followUpSent: 'Follow up sent application',
    followUpSentHint: 'Status: Sent',
    followUpReviewing: 'Follow up application under review',
    followUpReviewingHint: 'Status: Under review',
    followUpWaiting: 'Follow up waiting',
    followUpWaitingHint: 'Status: Waiting',
    respondToOffer: 'Respond to offer received',
    respondToOfferHint: 'Status: Offer received',
    resetDefaults: '↻ Reset to defaults',
  },

  // Settings - Appearance Tab
  settingsAppearance: {
    language: 'Language',
    languageSubtitle: 'Select your preferred language',
    languageHint: 'Language will be applied immediately',
    applicationTheme: 'Application theme',
    applicationThemeSubtitle: 'Choose the visual style that suits you best',
    themeHint: 'Select the interface theme',
  },

  // Settings - Data Tab
  settingsData: {
    exportImport: 'Export & Import',
    exportApplications: 'Export applications',
    exportApplicationsHint: '{{count}} applications in JSON',
    exported: '✓ Exported',
    importApplications: 'Import applications',
    importApplicationsHint: 'Merges without creating duplicates',
    import: 'Import',
    dataMaintenance: 'Data maintenance',
    mergeDuplicatesLocal: 'Merge duplicates (client)',
    mergeDuplicatesLocalHint: 'Detects and merges locally',
    merge: 'Merge',
    mergeDuplicatesServer: 'Clean duplicates (server)',
    mergeDuplicatesServerHint: 'Supabase deduplication',
    clean: '🧹 Clean',
    duplicatesRemoved: '✓ {{count}} duplicates removed',
    cleanError: '✗ Error: {{error}}',
    clearing: '⏳ Clearing...',
    clearEmailCache: 'Clear email cache',
    clearEmailCacheHint: 'Force re-parsing on next scan',
    clear: 'Clear',
    deleteAllHistory: 'Delete all history',
    deleteAllHistoryHint: 'Erase all history entries',
    youWillDelete: 'You will delete:',
    historyEntries: 'history entries',
    about: 'About',
    affectingApplications: 'Affecting {{count}} application(s)',
    deletionIndexedDBAndSupabase: 'Deletion in IndexedDB AND Supabase',
    actionIrreversible: 'This action is irreversible.',
    deleteHistoryButton: 'Yes, delete all',
    confirm: 'Confirm',
    cancel: 'Cancel',
    deleting: '⏳ Deleting...',
    historyDeleted: '✓ {{count}} history entries deleted from {{jobCount}} application(s)',
    dangerZone: 'Danger Zone',
    dangerZoneSubtitle: 'Warning: this action is irreversible',
    resetCompletely: 'Reset completely',
    resetCompletelyHint: 'Deletes everything: applications, settings, data',
    yesDeleteEverything: 'Yes, delete everything',
  },

  // Settings - Extension Tab
  settingsExtension: {
    firefoxExtension: 'Firefox Extension',
    status: 'Status',
    statusHint: 'Install the extension to import job postings directly',
    install: '📥 Install',
    enabled: '✓ Enabled',
    checking: '⏳ Checking...',
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
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
  },
}
