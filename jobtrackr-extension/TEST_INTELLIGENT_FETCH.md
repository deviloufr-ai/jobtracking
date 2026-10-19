# Testing Guide: Intelligent Text Extraction & Review

## Quick Test Checklist

### Test 1: Basic Text Extraction & Filtering
**Steps:**
1. Go to any LinkedIn job page
2. Open JobTrackr popup
3. Click "🔍 Analyze with AI"
4. **Expected:** Modal appears with cleaned text (no "0 notifications", skip links, etc.)

**Verify:**
- [ ] Modal shows extracted text
- [ ] Text is readable and organized
- [ ] No "Skip to" links in text
- [ ] No notification counts present
- [ ] Actual job details are visible

---

### Test 2: Text Review & Editing
**Steps:**
1. In the review modal, review the extracted text
2. Delete or edit any unwanted sections
3. Click "✓ Use this text"
4. Wait for AI analysis

**Verify:**
- [ ] You can edit the textarea
- [ ] Text selection works (Ctrl+A)
- [ ] Changes are preserved when confirming
- [ ] Modal closes after confirmation

---

### Test 3: Modal Cancellation
**Steps:**
1. Open review modal
2. Click "Ignore" button (or click outside modal)
3. Check if analysis continues

**Verify:**
- [ ] Modal closes when clicking "Ignore"
- [ ] Modal closes when clicking X button
- [ ] Modal closes when clicking overlay background
- [ ] AI analysis uses default extracted text (not edited)

---

### Test 4: Different Job Sites
Test extraction on different platforms:

**LinkedIn** ✓
- Job title, company, description clearly visible
- No LinkedIn UI elements (like/share counts)

**Indeed** ✓
- Company name extracted correctly
- No sidebar content mixed in

**Welcome to the Jungle** ✓
- Sections separated (Description, Requirements, etc.)
- Location and salary visible

**Custom Sites** ✓
- Review modal works on any site
- Text is extracted even if not a known job site

---

### Test 5: Content Start Detection
**Steps:**
1. Go to a job page with multiple headers/sections before job content
2. Click "Analyze with AI"
3. **Expected:** Modal starts showing content from "Job Title" or "Company Name" area, not from page header

**Verify:**
- [ ] Content starts at job information
- [ ] Not showing website header/navigation
- [ ] First visible text is relevant to job

---

### Test 6: AI Analysis with Cleaned Text
**Steps:**
1. Review and confirm extracted text
2. Watch AI analysis complete
3. Check if form is filled with:
   - Company name
   - Job position
   - Description
   - Location (if available)
   - Salary (if available)

**Verify:**
- [ ] Company field auto-fills
- [ ] Position field auto-fills
- [ ] Description is relevant
- [ ] No generic/meaningless text in fields

---

### Test 7: Modal Styling & UX
**Steps:**
1. Open modal and check appearance
2. Resize browser/popup window
3. Scroll in textarea with long text

**Verify:**
- [ ] Modal is properly centered
- [ ] Textarea has scrollbar for long content
- [ ] Buttons are accessible and readable
- [ ] Modal doesn't overflow screen
- [ ] Text is legible with good contrast

---

### Test 8: Pattern Filtering Examples
These patterns should be automatically removed:

**Navigation text:**
- ✓ "0 notifications"
- ✓ "Skip to search"
- ✓ "Skip to main content"
- ✓ "Menu"

**Social interactions:**
- ✓ "123 likes"
- ✓ "45 comments"
- ✓ "Share to LinkedIn"
- ✓ "Follow company"

**Metadata:**
- ✓ "2 days ago"
- ✓ "1 hour ago"
- ✓ "73 applicants"
- ✓ "View all applicants"

**Legal/Cookie:**
- ✓ "Cookie settings"
- ✓ "Privacy policy"
- ✓ "Accept all cookies"

**Ads:**
- ✓ "Promoted"
- ✓ "Sponsored"
- ✓ "View more jobs"
- ✓ "Load more"

---

## Debugging Tips

### If modal doesn't appear:
1. Check browser console (F12) for errors
2. Verify the page has enough text (>100 chars)
3. Ensure content script is loaded (`window.__jtLoaded` should be `true`)

### If text seems incomplete:
1. Check if actual job content is on page
2. Some sites load content dynamically - wait a moment
3. Manual review modal still lets you paste full text

### If AI analysis fails:
1. Check if text is visible in review modal
2. Verify API connection is working
3. Try with "Ignore" button (skip review) to test basic extraction

---

## Performance Notes

- **Text extraction:** <200ms for typical job page
- **Modal render:** <50ms
- **AI analysis:** 2-5 seconds depending on text length
- **Total flow:** 3-8 seconds from click to form auto-fill

---

## Sample Test URLs

**LinkedIn:**
- https://www.linkedin.com/jobs/view/[job-id]/

**Indeed:**
- https://www.indeed.com/viewjob?jk=[job-key]

**Welcome to the Jungle:**
- https://www.welcometothejungle.com/jobs/[company]/[job-id]

**APEC (French):**
- https://www.apec.fr/candidat/recherche-emploi.html

---

## Reporting Issues

If something doesn't work:
1. Open F12 Developer Tools
2. Go to Console tab
3. Click the button that's failing
4. Copy any error messages
5. Note the website you were on
6. Screenshot the extracted text in the modal

**Sample error report:**
```
Website: LinkedIn
Button: Analyze with AI
Error: undefined is not a function
Text shown in modal: [Yes/No]
```

---

**Version:** 1.0  
**Last Updated:** 2026-06-15
