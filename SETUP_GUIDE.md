# JobTrackerAI — Setup Guide

## Prerequisites

Before using JobTrackerAI, you'll need:

### 1. **Anthropic API Key** (Required for AI features)
JobTrackerAI uses Claude AI to power features like:
- Email parsing & status detection
- CV generation & tailoring
- Interview prep (STAR answers)
- Smart follow-up suggestions

**Get your API key:**
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up (free) or sign in
3. Navigate to **API keys** section
4. Create a new API key
5. Copy it (you'll need it in the app)

> Free tier includes $5 credits/month — enough for testing JobTrackerAI

### 2. **Google Account** (For Gmail sync)
JobTrackerAI connects to your Gmail to:
- Auto-import job offers
- Detect rejection emails & ATS responses
- Track interview confirmations
- Extract job descriptions

**Just sign in with Google** — we use OAuth, so your password is never stored.

---

## Using JobTrackerAI

### Step 1: Sign In
1. Go to [jobtracking-three.vercel.app](https://jobtracking-three.vercel.app)
2. Click **"Sign in with Google"**
3. Grant permission to access Gmail

### Step 2: Add Your Anthropic API Key
1. After signing in, go to **Settings** (⚙️)
2. Find **"API Configuration"** section
3. Paste your Anthropic API key
4. Click **Save**

> Your API key is stored **locally** on your device — never sent to our servers.

### Step 3: Start Adding Applications
**4 ways to add job applications:**

- **Gmail:** Auto-imports from your inbox
- **Screenshot:** Take a screenshot of a job posting (LinkedIn, job boards)
- **Firefox Extension:** One-click import from any job board
- **Manual:** Type in details directly

---

## Features That Require API Key

✅ **Email Parsing** — Auto-detects job offers & rejections
✅ **Status Detection** — Identifies ATS rejections, interview dates
✅ **CV Generation** — Creates tailored CVs per job
✅ **STAR Answers** — Generates interview prep
✅ **Follow-up Drafts** — Smart email suggestions
✅ **Advice Panel** — Personalized job search tips

---

## FAQ

### How much will the API cost?
- **Free tier:** $5/month credits (enough for 100-200 API calls)
- **Pay-as-you-go:** ~$0.003 per 1K input tokens, ~$0.015 per 1K output tokens
- Average use case: **$2-5/month** for active job search

### Can I use it without an API key?
Partial. You can:
- ✅ Manually add applications
- ✅ Track applications
- ✅ Filter & search
- ❌ Use AI features (parsing, CV generation, advice)

### Is my API key secure?
Yes:
- Stored locally on your device
- Never sent to our servers
- You control when it's used
- Revoke anytime in Anthropic dashboard

### Can I share my API key with others?
Not recommended. Each person should:
1. Create their own Anthropic account
2. Generate their own API key
3. Use JobTrackerAI separately

---

## Getting Help

- **API Issues:** [Anthropic Docs](https://docs.anthropic.com)
- **Gmail Sync Issues:** Check Gmail permissions in Settings
- **Bug Reports:** [GitHub Issues](https://github.com/deviloufr-ai/jobtracking/issues)

---

**Ready?** [Start using JobTrackerAI](https://jobtracking-three.vercel.app) →
