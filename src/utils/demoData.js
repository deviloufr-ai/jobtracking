// Demo data for marketing/landing page screenshots

const COMPANIES = [
  'Stripe', 'Figma', 'Notion', 'Vercel', 'Anthropic', 'Airbnb', 'Spotify',
  'GitHub', 'Shopify', 'Slack', 'Zapier', 'Retool', 'Intercom', 'Linear',
  'Webflow', 'Airtable', 'TikTok', 'Twilio', 'Supabase', 'Hasura'
]

const POSITIONS = [
  'Senior Full Stack Engineer', 'Frontend Engineer', 'Backend Engineer',
  'Product Manager', 'Design Manager', 'DevOps Engineer', 'Data Engineer',
  'AI/ML Engineer', 'Solutions Architect', 'Engineering Manager',
  'Technical Lead', 'Principal Engineer', 'Software Engineer',
  'Growth Engineer', 'Infrastructure Engineer'
]

const INTERVIEW_TYPES = [
  'Phone screen with recruiter',
  'Technical assessment',
  'System design interview',
  'Culture fit conversation',
  'Live coding challenge',
  'Take-home assignment',
  'Final round with founders'
]

const REJECTION_REASONS = [
  'Decided to move forward with other candidates',
  'Not an ideal fit for the role at this time',
  'Position filled',
  'Restructuring - position cancelled'
]

const OFFER_NOTES = [
  '$150k-180k base + 0.5% equity + benefits',
  '$130k-160k + 0.25% equity, 4-week vacation',
  '$170k-200k + 1% equity, signing bonus'
]

function randomDate(daysAgo) {
  const date = new Date()
  date.setDate(date.getDate() - Math.floor(Math.random() * daysAgo))
  return date.toISOString().split('T')[0]
}

function createJob(company, position, status, daysAgoStart) {
  const baseDate = randomDate(daysAgoStart)
  const job = {
    id: Math.random().toString(36).substring(7),
    company,
    position,
    status,
    date: baseDate,
    salary: `$${Math.floor(Math.random() * 100 + 100)}k-$${Math.floor(Math.random() * 100 + 150)}k`,
    location: ['San Francisco', 'New York', 'Remote', 'London', 'Berlin'].sort(() => Math.random() - 0.5)[0],
    isFavorite: Math.random() > 0.7,
    notes: '',
    history: []
  }

  return job
}

function addHistory(job, note, daysAgo) {
  if (!job.history) job.history = []
  job.history.push({
    date: randomDate(daysAgo),
    note
  })
  return job
}

export function generateDemoJobs() {
  const jobs = []

  // "To Apply" - fresh leads
  jobs.push(
    createJob('Stripe', 'Senior Full Stack Engineer', 'todo', 365)
  )
  jobs.push(
    createJob('Figma', 'Product Engineer', 'todo', 180)
  )

  // Recently sent applications
  const sent1 = createJob('Vercel', 'Engineering Manager', 'sent', 60)
  addHistory(sent1, 'Application submitted', 15)
  jobs.push(sent1)

  const sent2 = createJob('Notion', 'Frontend Engineer', 'sent', 45)
  addHistory(sent2, 'Cover letter customized and sent', 10)
  jobs.push(sent2)

  // Under review
  const reviewing1 = createJob('Anthropic', 'AI/ML Engineer', 'reviewing', 35)
  addHistory(reviewing1, 'Application submitted', 35)
  addHistory(reviewing1, 'Status changed to reviewing by recruiter', 20)
  jobs.push(reviewing1)

  const reviewing2 = createJob('Shopify', 'Backend Engineer', 'reviewing', 40)
  addHistory(reviewing2, 'Application submitted', 38)
  addHistory(reviewing2, 'Recruiter requested portfolio samples', 18)
  addHistory(reviewing2, 'Samples sent', 15)
  jobs.push(reviewing2)

  // Interview scheduled
  const interview1 = createJob('GitHub', 'Senior Software Engineer', 'interview', 25)
  addHistory(interview1, 'Application submitted', 25)
  addHistory(interview1, 'Passed initial screening', 18)
  addHistory(interview1, 'Phone screen with hiring manager - ' + INTERVIEW_TYPES[0], 12)
  addHistory(interview1, 'Scheduled: System design interview - June 15 at 2pm PT', 8)
  jobs.push(interview1)

  const interview2 = createJob('Slack', 'Technical Lead', 'interview', 30)
  addHistory(interview2, 'Application submitted', 30)
  addHistory(interview2, 'Technical assessment completed', 20)
  addHistory(interview2, 'Invited to onsite: June 20-21', 5)
  jobs.push(interview2)

  // Waiting for feedback
  const waiting1 = createJob('Airbnb', 'Product Manager', 'waiting', 20)
  addHistory(waiting1, 'Application submitted', 20)
  addHistory(waiting1, 'Phone screen completed - very positive', 14)
  addHistory(waiting1, 'Take-home assignment submitted', 8)
  addHistory(waiting1, 'Waiting for team feedback', 3)
  jobs.push(waiting1)

  // Offer received! 🎉
  const offer = createJob('Zapier', 'Engineering Manager', 'offer', 5)
  addHistory(offer, 'Application submitted', 35)
  addHistory(offer, 'Initial screening passed', 25)
  addHistory(offer, 'Phone screens completed - 2 rounds', 18)
  addHistory(offer, 'Final round interview completed', 10)
  addHistory(offer, '🎉 OFFER RECEIVED: ' + OFFER_NOTES[0], 2)
  addHistory(offer, 'Negotiating terms', 1)
  jobs.push(offer)

  // Rejected (but can learn from it)
  const rejected1 = createJob('Retool', 'Full Stack Engineer', 'rejected', 60)
  addHistory(rejected1, 'Application submitted', 60)
  addHistory(rejected1, 'Phone screen completed', 45)
  addHistory(rejected1, 'Rejection: They went with a candidate with more React experience', 40)
  jobs.push(rejected1)

  // ATS Rejection
  const rejectedAts = createJob('Intercom', 'DevOps Engineer', 'rejected_ats', 90)
  addHistory(rejectedAts, 'Application submitted', 90)
  addHistory(rejectedAts, 'ATS Rejection: Position requirements not met', 85)
  jobs.push(rejectedAts)

  // Done/Completed (accepted offer elsewhere)
  const done = createJob('Linear', 'Senior Full Stack Engineer', 'done', 10)
  addHistory(done, 'Application submitted', 35)
  addHistory(done, 'Phone screen completed - great fit', 25)
  addHistory(done, 'Technical assessment passed', 18)
  addHistory(done, 'Final round completed', 12)
  addHistory(done, '🎉 OFFER ACCEPTED - Starting July 1st!', 2)
  jobs.push(done)

  // Cancelled
  const cancelled = createJob('Twilio', 'Solutions Architect', 'cancelled', 75)
  addHistory(cancelled, 'Application submitted', 75)
  addHistory(cancelled, 'Interview scheduled for next week', 60)
  addHistory(cancelled, 'Role cancelled due to restructuring', 55)
  jobs.push(cancelled)

  // Archived (old application)
  const archived = createJob('Webflow', 'Frontend Engineer', 'archived', 180)
  addHistory(archived, 'Application submitted', 180)
  addHistory(archived, 'No response after 60 days', 120)
  jobs.push(archived)

  // Sort by date descending
  return jobs.sort((a, b) => new Date(b.date) - new Date(a.date))
}
