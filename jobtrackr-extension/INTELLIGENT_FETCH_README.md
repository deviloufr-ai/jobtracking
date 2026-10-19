# Intelligent Text Extraction & Review System

## Overview
The extension now intelligently extracts and filters page text before AI analysis, and allows you to review and edit the extracted content before it's processed.

## What's New

### 1. **Smart Text Filtering** (content.js)
Automatically removes common navigation and UI clutter:
- Notification counts ("0 notifications")
- Skip links ("Skip to search", "Skip to main content")
- Social interactions ("Like", "Share", "Follow")
- Cookie/legal banners
- Load more buttons
- Applicant counts and metadata
- Timestamps ("2 days ago", "1 hour ago")

**Before:**
```
0 notificationsSkip to searchSkip to main contentSkip to primary contentSkip to asideSkip to footerJobgetherSenior Project LeaderFrance · 2 days ago · 73 applicantsNo response insights available yetRe…
```

**After:**
```
Senior Project Leader
France
Job Description: [actual content]
Requirements: [actual content]
```

### 2. **Content Start Detection** (content.js)
Automatically finds where meaningful job content begins by detecting markers:
- "Job Title", "Position", "Company Name"
- "About This Job", "Job Description", "Requirements"
- "What You'll Do", "Responsibilities", "Qualifications"
- French equivalents: "Poste", "Description du Poste", "Compétences Requises"

### 3. **Review Modal** (popup.html + popup.js)
When using "Analyze with AI" button:
1. Extracted text is displayed in an editable modal
2. You can review and clean up any remaining unwanted content
3. Remove sections manually if needed
4. Click "✓ Use this text" to proceed with AI analysis
5. Click "Ignore" to skip review and use default text

### 4. **Clean & Review Flow**

```
User clicks "Analyze with AI"
    ↓
Content script extracts full text
    ↓
Removes nav patterns & finds content start
    ↓
Shows REVIEW MODAL with cleaned text
    ↓
User edits (optional) and clicks "Use this text"
    ↓
Cleaned text sent to Claude AI
    ↓
AI extracts: Company, Position, Description, Location, Salary
```

## How to Use

### Analyzing a Job Page
1. Open a job posting (LinkedIn, Indeed, WTTJ, etc.)
2. Click the JobTrackr popup
3. Click **"🔍 Analyze with AI"** button
4. A modal appears with the extracted page text
5. Review the content:
   - ✓ Green checkmark = Good content
   - ✗ Delete nav clutter if needed
   - Edit descriptions as desired
6. Click **"✓ Use this text"** to proceed
7. AI analyzes and extracts job details
8. Form auto-fills with Company, Position, Description

### Skipping Review
If you want to skip the review modal:
1. Click **"Ignore"** button in the modal
2. The default extracted text will be used
3. Or wait for the auto-detect to complete without editing

## Technical Details

### Nav Patterns Filtered
The system automatically filters these patterns:
- `\d+ notifications|messages|alerts`
- `skip to [search|main|content]`
- `load more|view more|show more`
- `easy apply|quick apply|apply now`
- `promoted|sponsored|advertisement`
- `like|share|save|follow|report`
- `cookie|privacy|terms`
- Timestamps: `ago`, `min`, `hour`, `day`, `week`
- Single characters: `+`, `-`, `×`, `©`, `®`

### Content Start Markers (Priorities)
1. High priority: "Job Title", "Position", "Company Name", "Job Description"
2. Medium: "About This Job", "Requirements", "Qualifications"
3. Action: "What You'll Do", "Responsibilities"
4. French: "Poste", "Entreprise", "Description du Poste"

### Message Protocol
**New message type:** `GET_CLEANED_TEXT`
- Request: `{ type: 'GET_CLEANED_TEXT' }`
- Response: `{ text: '<cleaned and filtered text>' }`

## Files Modified

### content.js
- Added `NAV_PATTERNS` array (14+ regex patterns)
- Added `CONTENT_START_MARKERS` array (20+ keywords)
- Added `isNavLine()` function
- Added `findContentStart()` function
- Added `cleanAndFilterText()` function
- Enhanced `getFullPageText()` to use cleaning
- Added `GET_CLEANED_TEXT` message handler

### popup.html
- Added `review-modal` div with textarea
- Added instructions and help text
- Added modal styling and layout

### popup.js
- Added `reviewedText` and `showReviewNextAnalysis` variables
- Added `showTextReviewModal()` async function
- Updated screenshot button handler to call `GET_CLEANED_TEXT`
- Updated `autoAnalyzeWithAI()` to show review modal
- Added modal event listeners (confirm, cancel, close)

## Example Results

### LinkedIn Job Page
**Raw extracted text (50+ lines):**
```
0 notifications
Skip to search
Skip to main content
Job functions
Easy Apply
Senior Project Leader
France
2 days ago
73 applicants
No response insights...
[AD content]
About this job...
```

**After filtering:**
```
Senior Project Leader
France
About this job...
Job description details...
Requirements...
Qualifications...
```

## Testing

Test the feature on these job sites:
- LinkedIn ✓
- Indeed ✓
- Welcome to the Jungle ✓
- APEC ✓
- Glassdoor ✓
- Any custom job posting site

## Future Improvements

- [ ] Add toggle to disable review modal per session
- [ ] Save user's text edits in localStorage for similar sites
- [ ] Add text statistics (word count, sections detected)
- [ ] Pattern learning based on site structure
- [ ] Export reviewed text as .txt file

---

**Version:** 1.6.0  
**Released:** 2026-06-15  
**Status:** ✅ Ready to test
