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
          max-width: 560px;
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
          <p className="lede">JobTrackerAI syncs your emails, detects statuses, prioritizes follow-ups, and prepares your interviews — so you stay in control of 15-50 applications at once, without sacrificing your evenings.</p>
          <p style={{ marginTop: '12px', fontSize: '14px', color: '#7b7bf7' }}>💡 You'll need an Anthropic API key (free) to use AI features.</p>
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
                <div className="stage-desc">STAR answers ready, meeting detected, day-before reminder.</div>
              </div>
              <div className="stage">
                <div className="node">04</div>
                <div className="stage-title">Offer</div>
                <div className="stage-desc">Goal reached — the pipeline did its job.</div>
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
              { num: '06 / Wrong Tools', title: 'Heavy CRM or broken Excel', desc: 'CRMs are built for sales teams. Excel dies after row 30.' }
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

        {/* FEATURES */}
        <section>
          <div className="section-head">
            <div className="kicker">Features</div>
            <h2>Your AI ally for real job search.</h2>
            <p>Everything you need to organize, enrich, and speed up your applications — without ever opening a spreadsheet.</p>
          </div>
          <div className="feature-grid">
            {[
              { icon: '📋', title: 'Smart Dashboard', desc: 'Clear overview of all your applications. Filter by status, timeframe, or keywords. Real-time stats and trends show your progress.' },
              { icon: '📧', title: 'Gmail Auto-Synced', desc: 'Connect once, your emails do the work. AI detects offers, rejections, follow-ups — everything updates automatically, zero manual entry.' },
              { icon: '⏰', title: 'Smart History', desc: '10 professional statuses, auto-detects ATS rejections (Ashby, Greenhouse, Lever...). A dated timeline for every application, consolidated and easy to scan.' },
              { icon: '⚡', title: 'What\'s Next?', desc: 'An engine that tells you clearly: who to follow up with, which interview to prep, where to push. Alerts ranked by urgency so you stay focused.' },
              { icon: '📅', title: 'Interviews Synced', desc: 'Google Calendar built in. Interviews auto-populate with Zoom/Teams links. Day-before reminder, nothing falls through the cracks.' },
              { icon: '💌', title: 'AI Writing: Emails & CVs', desc: 'Smart email drafts ready to send. Tailored CVs per application. Cover letters generated in 2 clicks. Ready to copy-paste or customize.' },
              { icon: '⭐', title: 'Interview Prep', desc: '3 STAR answers generated per job description. Contextualized advice. See your CV before export, optimized one-page format.' },
              { icon: '🎯', title: 'Add Applications Easily', desc: 'Gmail, screenshots (LinkedIn, job boards), Firefox extension, or manual. 4 different ways, all paths lead to your pipeline.' },
              { icon: '🎯', title: 'Track Your Progress', desc: 'Application goals, success rate, personalized insights. See week-by-week how you\'re moving toward your target.' },
              { icon: '🤖', title: 'AI Advice at Every Step', desc: 'Real suggestions based on your situation: how to follow up without being pushy, optimizing your response rate, prepping for that interview.' },
              { icon: '💾', title: 'On All Your Devices', desc: 'Instant sync. Check applications on phone, tablet, or desktop — everything stays current everywhere.' },
              { icon: '🎨', title: 'Your Style', desc: 'Light, dark, or one of 6 specialty themes (midnight, ocean, forest...). Customize the interface to your taste, synced everywhere.' },
              { icon: '📊', title: 'Analytics to Improve', desc: 'Trends (applications/week, response rate, velocity). Personalized insights to refine your strategy and do better next time.' },
              { icon: '🔔', title: 'Alerts That Matter', desc: 'Notifications for new emails, overdue follow-ups, upcoming interviews. Desktop or in-app, your choice.' },
              { icon: '🔀', title: 'Flexible Management', desc: 'Select multiple applications at once. Auto-merge duplicates. Clean up and organize in a few clicks.' },
              { icon: '🔍', title: 'Instant Search', desc: 'Type to find: by company, role, or specific keywords. Real-time results, never a wait.' }
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
                desc: 'AI analyzes your emails, detects statuses, consolidates history, generates STAR answers and follow-ups.'
              },
              {
                step: '3',
                title: 'Act',
                desc: 'Follow recommendations (urgent follow-ups, interviews to prep). Use AI drafts, tailored CVs, prep notes.'
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
            <h2>6 levels of automation, from parsing to interview coaching.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
            {[
              { icon: '📧', level: 'Level 1', title: 'Email Parsing', desc: 'Batch processes 15 emails, structured extraction of offers.' },
              { icon: '🏷️', level: 'Level 2', title: 'Status Detection', desc: 'Auto-detects ATS rejections, process stages, companies.' },
              { icon: '⭐', level: 'Level 3', title: 'STAR Answers', desc: 'Generates 3 STAR stories ready for interviews.' },
              { icon: '💌', level: 'Level 4', title: 'Smart Follow-ups', desc: 'Contextualized email drafts, detects ATS boxes (no auto-send).' },
              { icon: '📄', level: 'Level 5', title: 'Adaptive CV', desc: 'Rewrites PDF by job description, optimizes recruiter scoring.' },
              { icon: '🔍', level: 'Level 6', title: 'Job Analysis', desc: 'Scrapes JD, extracts keywords, suggests prep points via extension.' }
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
              { value: '40+', label: 'active applications in parallel, zero information lost' },
              { value: '100%', label: 'local data — never sent to third parties' },
              { value: '10', label: 'professional statuses to classify every step' },
              { value: '6', label: 'AI levels (parsing → interview coaching)' },
              { value: '12', label: 'parallel Gmail queries on startup' },
              { value: '<2s', label: 'average time to activate an AI follow-up' },
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
                desc: 'Changing fields or starting your career. Need a clear strategy, intensive prep, honest CV feedback.'
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
                Claude Haiku (Anthropic)<br/>
                Gmail & Calendar API<br/>
                Adzuna API<br/>
                localStorage → Supabase
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
