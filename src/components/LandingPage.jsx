import { useState } from 'react'

export default function LandingPage({ onLogin }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const features = [
    {
      icon: '📧',
      title: 'Gmail Integration',
      description: 'Automatically sync job offers from Gmail with smart email parsing and timeline enrichment'
    },
    {
      icon: '📋',
      title: 'Application Tracker',
      description: 'Track all applications in one place with status updates, history, and timeline'
    },
    {
      icon: '📄',
      title: 'AI-Powered CV Generator',
      description: 'Generate tailored CVs for each position with Before/After preview and PDF export'
    },
    {
      icon: '🔎',
      title: 'Job Search Integration',
      description: 'Search for jobs directly in the app via Adzuna API integration'
    },
    {
      icon: '⚡',
      title: 'Smart Insights',
      description: 'Get urgent action items and personalized next steps based on your applications'
    },
    {
      icon: '📸',
      title: 'Screenshot Import',
      description: 'Add job offers by taking a screenshot - AI extracts all details automatically'
    },
  ]

  const stats = [
    { value: '100%', label: 'Privacy First' },
    { value: 'Instant', label: 'Gmail Sync' },
    { value: '6 AI Features', label: 'Included' },
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-sm">J</span>
              </div>
              <span className="font-bold text-gray-900 text-lg">JobTrackr</span>
            </div>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-600 hover:text-gray-900 font-medium text-sm">Features</a>
              <a href="#screenshots" className="text-gray-600 hover:text-gray-900 font-medium text-sm">Screenshots</a>
              <a href="#stats" className="text-gray-600 hover:text-gray-900 font-medium text-sm">About</a>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden w-8 h-8 flex items-center justify-center text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>

            {/* Login Button */}
            <button
              onClick={onLogin}
              className="hidden md:flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Sign In
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-gray-100 py-4 space-y-3">
              <a href="#features" className="block text-gray-600 hover:text-gray-900 font-medium py-2">Features</a>
              <a href="#screenshots" className="block text-gray-600 hover:text-gray-900 font-medium py-2">Screenshots</a>
              <a href="#stats" className="block text-gray-600 hover:text-gray-900 font-medium py-2">About</a>
              <button
                onClick={() => { setMobileMenuOpen(false); onLogin() }}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors font-medium text-sm mt-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                Sign In
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 sm:py-32 bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-indigo-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-violet-100 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: Text */}
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 leading-tight">
                  Master Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Job Search</span>
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed">
                  AI-powered job application tracker that syncs Gmail, generates tailored CVs, and guides your next move
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={onLogin}
                  className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-xl hover:bg-indigo-700 transition-all font-semibold text-lg shadow-lg shadow-indigo-200 hover:shadow-xl"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Get Started with Google
                </button>
                <a href="#features" className="flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-700 px-8 py-4 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all font-semibold text-lg">
                  Learn More
                </a>
              </div>

              <div className="flex items-center gap-6 pt-4">
                {stats.map((stat, i) => (
                  <div key={i}>
                    <p className="text-2xl font-bold text-indigo-600">{stat.value}</p>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Visual */}
            <div className="relative h-96 sm:h-[500px] hidden lg:block">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-2xl" />
              <div className="absolute inset-4 bg-white rounded-xl shadow-2xl border border-gray-200 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="text-6xl">📊</div>
                  <p className="text-gray-600 font-medium">Track All Your Applications</p>
                  <p className="text-sm text-gray-400">Simple, powerful, intelligent</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 sm:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900">Powerful Features</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">Everything you need to manage your job search efficiently</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, i) => (
              <div key={i} className="group relative p-8 rounded-2xl bg-gradient-to-br from-gray-50 to-white border border-gray-100 hover:border-indigo-200 hover:shadow-lg transition-all">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-transparent opacity-0 group-hover:opacity-100 rounded-2xl transition-opacity duration-300" />
                <div className="relative space-y-4">
                  <div className="text-4xl">{feature.icon}</div>
                  <h3 className="text-xl font-bold text-gray-900">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshots Section */}
      <section id="screenshots" className="py-20 sm:py-32 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900">See it in Action</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">Beautifully designed interface for managing your job applications</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Screenshot 1: Dashboard */}
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white">
              <div className="bg-gradient-to-r from-indigo-100 to-violet-100 p-8 sm:p-12">
                <div className="space-y-3">
                  <div className="h-2 bg-white/50 rounded w-1/3" />
                  <div className="h-2 bg-white/50 rounded w-2/3" />
                  <div className="space-y-2 pt-4">
                    <div className="h-20 bg-white/30 rounded-lg" />
                    <div className="h-20 bg-white/30 rounded-lg" />
                    <div className="h-20 bg-white/30 rounded-lg" />
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-2">
                <h3 className="font-bold text-gray-900">Application Dashboard</h3>
                <p className="text-sm text-gray-600">View all your job applications with status, dates, and quick actions in one organized table</p>
              </div>
            </div>

            {/* Screenshot 2: Timeline */}
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white">
              <div className="bg-gradient-to-r from-purple-100 to-pink-100 p-8 sm:p-12">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-white/60" />
                    <div className="h-2 bg-white/50 rounded flex-1" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-white/60" />
                    <div className="h-2 bg-white/50 rounded flex-1 w-2/3" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-white/60" />
                    <div className="h-2 bg-white/50 rounded flex-1 w-1/2" />
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-2">
                <h3 className="font-bold text-gray-900">Activity Timeline</h3>
                <p className="text-sm text-gray-600">Track every interaction with each company - emails, interviews, rejections, all in one place</p>
              </div>
            </div>

            {/* Screenshot 3: Gmail Integration */}
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white">
              <div className="bg-gradient-to-r from-red-100 to-orange-100 p-8 sm:p-12">
                <div className="text-center space-y-4">
                  <div className="text-5xl">📧</div>
                  <div className="space-y-2">
                    <div className="h-2 bg-white/50 rounded w-2/3 mx-auto" />
                    <div className="h-2 bg-white/50 rounded w-1/2 mx-auto" />
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-2">
                <h3 className="font-bold text-gray-900">Gmail Sync</h3>
                <p className="text-sm text-gray-600">Auto-sync job offers from your Gmail inbox, extract details, and populate your applications instantly</p>
              </div>
            </div>

            {/* Screenshot 4: CV Generator */}
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white">
              <div className="bg-gradient-to-r from-blue-100 to-cyan-100 p-8 sm:p-12">
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1 h-32 bg-white/40 rounded-lg" />
                    <div className="flex-1 h-32 bg-white/60 rounded-lg" />
                  </div>
                  <div className="h-2 bg-white/40 rounded w-1/2" />
                </div>
              </div>
              <div className="p-6 space-y-2">
                <h3 className="font-bold text-gray-900">CV Generator</h3>
                <p className="text-sm text-gray-600">Generate tailored CVs for each position with before/after preview, export to PDF</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section id="stats" className="py-20 sm:py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-5xl font-bold text-indigo-600 mb-2">100%</div>
              <p className="text-gray-600 font-medium">Data Privacy</p>
              <p className="text-sm text-gray-500 mt-1">Your data never leaves your browser</p>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-indigo-600 mb-2">⚡</div>
              <p className="text-gray-600 font-medium">Real-time Sync</p>
              <p className="text-sm text-gray-500 mt-1">Gmail integration syncs automatically</p>
            </div>
            <div className="text-center">
              <div className="text-5xl font-bold text-indigo-600 mb-2">🤖</div>
              <p className="text-gray-600 font-medium">AI-Powered</p>
              <p className="text-sm text-gray-500 mt-1">Smart insights and personalized advice</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 sm:py-32 bg-gradient-to-br from-indigo-600 to-violet-600 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-white rounded-full mix-blend-multiply filter blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-white rounded-full mix-blend-multiply filter blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
          <h2 className="text-4xl sm:text-5xl font-bold">Ready to Master Your Job Search?</h2>
          <p className="text-xl text-indigo-100">Start tracking your applications with AI-powered insights today</p>

          <button
            onClick={onLogin}
            className="inline-flex items-center gap-2 bg-white text-indigo-600 px-10 py-4 rounded-xl hover:bg-indigo-50 transition-all font-bold text-lg shadow-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            Sign In with Google
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                  <span className="text-white font-bold text-xs">J</span>
                </div>
                <span className="font-bold text-white">JobTrackr</span>
              </div>
              <p className="text-sm">Master your job search with AI-powered insights</p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Features</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition">Gmail Sync</a></li>
                <li><a href="#features" className="hover:text-white transition">CV Generator</a></li>
                <li><a href="#features" className="hover:text-white transition">Job Search</a></li>
                <li><a href="#features" className="hover:text-white transition">AI Insights</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Resources</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition">Contact</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Connect</h3>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">GitHub</a></li>
                <li><a href="#" className="hover:text-white transition">Twitter</a></li>
                <li><a href="#" className="hover:text-white transition">Email</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>&copy; 2024 JobTrackr. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
