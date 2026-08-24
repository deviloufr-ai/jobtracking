export default function LandingPageEN({ onLogin }) {
  return (
    <div style={{
      background: '#0c0f16',
      color: '#eef0f6',
      fontFamily: "'Inter', sans-serif",
      lineHeight: 1.55,
      minHeight: '100vh'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

        * { box-sizing: border-box; }

        .page {
          max-width: 1040px;
          margin: 0 auto;
          padding: 0 28px;
        }

        .nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 26px 0;
          border-bottom: 1px solid #2b3242;
        }

        .wordmark {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          font-size: 19px;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .dot {
          width: 10px;
          height: 10px;
          border-radius: 2px;
          background: #7b7bf7;
          transform: rotate(45deg);
        }

        .hero {
          padding: 64px 0 56px;
        }

        .eyebrow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #7b7bf7;
          margin-bottom: 18px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .eyebrow::before {
          content: "";
          display: block;
          width: 26px;
          height: 1px;
          background: #7b7bf7;
        }

        .hero h1 {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 50px;
          font-weight: 700;
          line-height: 1.12;
          letter-spacing: -1px;
          max-width: 760px;
          margin: 0;
        }

        .hero h1 em {
          font-style: normal;
          color: #7b7bf7;
        }

        .lede {
          margin-top: 20px;
          font-size: 17px;
          color: #9aa3ba;
          max-width: 580px;
        }

        .ctas {
          margin-top: 32px;
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .btn {
          font-family: 'Inter', sans-serif;
          font-weight: 600;
          font-size: 14px;
          padding: 12px 22px;
          border-radius: 8px;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: transform .15s ease, border-color .15s ease;
          border: none;
          cursor: pointer;
        }

        .btn-primary {
          background: #7b7bf7;
          color: #0c0f16;
        }

        .btn-primary:hover {
          transform: translateY(-1px);
        }

        .btn-secondary {
          background: transparent;
          color: #eef0f6;
          border: 1px solid #2b3242;
        }

        .btn-secondary:hover {
          border-color: #7b7bf7;
        }

        .badge {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: #0c0f16;
          background: #f4a73c;
          border-radius: 4px;
          padding: 2px 7px;
          font-weight: 700;
        }

        .pipeline {
          margin-top: 56px;
          background: #161b26;
          border: 1px solid #2b3242;
          border-radius: 14px;
          padding: 28px 28px 22px;
          overflow: hidden;
          position: relative;
        }

        .pipeline-label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #6b7488;
          margin-bottom: 24px;
        }

        .pipeline-track {
          position: relative;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
        }

        .pipeline-track::before {
          content: "";
          position: absolute;
          top: 17px;
          left: 5%;
          right: 5%;
          height: 2px;
          background: #2b3242;
          z-index: 0;
        }

        .stage {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .node {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 2px solid #2b3242;
          background: #0c0f16;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          font-weight: 600;
          color: #9aa3ba;
          margin-bottom: 14px;
        }

        .stage.active .node {
          border-color: #7b7bf7;
          color: #7b7bf7;
          background: rgba(123,123,247,0.14);
        }

        .stage-title {
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 4px;
        }

        .stage-desc {
          font-size: 12.5px;
          color: #6b7488;
          line-height: 1.45;
          max-width: 180px;
        }

        .runner {
          position: absolute;
          top: 13px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #7b7bf7;
          box-shadow: 0 0 0 4px rgba(123,123,247,0.12);
          animation: run 9s linear infinite;
        }

        @keyframes run {
          0% { left: 5%; opacity: 0; }
          8% { opacity: 1; }
          92% { opacity: 1; }
          100% { left: 95%; opacity: 0; }
        }

        section { padding: 56px 0; }

        .section-head {
          margin-bottom: 32px;
        }

        .kicker {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #6b7488;
          margin-bottom: 10px;
        }

        .section-head h2 {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 30px;
          font-weight: 700;
          letter-spacing: -0.5px;
          margin: 0;
        }

        .section-head p {
          margin-top: 10px;
          color: #9aa3ba;
          max-width: 600px;
          font-size: 15px;
        }

        .problem-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: #2b3242;
          border: 1px solid #2b3242;
          border-radius: 12px;
          overflow: hidden;
        }

        .problem-item {
          background: #161b26;
          padding: 22px;
        }

        .problem-item .num {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          color: #f4a73c;
          margin-bottom: 10px;
        }

        .problem-item h3 {
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 6px;
          margin-top: 0;
        }

        .problem-item p {
          font-size: 13px;
          color: #9aa3ba;
          margin: 0;
        }

        .spotlight-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .spotlight {
          background: #161b26;
          border: 1px solid #2b3242;
          border-radius: 14px;
          padding: 26px;
          transition: border-color .15s ease;
        }

        .spotlight:hover { border-color: #7b7bf7; }

        .spotlight-head {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
        }

        .spotlight-head .s-icon { font-size: 26px; }

        .spotlight-head h3 {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 18px;
          font-weight: 700;
          margin: 0;
          flex: 1;
        }

        .spotlight > p {
          font-size: 13.5px;
          color: #9aa3ba;
          margin: 0 0 16px;
          line-height: 1.55;
        }

        .spotlight ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .spotlight li {
          font-size: 12.5px;
          color: #c3cad9;
          padding-left: 18px;
          position: relative;
          line-height: 1.45;
        }

        .spotlight li::before {
          content: "\\2192";
          position: absolute;
          left: 0;
          color: #7b7bf7;
        }

        .feature-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }

        .feature {
          background: #161b26;
          border: 1px solid #2b3242;
          border-radius: 12px;
          padding: 20px;
          transition: border-color .15s ease;
        }

        .feature:hover { border-color: #7b7bf7; }

        .feature .icon {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: rgba(123,123,247,0.14);
          color: #7b7bf7;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
          font-size: 18px;
        }

        .feature h3 {
          font-size: 14.5px;
          font-weight: 600;
          margin-bottom: 6px;
          margin-top: 0;
        }

        .feature p {
          font-size: 12.5px;
          color: #9aa3ba;
          line-height: 1.5;
          margin: 0;
        }

        .rule { border: none; border-top: 1px solid #2b3242; }

        footer { border-top: 1px solid #2b3242; padding: 40px 0 48px; }

        .footer-grid {
          display: grid;
          grid-template-columns: 1.4fr 1fr 1fr;
          gap: 36px;
        }

        .footer-grid h4 {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #6b7488;
          margin-bottom: 12px;
          margin-top: 0;
        }

        .footer-grid .origin {
          font-size: 13.5px;
          color: #9aa3ba;
          line-height: 1.7;
          max-width: 420px;
        }

        .footer-links { display: flex; flex-direction: column; gap: 8px; font-size: 13.5px; }
        .footer-links a { color: #eef0f6; text-decoration: none; }
        .footer-links a:hover { color: #7b7bf7; }

        @media (max-width: 800px) {
          .hero h1 { font-size: 36px; }
          .pipeline-track { grid-template-columns: 1fr 1fr; row-gap: 28px; }
          .pipeline-track::before { display: none; }
          .problem-grid { grid-template-columns: 1fr; }
          .spotlight-grid { grid-template-columns: 1fr; }
          .feature-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      <div className="page">
        {/* NAV */}
        <div className="nav">
          <div className="wordmark">
            <span className="dot"></span>
            JobTrackerAI
          </div>
          <button onClick={onLogin} className="btn btn-primary">
            Sign in with Google
          </button>
        </div>

        {/* HERO */}
        <section className="hero">
          <div className="eyebrow">AI copilot for job search</div>
          <h1>Manage 50 applications in parallel without burning out.</h1>
          <p className="lede">JobTrackerAI syncs your emails, detects statuses, tailors your CVs, drafts your follow-ups, and rehearses your interviews — so you stay in control of 15-50 applications at once, without sacrificing your evenings.</p>
          <p style={{ marginTop: '12px', fontSize: '14px', color: '#7b7bf7' }}>💡 Start free — 15 AI actions included. After that, add your own Anthropic API key (free) to keep going.</p>
          <div className="ctas">
            <button className="btn btn-primary" onClick={onLogin}>
              Sign in with Google
            </button>
            <a href="https://github.com/deviloufr-ai/jobtracking" target="_blank" rel="noreferrer" className="btn btn-secondary">
              View on GitHub
            </a>
          </div>

          {/* SIGNATURE PIPELINE */}
          <div className="pipeline">
            <div className="pipeline-label">The core of the product — each application flows through this pipeline, automatically updated</div>
            <div className="pipeline-track">
              <div className="runner"></div>
              <div className="stage active">
                <div className="node">01</div>
                <div className="stage-title">Applied</div>
                <div className="stage-desc">Auto-detected from Gmail and added instantly — no manual entry.</div>
              </div>
              <div className="stage active">
                <div className="node">02</div>
                <div className="stage-title">In Progress</div>
                <div className="stage-desc">Status updated with every exchange — confirmations, rejections, follow-ups.</div>
              </div>
              <div className="stage">
                <div className="node">03</div>
                <div className="stage-title">Interview</div>
                <div className="stage-desc">Tailored CV, STAR answers, and a voice mock interview — ready on the day.</div>
              </div>
              <div className="stage">
                <div className="node">04</div>
                <div className="stage-title">Offer</div>
                <div className="stage-desc">Goal reached. Your history stays, so you can analyze your strategy.</div>
              </div>
            </div>
          </div>
        </section>

        <hr className="rule" />

        {/* PROBLEM */}
        <section>
          <div className="section-head">
            <div className="kicker">The Challenge</div>
            <h2>Job search without the right tool is a second job.</h2>
            <p>Beyond 20 active applications, traditional tools collapse — and you end up compensating.</p>
          </div>
          <div className="problem-grid">
            {[
              { num: '01 / Scattered', title: '5 channels, zero hub', desc: 'LinkedIn, job boards, direct emails, referrals, cold applications — impossible to see it all.' },
              { num: '02 / Lost Context', title: '"Where am I with them?"', desc: 'No way to trace application history without reopening 10 emails.' },
              { num: '03 / Buried Emails', title: 'ATS rejections disappear', desc: 'Confirmations, follow-ups, and auto-rejections get lost in your inbox noise.' },
              { num: '04 / No Priorities', title: 'What should I do today?', desc: 'No signal for who to follow up with, what interview to prep, what\'s dead in the water.' },
              { num: '05 / Generic CV', title: 'Same CV everywhere', desc: 'Sent as-is without tailoring to the job description — killing your response rate.' },
              { num: '06 / Unprepared', title: 'Winging the interview', desc: 'No practice, no feedback before you sit down across from the recruiter.' }
            ].map((item, i) => (
              <div key={i} className="problem-item">
                <div className="num">{item.num}</div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule" />

        {/* WHAT'S NEW — SPOTLIGHT */}
        <section>
          <div className="section-head">
            <div className="kicker">What's New</div>
            <h2>Four new modules that do the heavy lifting for you.</h2>
            <p>Since v0.5, JobTrackerAI no longer just tracks — it writes, tailors, rehearses, and syncs.</p>
          </div>
          <div className="spotlight-grid">
            {[
              {
                icon: '🎤',
                title: 'Voice Interview Coach',
                desc: 'A mock interview where you answer out loud. The AI plays the recruiter, asks questions drawn from the job description and your CV, then scores your performance.',
                points: [
                  'In-browser voice recognition (Whisper WASM) — works on Firefox & Safari too',
                  'Recruiter persona tailored to the role and your background',
                  'Analysis and score at the end of each session',
                  'Practice tab to track your improvement over time'
                ]
              },
              {
                icon: '📄',
                title: 'Adaptive CV Studio',
                desc: 'A CV rewritten for each role, straight from the application. ATS score self-verified up to ≥ 90%, one-click PDF export.',
                points: [
                  '5 redesigned templates — roomier margins, clean page breaks',
                  'Match score + ATS coverage, with strengths and gaps spelled out',
                  'Tunable generation rules (language, tone, ATS level, no invented info)',
                  'Batch-generate CVs for every application still missing one'
                ]
              },
              {
                icon: '✉️',
                title: 'AI Writing: Emails & Letters',
                desc: 'Ready-to-send follow-ups and post-rejection thank-yous, plus cover letters that read human. You stay in control — nothing sends automatically.',
                points: [
                  'Thank-you sent as a reply in the rejection thread, language auto-detected',
                  'Recruiter greeted by name when it\'s known',
                  'Full email composer with a proper signature block',
                  'Cover letters with an optional context box'
                ]
              },
              {
                icon: '☁️',
                title: 'Real Accounts & Cross-Device',
                desc: 'Google sign-in, data isolated per account, synced in real time. Pick up where you left off on phone, tablet, and desktop.',
                points: [
                  'Applications, CVs, letters, scores and interview data all synced',
                  'Deletions propagate across every device',
                  'Your profile and base CVs available everywhere',
                  'Per-account isolation (Supabase RLS) — nothing sold or shared'
                ]
              }
            ].map((item, i) => (
              <div key={i} className="spotlight">
                <div className="spotlight-head">
                  <span className="s-icon">{item.icon}</span>
                  <h3>{item.title}</h3>
                  <span className="badge">New</span>
                </div>
                <p>{item.desc}</p>
                <ul>
                  {item.points.map((pt, j) => <li key={j}>{pt}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule" />

        {/* FEATURES */}
        <section>
          <div className="section-head">
            <div className="kicker">Features</div>
            <h2>The whole product, at a glance.</h2>
            <p>Organize, enrich, write, rehearse, and track your progress — without ever opening a spreadsheet.</p>
          </div>
          <div className="feature-grid">
            {[
              { icon: '📋', title: 'Dashboard + 3 views', desc: 'Table view, drag-and-drop Kanban board, and a Platforms view grouped by job board. Filter by status/timeframe/keywords, plus instant search.' },
              { icon: '📧', title: 'Gmail Auto-Synced', desc: 'Connect once: AI detects offers, confirmations, follow-ups, and ATS rejections, updating everything with zero manual entry.' },
              { icon: '📅', title: 'Calendar Synced', desc: 'Google Calendar built in. Interviews auto-populate with Zoom/Teams links. Day-before reminder, nothing slips.' },
              { icon: '⏰', title: 'Consolidated History', desc: '10 professional statuses, auto-detected ATS rejections (Ashby, Greenhouse, Lever, Workday, Teamtailor...). A dated timeline per application.' },
              { icon: '⚡', title: 'What\'s Next', desc: 'An engine that tells you who to follow up with, which interview to prep, where to push. Actions ranked by urgency so you stay focused.' },
              { icon: '🎤', title: 'Voice Interview Coach', desc: 'A spoken mock interview, recruiter persona, questions drawn from the job description and your CV, with analysis and a score at the end.' },
              { icon: '📄', title: 'CV Tailored per Role', desc: 'A CV rewritten for each application, 5 templates, ATS score self-verified to ≥ 90%, inline preview and one-click PDF export.' },
              { icon: '✉️', title: 'AI Emails & Letters', desc: 'Ready-to-send follow-ups and post-rejection thank-yous, plus cover letters that read human. Nothing sends automatically.' },
              { icon: '⭐', title: 'STAR Prep', desc: '3 STAR answers generated per job description, plus a Practice tab to track your interview progress.' },
              { icon: '📊', title: 'Analytics + Weekly Recap', desc: 'Trends (applications/week, response rate, velocity) and a weekly recap card: additions, responses, interviews, offers.' },
              { icon: '☁️', title: 'On All Your Devices', desc: 'Google accounts and real-time sync of applications, CVs, letters, scores, and interview data.' },
              { icon: '🎯', title: '4 Ways to Add', desc: 'Gmail, screenshots (LinkedIn, job boards), Firefox extension, or manual entry — every path leads to your pipeline.' },
              { icon: '🧩', title: 'Firefox Extension', desc: 'Scan an entire results page: each listing is scored against your CV, you review, and everything lands in your pipeline.' },
              { icon: '🔀', title: 'Bulk Actions', desc: 'Multi-select, auto-merge duplicates, batch CV generation. Clean up and organize in a few clicks.' },
              { icon: '🎨', title: '8 Themes', desc: 'Light, dark, and 6 moods (midnight, nocturne, ocean, forest, sunset, minimal). Synced everywhere.' },
              { icon: '🔔', title: 'Alerts That Matter', desc: 'Notifications for new emails, overdue follow-ups, upcoming interviews. Desktop or in-app, your choice.' }
            ].map((item, i) => (
              <div key={i} className="feature">
                <div className="icon">{item.icon}</div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule" />

        {/* HOW IT WORKS */}
        <section>
          <div className="section-head">
            <div className="kicker">How It Works</div>
            <h2>A 4-step workflow to own your search.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
            {[
              {
                step: '1',
                title: 'Add',
                desc: 'Gmail, screenshots, Firefox extension, or manual entry — applications flow into your pipeline.'
              },
              {
                step: '2',
                title: 'Enrich',
                desc: 'AI analyzes your emails, detects statuses, consolidates history, tailors your CVs, and drafts your follow-ups.'
              },
              {
                step: '3',
                title: 'Act & Rehearse',
                desc: 'Follow the recommendations, send the drafts, run a voice mock interview, and course-correct.'
              },
              {
                step: '4',
                title: 'Succeed',
                desc: 'Land the offer. Your history stays: analyze your strategy, continuous improvement.'
              }
            ].map((item, i) => (
              <div key={i} style={{
                background: '#161b26',
                border: '1px solid #2b3242',
                borderRadius: '12px',
                padding: '24px',
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '36px',
                  fontWeight: '700',
                  color: '#7b7bf7',
                  marginBottom: '12px'
                }}>
                  {item.step}
                </div>
                <div style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  marginBottom: '8px',
                  color: '#eef0f6'
                }}>
                  {item.title}
                </div>
                <div style={{
                  fontSize: '14px',
                  color: '#9aa3ba',
                  lineHeight: 1.5
                }}>
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule" />

        {/* AI CAPABILITIES */}
        <section>
          <div className="section-head">
            <div className="kicker">AI at Your Service</div>
            <h2>From email parsing to interview coaching, across the whole chain.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
            {[
              { icon: '📧', level: 'Capture', title: 'Email Parsing', desc: 'Batch analysis, structured extraction of offers, pre-parse filter to save tokens.' },
              { icon: '🏷️', level: 'Sorting', title: 'Status Detection', desc: 'Identifies ATS rejections, confirmations, process stages, and companies — even shared mailboxes.' },
              { icon: '📄', level: 'Application', title: 'Adaptive CV', desc: 'Rewrites the CV to the job description and self-verifies up to an ATS score of ≥ 90%.' },
              { icon: '💌', level: 'Follow-up', title: 'Contextual Emails', desc: 'Drafts follow-ups and thank-yous from the recruiter\'s own message (no auto-send).' },
              { icon: '📝', level: 'Motivation', title: 'Human Letters', desc: 'Generates cover letters that don\'t sound robotic, with an optional context box.' },
              { icon: '🎤', level: 'Interview', title: 'Interview Coach', desc: 'Voice mock interview, tailored questions, analysis and score at the end of the session.' },
              { icon: '⭐', level: 'Prep', title: 'STAR Answers', desc: 'Generates 3 STAR stories ready for the interview, per job description.' },
              { icon: '🔍', level: 'Analysis', title: 'Job Analysis', desc: 'Scrapes the job description, extracts keywords, and feeds the scoring and prep.' }
            ].map((item, i) => (
              <div key={i} style={{
                background: '#161b26',
                border: '1px solid #2b3242',
                borderRadius: '12px',
                padding: '20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ fontSize: '28px' }}>{item.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: '#6b7488', fontWeight: '600', marginBottom: '4px' }}>
                      {item.level}
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '6px', color: '#eef0f6' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '13px', color: '#9aa3ba' }}>
                      {item.desc}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule" />

        {/* NUMBERS */}
        <section>
          <div className="section-head">
            <div className="kicker">Built for Reality</div>
            <h2>The numbers behind intense job search.</h2>
            <p>JobTrackerAI doesn't hold you back — it's designed for the real load of managing massive parallel applications.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            {[
              { value: '50+', label: 'active applications in parallel, zero information lost' },
              { value: '10', label: 'professional statuses to classify every step' },
              { value: '3', label: 'pipeline views: table, kanban, platforms' },
              { value: '5', label: 'CV templates tailored to the job description' },
              { value: '90%+', label: 'ATS score targeted and self-verified on every generated CV' },
              { value: '8', label: 'light/dark themes, synced across all your devices' },
              { value: '1 click', label: 'to export your tailored CV as PDF' },
              { value: '∞', label: 'consolidated history, never lost' }
            ].map((card, i) => (
              <div key={i} style={{ border: '1px solid #2b3242', borderRadius: '12px', padding: '22px 20px', textAlign: 'left' }}>
                <div style={{ fontFamily: '\'IBM Plex Mono\', monospace', fontSize: '28px', fontWeight: '600', color: '#7b7bf7', marginBottom: '8px' }}>
                  {card.value}
                </div>
                <div style={{ fontSize: '12.5px', color: '#9aa3ba', lineHeight: '1.45' }}>
                  {card.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* USE CASES */}
        <hr className="rule" />
        <section>
          <div className="section-head">
            <div className="kicker">For Whom?</div>
            <h2>Built for active searches, from 15+ parallel applications.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            {[
              {
                icon: '🚀',
                title: 'Active Job Seeker',
                desc: 'You send 20-50 applications/month, manage follow-ups, juggle interviews, negotiate offers. Excel already failed you.'
              },
              {
                icon: '📚',
                title: 'Junior Transitioning',
                desc: 'Changing fields or starting your career. Need a clear strategy, intensive prep, honest feedback on your CV and interviews.'
              },
              {
                icon: '🎯',
                title: 'Senior Repositioning',
                desc: '10+ years experience, targeting 5-10 premium opportunities. Need precise analysis, not noise.'
              }
            ].map((item, i) => (
              <div key={i} style={{
                background: '#161b26',
                border: '1px solid #2b3242',
                borderRadius: '12px',
                padding: '28px'
              }}>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>{item.icon}</div>
                <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '10px', color: '#eef0f6' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '14px', color: '#9aa3ba', lineHeight: '1.6' }}>
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </section>

        <hr className="rule" />

        {/* FOOTER */}
        <footer>
          <div className="footer-grid">
            <div>
              <h4>About JobTrackerAI</h4>
              <p className="origin">Built by <b>Alexandre Leblanc</b> — Senior PM, 18 years experience (gaming, AdTech, Web3, mobile), trilingual FR/EN/JP. JobTrackerAI grew from personal frustration during active job search, and became the best proof that a PM alone can ship something great at the intersection of product thinking, no-code/low-code, and generative AI. Personal project, continuous development since April 2026, production since v0.5.</p>
            </div>
            <div>
              <h4>Tech Stack</h4>
              <div style={{ fontSize: '13.5px', color: '#9aa3ba', lineHeight: 1.9 }}>
                React · Tailwind · Vite<br/>
                Vercel Serverless<br/>
                Claude (Anthropic) + Whisper (voice)<br/>
                Gmail & Calendar API<br/>
                Supabase (accounts + sync, RLS)<br/>
                Firefox extension
              </div>
            </div>
            <div>
              <h4>Legal & Access</h4>
              <div className="footer-links">
                <a href="https://jobtracking-three.vercel.app" target="_blank" rel="noreferrer">→ jobtracking-three.vercel.app</a>
                <a href="https://github.com/deviloufr-ai/jobtracking" target="_blank" rel="noreferrer">→ github.com/deviloufr-ai/jobtracking</a>
                <a href="/privacy-policy" target="_blank" rel="noreferrer">→ Privacy Policy</a>
                <a href="/terms-of-service" target="_blank" rel="noreferrer">→ Terms of Service</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
