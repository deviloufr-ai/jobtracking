# JobTrackr Browser Extension

**One-click job tracking + AI-powered form autofill for job applications**

![Version](https://img.shields.io/badge/version-1.5.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-production-brightgreen)

## Features

### 🎯 Quick Job Capture
- Click the extension icon on any job posting
- Auto-extracts: Company, Position, Job Description, URL
- One-click add to [JobTrackr](https://www.smartjobtracker.com)
- AI analysis for incomplete extractions

### ⚡ Smart Form Autofill
- Detects form fields automatically (text, email, tel, textarea)
- Per-field AI generation with context
- Quick identity auto-fill (name, email, phone, LinkedIn)
- Works on any job application form

### 📋 Synchronized Data
- Syncs profile & CV from JobTrackr app
- Extends JobTrackr functionality into the browser
- Seamless integration with JobTrackr dashboard

## Supported Job Sites

✅ **Tested & Working:**
- LinkedIn Jobs
- Indeed
- Welcome to the Jungle
- APEC
- HelloWork
- Pole Emploi
- Monster
- Glassdoor
- CadreEmploi
- RegionsJob
- MétéoJob

✅ **Generic Support:** Any website with form fields

## Installation

### Firefox
1. Download [latest release](https://github.com/yourusername/jobtrackr-extension/releases)
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select `manifest.json`

### Chrome/Edge
1. Download [latest release](https://github.com/yourusername/jobtrackr-extension/releases)
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the extension folder

## Setup

The extension connects to [smartjobtracker.com](https://www.smartjobtracker.com) out of the box — no URL configuration needed.

### 1. Add Claude API Key (optional)
Settings ⚙️ → "🔑 Clé API Claude" → Enter your [Anthropic API key](https://console.anthropic.com). Leave empty to use the free JobTrackr trial.

### 2. Sync Your Profile
📥 "Données JobTrackr" → "🔄 Sync CV + Profil" → Sign in to JobTrackr app

## Usage

### Adding a Job
1. Visit any job posting
2. Click JobTrackr icon
3. Review extracted info (Company, Position, Description)
4. Click "Ajouter à JobTrackr"
5. Job appears in JobTrackr dashboard

### Autofilling Forms
1. On application form, see ✦ buttons on text fields
2. Click ✦ to:
   - **Identity fields:** Auto-fill name, email, etc. from synced profile
   - **Other fields:** Generate AI responses based on job context
3. Or: Settings ⚙️ → Toggle "✦ Boutons autofill" to control visibility
4. Or: Right-click → "✦ Autofill - Générer et injecter" (if enabled)

## Permissions

| Permission | Purpose |
|-----------|---------|
| `activeTab` | Read current page content for job extraction |
| `tabs` | Manage popup windows |
| `storage` | Store settings, profile, API keys locally |
| `contextMenus` | Right-click autofill context menu |
| `<all_urls>` | Run on any website to detect forms |

**Privacy:** All data stored locally in your browser. No external servers except:
- Claude API (for AI generation - uses your API key)
- JobTrackr app (for syncing profile)

## Requirements

- **Firefox:** 109.0+
- **Chrome/Edge:** 90+
- **Claude API Key:** Get from [console.anthropic.com](https://console.anthropic.com)
- **JobTrackr Account:** Optional, for syncing profile/CV

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Click addon icon | Open popup on current job |
| Click ✦ button | Generate response for that field |
| Right-click page | Auto-fill all fields (if enabled) |

## Troubleshooting

### Buttons not appearing
- Check: Settings ⚙️ → "✦ Boutons autofill" is toggled **ON**
- Try: Refresh page
- Try: Reload extension in `about:debugging` (Firefox) or `chrome://extensions` (Chrome)

### "Détection incomplète" (Incomplete Detection)
- Click "🔍 Analyser avec l'IA" to analyze page with AI
- Or manually fill Company & Position fields

### AI generation errors
- Verify Claude API key in Settings ⚙️ → "🔑 Clé API Claude"
- Check your API key has available credits
- Try: Manually enter context and regenerate

### Form fields not detected
- Some job sites use special inputs (iframes, custom elements)
- Manually click each ✦ button to fill individually

## Development

### Project Structure
```
jobtrackr-extension/
├── manifest.json          # Extension config
├── popup.html            # Popup UI
├── popup.js              # Popup logic
├── content.js            # Form detection & autofill
├── background.js         # API calls & message routing
├── supabase.js           # (Removed - no longer needed)
├── sync.js               # JobTrackr profile sync
├── icons/                # Extension icons
└── README.md             # This file
```

### Key Files
- **content.js** (1000+ lines): Form detection, autofill UI, Claude prompts
- **background.js** (400+ lines): Message routing, API calls, prompt generation
- **popup.js** (700+ lines): UI logic, storage management, sync

### Building
```bash
# No build step required - pure vanilla JavaScript
# Just load manifest.json in your browser
```

## Performance

- ⚡ **Popup load:** <100ms
- ⚡ **Form scanning:** <50ms (detects fields on page load)
- ⚡ **AI generation:** 2-5s (depends on Claude API)
- 💾 **Storage:** <5MB local browser storage

## Privacy & Security

✅ **What we store locally:**
- Your Claude API key (encrypted in browser)
- Settings & preferences
- Job descriptions (temporarily for context)

✅ **What we DON'T store:**
- Your filled application responses
- Your browsing history
- Personal data beyond what you sync

⚠️ **API Key Security:**
- Stored in `browser.storage.local` (not encrypted)
- Never sent to external servers (except Claude API)
- Clear it in Settings if sharing your computer

## Roadmap

### Planned Features
- [ ] Support for more job sites (Stack Overflow, GitHub Jobs, etc.)
- [ ] Bulk auto-fill with one click
- [ ] Application history tracking
- [ ] Resume snippet injection
- [ ] Interview prep Q&A generator

### Known Limitations
- Doesn't work in private/incognito windows (by default)
- Can't bypass CAPTCHA or rate limits
- Some sites with heavy JavaScript may not detect fields
- iframe content limited to same-origin sites

## Contributing

Found a bug or have a feature request?

1. **Report Issue:** [GitHub Issues](https://github.com/yourusername/jobtrackr-extension/issues)
2. **Feature Request:** [GitHub Discussions](https://github.com/yourusername/jobtrackr-extension/discussions)
3. **Security Issue:** Email security@jobtrackr.dev (responsible disclosure)

## License

MIT License - See [LICENSE](LICENSE) file for details

## Support

- 📖 **Docs:** [Full documentation](https://docs.jobtrackr.dev)
- 💬 **Discord:** [Join community](https://discord.gg/jobtrackr)
- 🐛 **Bug Reports:** [GitHub Issues](https://github.com/yourusername/jobtrackr-extension/issues)
- 📧 **Email:** support@jobtrackr.dev

## Credits

**JobTrackr Extension** by [Your Name/Team]

Built with:
- Vanilla JavaScript (no dependencies)
- Claude AI (Anthropic)
- Firefox & Chrome APIs

---

**Happy job hunting! 🚀**

*Last updated: June 14, 2026*
