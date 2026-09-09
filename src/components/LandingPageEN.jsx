import { Icon } from './landingIcons'

const GROUPS = [
  {
    icon: 'layers',
    title: 'Track everything',
    lead: 'Your whole search in one place, kept current for you.',
    items: [
      ['Gmail auto-sync', 'New offers, replies and rejections are detected — no typing.'],
      ['Google Calendar', 'Interviews show up with the meeting link and a day-before nudge.'],
      ['One clean timeline', 'Every step per application, in three views: table, board, by platform.'],
      ["What's next", 'A short, ranked list of who to chase and what to prep today.'],
      ['Alerts that matter', 'New emails, overdue follow-ups, upcoming interviews.'],
    ],
  },
  {
    icon: 'fileText',
    title: 'Apply smarter',
    lead: 'Send a stronger application in a fraction of the time.',
    items: [
      ['CV Studio', 'A CV rewritten for each role, ATS-checked, PDF in one click.'],
      ['Letters & follow-ups', 'Drafts that read human — you always press send.'],
      ['Built-in job search', 'Browse live job boards, see commute times, add roles in a click.'],
      ['Browser extension', 'Scan a results page and score every listing against your CV.'],
    ],
  },
  {
    icon: 'mic',
    title: 'Ace the interview',
    lead: 'Walk in prepared instead of winging it.',
    items: [
      ['Voice mock interview', 'Answer out loud; the AI plays the recruiter and scores you.'],
      ['STAR answers', 'Three ready-to-use stories tailored to each job.'],
      ['Interviews board', 'A dedicated space for every application that reached an interview.'],
      ['Contacts', 'Keep recruiters and referrals together, with reconnect reminders.'],
    ],
  },
  {
    icon: 'scale',
    title: 'Win the offer',
    lead: 'Make the final call with real numbers, not gut feel.',
    items: [
      ['Compensation tracker', 'Base, bonus, equity and perks, side by side.'],
      ['Offer comparison', 'Rank competing offers by total package.'],
      ['Negotiation assistant', 'A message or call script anchored on your actual figures.'],
      ['Analytics', 'Response rate, momentum and a weekly recap — sliced your way.'],
    ],
  },
]

const NEW = [
  { icon: 'search', title: 'Built-in job search', desc: 'Find roles from real job boards and add them without leaving the app.' },
  { icon: 'mic', title: 'Interviews board', desc: 'A home for every interview, with prep always in reach.' },
  { icon: 'scale', title: 'Offers & negotiation', desc: 'Track pay, compare offers, and draft the ask.' },
  { icon: 'sparkles', title: 'Bring your own AI', desc: 'Use Claude, Gemini, or an OpenAI-compatible key — your choice.' },
]

const WHO = [
  { icon: 'zap', title: 'Active job seeker', desc: 'You send 20–50 applications a month and juggle replies, interviews and offers. The spreadsheet gave up weeks ago.' },
  { icon: 'repeat', title: 'Career switcher', desc: 'New field, fresh start. You want a clear plan, real interview practice, and honest feedback on your CV.' },
  { icon: 'target', title: 'Senior, repositioning', desc: '10+ years in, chasing a handful of premium roles. You need sharp signal, not more noise.' },
]

export default function LandingPageEN({ onLogin }) {
  return (
    <div className="sjt">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');

        * { box-sizing: border-box; }

        .sjt {
          --paper:#f7f3ec; --card:#fffdf8; --ink:#1e1a15; --body:#4f473d;
          --muted:#8a8175; --line:#e8e1d4; --line-2:#ddd3c2;
          --accent:#b04a24; --accent-dark:#8f3a1a; --accent-soft:#f4e5da;
          background:var(--paper); color:var(--body);
          font-family:'Inter', system-ui, -apple-system, sans-serif;
          line-height:1.6; min-height:100vh; -webkit-font-smoothing:antialiased;
        }
        .sjt ::selection { background:var(--accent-soft); }
        .serif { font-family:'Fraunces', Georgia, 'Times New Roman', serif; font-optical-sizing:auto; }
        .wrap { max-width:1080px; margin:0 auto; padding:0 24px; }

        .nav { display:flex; align-items:center; justify-content:space-between; padding:22px 0; }
        .brand { display:flex; align-items:center; gap:11px; font-weight:600; font-size:17px; color:var(--ink); letter-spacing:-0.01em; }
        .brand-mark { width:28px; height:28px; border-radius:8px; background:var(--accent); color:#fff; display:grid; place-items:center; font-family:'Fraunces',serif; font-weight:600; font-size:16px; }

        .btn { font-family:inherit; font-weight:600; font-size:15px; padding:12px 20px; border-radius:11px; text-decoration:none; display:inline-flex; align-items:center; gap:9px; cursor:pointer; border:1px solid transparent; transition:transform .15s ease, background .15s ease, border-color .15s ease; }
        .btn-primary { background:var(--accent); color:#fff; box-shadow:0 1px 2px rgba(30,26,21,.12); }
        .btn-primary:hover { background:var(--accent-dark); transform:translateY(-1px); }
        .btn-ghost { background:transparent; color:var(--ink); border-color:var(--line-2); }
        .btn-ghost:hover { border-color:var(--ink); }
        .nav .btn { padding:10px 16px; font-size:14px; }

        .kick { font-size:12.5px; font-weight:600; letter-spacing:.09em; text-transform:uppercase; color:var(--accent); margin-bottom:14px; }
        .pill { display:inline-flex; align-items:center; gap:8px; font-size:13px; font-weight:600; letter-spacing:.02em; color:var(--accent-dark); background:var(--accent-soft); padding:6px 13px; border-radius:999px; }

        .hero { padding:38px 0 22px; }
        .hero h1 { font-weight:500; font-size:clamp(37px,5.4vw,60px); line-height:1.04; letter-spacing:-0.022em; color:var(--ink); margin:22px 0 0; max-width:800px; }
        .hl { background:linear-gradient(transparent 60%, var(--accent-soft) 60%); padding:0 .04em; }
        .lede { margin:20px 0 0; font-size:18px; color:var(--body); max-width:600px; }
        .ctas { margin-top:30px; display:flex; gap:12px; flex-wrap:wrap; }
        .free { margin:18px 0 0; font-size:14px; color:var(--muted); max-width:560px; }

        .flow { margin-top:44px; background:var(--card); border:1px solid var(--line); border-radius:18px; padding:26px 28px 24px; box-shadow:0 1px 3px rgba(30,26,21,.05); }
        .flow-label { font-size:13px; color:var(--muted); margin-bottom:22px; }
        .flow-steps { position:relative; display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
        .flow-steps::before { content:""; position:absolute; top:16px; left:6%; right:6%; height:2px; background:var(--line-2); }
        .flow-fill { position:absolute; top:16px; left:6%; height:2px; background:var(--accent); width:0; animation:grow 2.2s cubic-bezier(.6,.02,.3,1) forwards .35s; }
        @keyframes grow { to { width:44%; } }
        .fstep { position:relative; z-index:1; }
        .fnode { width:34px; height:34px; border-radius:50%; border:2px solid var(--line-2); background:var(--paper); display:grid; place-items:center; font-size:12.5px; font-weight:600; color:var(--muted); }
        .fstep.on .fnode { border-color:var(--accent); background:var(--accent); color:#fff; }
        .fstep h4 { margin:13px 0 3px; font-size:14.5px; font-weight:600; color:var(--ink); }
        .fstep p { margin:0; font-size:12.5px; color:var(--muted); line-height:1.45; max-width:175px; }

        .section { padding:54px 0; border-top:1px solid var(--line); }
        .head { max-width:660px; margin-bottom:36px; }
        .head h2 { font-weight:500; font-size:clamp(27px,3.4vw,35px); line-height:1.12; letter-spacing:-0.018em; color:var(--ink); margin:0; }
        .head p { margin:13px 0 0; font-size:16.5px; color:var(--body); }

        .steps { display:grid; grid-template-columns:repeat(4,1fr); gap:22px; }
        .step .n { font-family:'Fraunces',serif; font-size:34px; font-weight:500; color:var(--accent); line-height:1; }
        .step h3 { margin:14px 0 6px; font-size:16px; font-weight:600; color:var(--ink); }
        .step p { margin:0; font-size:14px; color:var(--body); }

        .groups { display:grid; grid-template-columns:repeat(2,1fr); gap:18px; }
        .group { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:28px; box-shadow:0 1px 3px rgba(30,26,21,.04); }
        .group-top { display:flex; align-items:center; gap:13px; margin-bottom:6px; }
        .group-ic { width:42px; height:42px; border-radius:12px; background:var(--accent-soft); color:var(--accent-dark); display:grid; place-items:center; flex-shrink:0; }
        .group h3 { margin:0; font-family:'Fraunces',serif; font-size:21px; font-weight:600; letter-spacing:-0.01em; color:var(--ink); }
        .group .lead { margin:0 0 18px; font-size:14px; color:var(--muted); }
        .flist { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:13px; }
        .flist li { display:flex; gap:11px; align-items:flex-start; font-size:14px; color:var(--body); line-height:1.5; }
        .flist .li-ic { color:var(--accent); flex-shrink:0; margin-top:3px; }
        .flist b { color:var(--ink); font-weight:600; }

        .new-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; }
        .newcard { position:relative; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:24px 22px; }
        .newcard .nc-ic { color:var(--accent); margin-bottom:15px; }
        .newcard h3 { margin:0 0 7px; font-size:15.5px; font-weight:600; color:var(--ink); }
        .newcard p { margin:0; font-size:13.5px; color:var(--muted); line-height:1.5; }
        .badge { position:absolute; top:15px; right:15px; font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--accent-dark); background:var(--accent-soft); border-radius:6px; padding:3px 7px; }

        .android { display:flex; align-items:center; gap:22px; flex-wrap:wrap; background:var(--card); border:1px solid var(--line); border-radius:18px; padding:26px 28px; box-shadow:0 1px 3px rgba(30,26,21,.04); }
        .android-ic { width:56px; height:56px; border-radius:14px; background:var(--accent-soft); color:var(--accent-dark); display:grid; place-items:center; flex-shrink:0; }
        .android .txt { flex:1; min-width:220px; }
        .android .txt b { display:block; font-family:'Fraunces',serif; font-size:18px; font-weight:600; color:var(--ink); margin-bottom:4px; }
        .android .txt span { font-size:14px; color:var(--muted); }

        .who { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
        .who-card { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:28px; }
        .who-ic { width:42px; height:42px; border-radius:12px; background:var(--accent-soft); color:var(--accent-dark); display:grid; place-items:center; margin-bottom:16px; }
        .who-card h3 { margin:0 0 9px; font-family:'Fraunces',serif; font-size:18px; font-weight:600; color:var(--ink); }
        .who-card p { margin:0; font-size:14px; color:var(--body); }

        footer { border-top:1px solid var(--line); padding:44px 0 56px; }
        .foot { display:grid; grid-template-columns:1.6fr 1fr 1fr; gap:36px; }
        .foot h4 { font-size:12px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin:0 0 14px; }
        .foot .origin { font-size:14px; color:var(--body); line-height:1.7; max-width:440px; }
        .foot .stack { font-size:14px; color:var(--body); line-height:1.9; }
        .foot-links { display:flex; flex-direction:column; gap:10px; font-size:14px; }
        .foot-links a { color:var(--body); text-decoration:none; display:inline-flex; align-items:center; gap:7px; }
        .foot-links a:hover { color:var(--accent); }

        @media (max-width:860px) {
          .flow-steps { grid-template-columns:1fr 1fr; row-gap:26px; }
          .flow-steps::before, .flow-fill { display:none; }
          .fstep p { max-width:none; }
          .steps { grid-template-columns:1fr 1fr; }
          .groups { grid-template-columns:1fr; }
          .new-grid { grid-template-columns:1fr 1fr; }
          .who { grid-template-columns:1fr; }
          .foot { grid-template-columns:1fr; gap:28px; }
        }
        @media (max-width:520px) {
          .steps, .new-grid { grid-template-columns:1fr; }
          .nav .brand span.full { display:none; }
        }
      `}</style>

      <div className="wrap">
        {/* NAV */}
        <nav className="nav">
          <div className="brand">
            <span className="brand-mark">S</span>
            <span className="full">SmartJobTracker</span>
          </div>
          <button onClick={onLogin} className="btn btn-primary">Sign in with Google</button>
        </nav>

        {/* HERO */}
        <header className="hero">
          <span className="pill">Your job search, finally organized</span>
          <h1 className="serif">Every job you're chasing, in <span className="hl">one calm place</span>.</h1>
          <p className="lede">SmartJobTracker reads your inbox, tracks every application, tailors your CV, rehearses your interviews, and helps you weigh the offer — so you can run 15 to 50 applications at once without living in a spreadsheet.</p>
          <div className="ctas">
            <button onClick={onLogin} className="btn btn-primary">Sign in with Google</button>
            <a href="https://github.com/deviloufr-ai/jobtracking" target="_blank" rel="noreferrer" className="btn btn-ghost">
              <Icon name="github" size={17} /> See the code
            </a>
          </div>
          <p className="free">Free to start — 15 AI actions on us. After that, plug in your own free API key (Claude, Gemini, or OpenAI). Your data stays yours.</p>

          {/* LIFECYCLE */}
          <div className="flow">
            <div className="flow-label">Every application moves through the same simple pipeline — kept up to date for you.</div>
            <div className="flow-steps">
              <div className="flow-fill" />
              {[
                ['01', 'Applied', 'Spotted in Gmail and added on its own — no manual entry.', true],
                ['02', 'In progress', 'Status updates with every reply, follow-up and rejection.', true],
                ['03', 'Interview', 'Tailored CV, STAR answers and a voice rehearsal — ready for the day.', false],
                ['04', 'Offer', 'Compare, negotiate, decide. Your history stays for next time.', false],
              ].map(([n, title, desc, on]) => (
                <div key={n} className={`fstep${on ? ' on' : ''}`}>
                  <div className="fnode">{n}</div>
                  <h4>{title}</h4>
                  <p>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* HOW IT WORKS */}
        <section className="section">
          <div className="head">
            <div className="kick">How it works</div>
            <h2 className="serif">From inbox chaos to a clear next move.</h2>
          </div>
          <div className="steps">
            {[
              ['1', 'Add', 'Connect Gmail, snap a screenshot, use the browser extension, or search job boards inside the app.'],
              ['2', 'Organize', 'Applications sort themselves. Statuses, replies and rejections are detected automatically.'],
              ['3', 'Prepare', 'Tailor a CV, draft the follow-up, and rehearse the interview out loud.'],
              ['4', 'Decide', "Compare offers, plan the negotiation, and see what's actually working."],
            ].map(([n, title, desc]) => (
              <div key={n} className="step">
                <div className="n serif">{n}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FEATURE GROUPS */}
        <section className="section">
          <div className="head">
            <div className="kick">What you get</div>
            <h2 className="serif">One tool for the whole journey.</h2>
            <p>From the first application to the signed offer — organize, write, rehearse and decide, without ever opening a spreadsheet.</p>
          </div>
          <div className="groups">
            {GROUPS.map((g) => (
              <div key={g.title} className="group">
                <div className="group-top">
                  <span className="group-ic"><Icon name={g.icon} size={22} /></span>
                  <h3>{g.title}</h3>
                </div>
                <p className="lead">{g.lead}</p>
                <ul className="flist">
                  {g.items.map(([t, d]) => (
                    <li key={t}>
                      <span className="li-ic"><Icon name="check" size={17} strokeWidth={2} /></span>
                      <span><b>{t}</b> — {d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* NEW */}
        <section className="section">
          <div className="head">
            <div className="kick">New</div>
            <h2 className="serif">Fresh out of the workshop.</h2>
            <p>The latest additions take you past the offer stage — find the job, prep the interview, and close the deal.</p>
          </div>
          <div className="new-grid">
            {NEW.map((c) => (
              <div key={c.title} className="newcard">
                <span className="badge">New</span>
                <div className="nc-ic"><Icon name={c.icon} size={24} /></div>
                <h3>{c.title}</h3>
                <p>{c.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ANDROID */}
        <section className="section">
          <div className="head">
            <div className="kick">Android</div>
            <h2 className="serif">Take it with you.</h2>
            <p>The same app, native on Android and synced with the web. Install the APK directly — allow “unknown sources” when prompted.</p>
          </div>
          <div className="android">
            <span className="android-ic"><Icon name="smartphone" size={28} /></span>
            <div className="txt">
              <b>SmartJobTracker for Android</b>
              <span>Direct download · Android 7+ · synced with the web version</span>
            </div>
            <a href="/smartjobtracker.apk" download className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
              <Icon name="download" size={17} /> Download the APK
            </a>
          </div>
        </section>

        {/* WHO */}
        <section className="section">
          <div className="head">
            <div className="kick">Who it's for</div>
            <h2 className="serif">Made for a real, active search.</h2>
          </div>
          <div className="who">
            {WHO.map((w) => (
              <div key={w.title} className="who-card">
                <span className="who-ic"><Icon name={w.icon} size={22} /></span>
                <h3>{w.title}</h3>
                <p>{w.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FOOTER */}
        <footer>
          <div className="foot">
            <div>
              <h4>About SmartJobTracker</h4>
              <p className="origin">Built by <b>Alexandre Leblanc</b> — a senior product manager who got tired of running his own job search from a spreadsheet. What started as a personal fix grew into a full product, and a demonstration of what one PM can ship at the intersection of product thinking, low-code, and AI. A personal project, in active development.</p>
            </div>
            <div>
              <h4>Built with</h4>
              <div className="stack">
                React · Tailwind · Vite<br />
                Vercel serverless<br />
                Claude, Gemini or OpenAI (your key)<br />
                Gmail &amp; Calendar<br />
                Supabase (accounts + sync)
              </div>
            </div>
            <div>
              <h4>Links</h4>
              <div className="foot-links">
                <a href="https://smartjobtracker.com" target="_blank" rel="noreferrer"><Icon name="arrow" size={15} /> smartjobtracker.com</a>
                <a href="https://github.com/deviloufr-ai/jobtracking" target="_blank" rel="noreferrer"><Icon name="arrow" size={15} /> GitHub</a>
                <a href="/privacy-policy.html" target="_blank" rel="noreferrer"><Icon name="arrow" size={15} /> Privacy Policy</a>
                <a href="/terms-of-service.html" target="_blank" rel="noreferrer"><Icon name="arrow" size={15} /> Terms of Service</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
