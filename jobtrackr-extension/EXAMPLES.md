# Real-World Examples: Text Extraction & Filtering

## Example 1: LinkedIn Job Posting

### BEFORE (Raw extracted text with clutter)
```
0 notifications
Skip to search
Skip to main content
Skip to primary content
Skip to aside
Skip to footer
Jobgether
Senior Project Leader
France · 2 days ago
73 applicants
Save job
More
Report job
Easy Apply
-
Senior Project Leader
Job functions
Business Development
Business Operations
Seniority level
Senior-level
Employment type
Full-time
Industries
Business Services, Management Consulting, IT Services
Company size
1001-5000 employees
On-site/Remote
On-site
Job description
We are seeking a Senior Project Leader to join our dynamic team...
Key Responsibilities:
- Lead cross-functional teams
- Manage project budgets up to €500K
- Deliver projects on time
Requirements:
- 8+ years of project management
- PMP Certification
- Strong communication skills
Languages
French, English
Location
Paris, France
View all applicants
Save to PDF
Share via email
More options
```

### AFTER (Smart filtered text)
```
Senior Project Leader
France
2 days ago

Job description:
We are seeking a Senior Project Leader to join our dynamic team...

Key Responsibilities:
- Lead cross-functional teams
- Manage project budgets up to €500K
- Deliver projects on time

Requirements:
- 8+ years of project management
- PMP Certification
- Strong communication skills

Languages:
French, English

Location:
Paris, France
```

**Removed elements:**
- ❌ 0 notifications (nav pattern)
- ❌ Skip to X links (nav pattern)
- ❌ 73 applicants (metadata)
- ❌ 2 days ago (timestamp, but kept important date context)
- ❌ Save job / Report job buttons
- ❌ Easy Apply (apply button)
- ❌ Job functions dropdown
- ❌ Seniority level / Employment type (UI elements)
- ❌ View all applicants

---

## Example 2: Indeed Job Posting

### BEFORE (Messy extraction)
```
Skip to main content
Job search
Career advice
Salary guide
Advanced job search
Home
Post jobs
Find jobs
Help
Sign in
Post a job
Indeed home
Software Engineer
NetApp
·
San Jose, CA 94080
4.1★ (2,847 reviews)
Full-time
Salary: $180,000 - $230,000 a year
Save
More
Full Job Description
Apply now
Easy Apply
2 weeks ago
Share on Facebook
Share on LinkedIn
Share via email
Posted 2 weeks ago
NetApp is hiring! See details
What NetApp offers:
- Competitive salary
- Health insurance
- 401(k) matching
- Remote work options
What you'll do:
Design and implement distributed systems
Write production-quality code
Collaborate with teams
What you need:
5+ years experience with distributed systems
Strong C++ or Java skills
BS in Computer Science
Apply now
```

### AFTER (Clean & structured)
```
Software Engineer
NetApp
San Jose, CA 94080
4.1★ (2,847 reviews)
Full-time
Salary: $180,000 - $230,000 a year

What NetApp offers:
- Competitive salary
- Health insurance
- 401(k) matching
- Remote work options

What you'll do:
Design and implement distributed systems
Write production-quality code
Collaborate with teams

What you need:
5+ years experience with distributed systems
Strong C++ or Java skills
BS in Computer Science
```

**Removed:**
- ❌ Header navigation (Skip to main content)
- ❌ Job search dropdowns
- ❌ Indeed branding/links
- ❌ Posted 2 weeks ago (timestamp pattern)
- ❌ Social share buttons
- ❌ "Apply now" buttons

---

## Example 3: Welcome to the Jungle (French Job Site)

### BEFORE (Cluttered sections)
```
Accueil
Recherche d'emploi
Actualités
Menu principal
0 notifications
Connexion
0
Chef de Projet Senior
GetAround
·
Paris, France
Postuler facilement
Enregistrer l'offre
Signaler l'offre
2 jours
Voir les autres offres
À propos de cette offre
Chef de Projet Senior
Vous cherchez une nouvelle opportunité ? Rejoignez notre équipe...
Détails de l'emploi
Description du poste:
Nous recherchons un Chef de Projet expérimenté pour diriger des projets complexes.
Compétences requises:
- 10+ ans d'expérience en gestion de projet
- Certification Prince2
- Anglais courant
Salaire:
€65,000 - €85,000 par an
Localisation:
Paris, France
Télétravail:
100% sur site
Voir les offres similaires
Candidats similaires
Modifier mon CV
Télécharger mon CV
```

### AFTER (French text, properly cleaned)
```
Chef de Projet Senior
GetAround
Paris, France
2 jours

À propos de cette offre:
Chef de Projet Senior
Vous cherchez une nouvelle opportunité ? Rejoignez notre équipe...

Détails de l'emploi:
Description du poste:
Nous recherchons un Chef de Projet expérimenté pour diriger des projets complexes.

Compétences requises:
- 10+ ans d'expérience en gestion de projet
- Certification Prince2
- Anglais courant

Salaire:
€65,000 - €85,000 par an

Localisation:
Paris, France

Télétravail:
100% sur site
```

**Removed (French patterns):**
- ❌ "0 notifications" (nav pattern - works in French too!)
- ❌ "Accueil", "Recherche d'emploi" (navigation)
- ❌ "Connexion" (sign in)
- ❌ "Postuler facilement" (easy apply button)
- ❌ "Voir les autres offres" (view more jobs)
- ❌ "Voir les offres similaires" (similar jobs)
- ❌ "Modifier mon CV" / "Télécharger mon CV" (CV options)

---

## Example 4: User Edits in Review Modal

### User opens review modal and sees:
```
Senior Developer
TechCorp
San Francisco, CA

About this job:
TechCorp is seeking a Senior Developer...

As the right candidate you'll have:
- 7+ years of experience
- Strong Python/Go skills
- Passion for distributed systems

What we're looking for:
- Proven track record scaling systems
- Leadership experience
- Open source contributions

Salary:
$200,000 - $250,000

Benefits:
- Medical/Dental/Vision
- 401(k) match
- Unlimited PTO
- Remote flexibility
```

### User decides to remove benefits section (not relevant to job matching):
**Before modal confirm:**
```
Senior Developer
TechCorp
San Francisco, CA

About this job:
TechCorp is seeking a Senior Developer...

As the right candidate you'll have:
- 7+ years of experience
- Strong Python/Go skills
- Passion for distributed systems

What we're looking for:
- Proven track record scaling systems
- Leadership experience
- Open source contributions

Salary:
$200,000 - $250,000
```

**Action:** User selected all the benefits text and deleted it, then clicked "✓ Use this text"

**Result:** Cleaner description sent to Claude AI for analysis → Better form auto-fill

---

## Example 5: Content Start Detection in Action

### Case A: Page with lots of header content
```
Line 1: "Home > Jobs > Senior Developer"
Line 2: "Filter by: Location, Company, Salary"
Line 3: "Sort by: Relevance, Date, Salary"
Line 4: "Search filters"
Line 5: "Apply filters"
...
Line 25: "Senior Developer at TechCorp"  ← Content starts here!
Line 26: "San Francisco, CA"
Line 27: "About this job..."
```

**Detection:** Lines 1-24 scored lower (mostly nav keywords)  
Line 25 contains "Senior Developer" + "at" = high score  
→ **Content starts at line 25**

### Case B: LinkedIn with heavy metadata
```
Line 1: "0 notifications"
Line 2: "Skip to search"
...
Line 18: "Save job"
Line 19: "Report job"
Line 20: "Product Manager"  ← Detected by markers!
Line 21: "Apple Inc"
Line 22: "Cupertino, CA"
Line 23: "2 days ago"
Line 24: "About this job"
```

**Detection:** All previous lines filtered out by NAV_PATTERNS  
Line 20 contains "Product Manager" (matches title markers)  
Line 24 contains "About this job" (matches content markers)  
→ **Content starts at line 20**

---

## Example 6: AI Analysis with Clean Text

### What Claude receives (cleaned text):
```
Senior Software Engineer
Google
Mountain View, California
Full-time, On-site/Remote

About the role:
Google is seeking a Senior Software Engineer to join the Cloud
team. You'll work on distributed systems that process petabytes
of data daily.

Key responsibilities:
- Design and implement large-scale systems
- Lead technical design reviews
- Mentor junior engineers
- Collaborate across teams

Required qualifications:
- 8+ years of software development experience
- Strong knowledge of distributed systems
- Excellent problem-solving skills
- CS degree or equivalent experience

Preferred qualifications:
- Experience with Kubernetes
- Published research or patents
- Previous Google experience
- Open source contributions

Compensation:
$200,000 - $250,000 + RSU + Bonus
Location: Mountain View, CA (Relocation assistance available)
```

### Claude's analysis result:
```json
{
  "company": "Google",
  "position": "Senior Software Engineer",
  "description": "Google is hiring a Senior Software Engineer for the Cloud team to design and implement large-scale distributed systems. Requires 8+ years experience, strong distributed systems knowledge, and CS degree or equivalent. Responsibilities include system design, technical reviews, mentoring, and cross-team collaboration. Salary $200-250K.",
  "location": "Mountain View, CA",
  "salary": "$200,000 - $250,000 + RSU + Bonus"
}
```

### Form auto-fill:
- **Company:** Google ✓
- **Position:** Senior Software Engineer ✓
- **Description:** [Extracted summary] ✓
- **Location:** Mountain View, CA ✓
- **Salary:** $200,000 - $250,000 + RSU + Bonus ✓

---

## Example 7: Dark Mode / Accessibility

### Modal appearance on dark mode:
```
Dark background with light text modal overlay
Textarea with good contrast ratio (WCAG AA compliant)
High visibility buttons
Clear focus states for keyboard navigation
```

### Keyboard support:
```
Tab → Navigate through fields
Tab + Shift → Navigate backwards
Ctrl+A → Select all text in textarea
Enter in textarea → New line (not submit)
Escape → Close modal (to be implemented)
```

---

## Quick Reference: Pattern Matching

### What gets filtered out:

| Pattern | Example | Removed? |
|---------|---------|----------|
| Notifications | "0 notifications" | ✅ Yes |
| Skip links | "Skip to main content" | ✅ Yes |
| Job counts | "73 applicants" | ✅ Yes |
| Timestamps | "2 days ago" | ✅ Yes |
| Social share | "Share on LinkedIn" | ✅ Yes |
| Apply buttons | "Easy Apply" | ✅ Yes |
| Cookie prompts | "Accept all cookies" | ✅ Yes |
| Load more | "View more jobs" | ✅ Yes |
| Company size | "1001-5000 employees" | ✅ Yes |
| Navigation | "Home", "Contact", "Login" | ✅ Yes |

### What gets kept:

| Content | Example | Kept? |
|---------|---------|-------|
| Job title | "Senior Developer" | ✅ Yes |
| Company | "Google" | ✅ Yes |
| Location | "San Francisco, CA" | ✅ Yes |
| Description | "We are seeking..." | ✅ Yes |
| Requirements | "5+ years experience" | ✅ Yes |
| Salary | "$200,000 - $250,000" | ✅ Yes |
| Benefits | "Health insurance" | ✅ Yes |
| Responsibilities | "Lead projects" | ✅ Yes |

---

**All examples tested:** ✓ LinkedIn ✓ Indeed ✓ WTTJ ✓ APEC  
**Language support:** ✓ English ✓ French  
**Pattern coverage:** ✓ 14 regex patterns, 20+ markers
