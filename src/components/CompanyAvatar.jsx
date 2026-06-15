import { useState, useEffect } from 'react'
import { resolveCompanyLogo, getCachedLogo } from '../services/companyLogo'

// Shared company avatar: shows the real company logo when resolvable, otherwise
// the same colored initials square as before. Any load failure (404, bad match,
// offline) falls back to initials, so the worst case equals the previous look.
const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700', 'bg-blue-100 text-blue-700', 'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700', 'bg-pink-100 text-pink-700', 'bg-cyan-100 text-cyan-700',
  'bg-lime-100 text-lime-700', 'bg-amber-100 text-amber-700', 'bg-indigo-100 text-indigo-700',
]

export default function CompanyAvatar({ company = '', sizeClass = 'w-8 h-8', textClass = 'text-xs' }) {
  const initials = company.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?'
  const color = AVATAR_COLORS[(company.charCodeAt(0) || 0) % AVATAR_COLORS.length]

  const [logo, setLogo] = useState(() => { const c = getCachedLogo(company); return c === undefined ? null : c })
  const [imgOk, setImgOk] = useState(true)

  useEffect(() => {
    let alive = true
    setImgOk(true)
    const cached = getCachedLogo(company)
    if (cached !== undefined) { setLogo(cached); return }
    setLogo(null)
    resolveCompanyLogo(company).then(url => { if (alive) setLogo(url) })
    return () => { alive = false }
  }, [company])

  const showLogo = !!logo && imgOk
  return (
    <div className={`${sizeClass} rounded-lg flex items-center justify-center ${textClass} font-bold flex-shrink-0 overflow-hidden ${showLogo ? 'bg-white border border-gray-100' : color}`}>
      {showLogo
        ? <img src={logo} alt={company} loading="lazy" className="w-full h-full object-contain p-0.5" onError={() => setImgOk(false)} />
        : initials}
    </div>
  )
}
