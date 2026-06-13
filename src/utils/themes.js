export const THEMES = {
  light: {
    id: 'light',
    label: 'Moderne (Light)',
    bg: '#f8fafc',
    surface: '#ffffff',
    border: '#e2e8f0',
    text: '#1e293b',
    textDim: '#64748b',
    textFaint: '#94a3b8',
    primary: '#4f46e5',
    primarySoft: 'rgba(79, 70, 229, 0.1)',
  },
  dark: {
    id: 'dark',
    label: 'Premium Dark',
    bg: '#0c0f16',
    surface: '#161b26',
    surface2: '#1f2533',
    border: '#2b3242',
    text: '#eef0f6',
    textDim: '#9aa3ba',
    textFaint: '#6b7488',
    primary: '#7b7bf7',
    primarySoft: 'rgba(123, 123, 247, 0.14)',
    amber: '#f4a73c',
    amberSoft: 'rgba(244, 167, 60, 0.14)',
    emerald: '#36d399',
    emeraldSoft: 'rgba(54, 211, 153, 0.14)',
  },
  midnight: {
    id: 'midnight',
    label: 'Midnight (Ultra Dark)',
    bg: '#0a0e13',
    surface: '#131820',
    surface2: '#1a2231',
    border: '#252d3d',
    text: '#f1f5f9',
    textDim: '#94a3b8',
    textFaint: '#64748b',
    primary: '#8b5cf6',
    primarySoft: 'rgba(139, 92, 246, 0.14)',
    amber: '#fbbf24',
    amberSoft: 'rgba(251, 191, 36, 0.14)',
    emerald: '#34d399',
    emeraldSoft: 'rgba(52, 211, 153, 0.14)',
  },
  ocean: {
    id: 'ocean',
    label: 'Ocean (Blue)',
    bg: '#0f172a',
    surface: '#1e293b',
    surface2: '#334155',
    border: '#475569',
    text: '#f1f5f9',
    textDim: '#cbd5e1',
    textFaint: '#94a3b8',
    primary: '#0ea5e9',
    primarySoft: 'rgba(14, 165, 233, 0.14)',
    amber: '#f59e0b',
    amberSoft: 'rgba(245, 158, 11, 0.14)',
    emerald: '#10b981',
    emeraldSoft: 'rgba(16, 185, 129, 0.14)',
  },
  forest: {
    id: 'forest',
    label: 'Forest (Green)',
    bg: '#0f2818',
    surface: '#1a3a2a',
    surface2: '#245339',
    border: '#2d6a4f',
    text: '#f0fdf4',
    textDim: '#bbf7d0',
    textFaint: '#86efac',
    primary: '#10b981',
    primarySoft: 'rgba(16, 185, 129, 0.14)',
    amber: '#fcd34d',
    amberSoft: 'rgba(252, 211, 77, 0.14)',
    emerald: '#34d399',
    emeraldSoft: 'rgba(52, 211, 153, 0.14)',
  },
  sunset: {
    id: 'sunset',
    label: 'Sunset (Warm)',
    bg: '#1f1409',
    surface: '#2d1f14',
    surface2: '#3d2817',
    border: '#54432a',
    text: '#fef3c7',
    textDim: '#fed7aa',
    textFaint: '#fdba74',
    primary: '#fb923c',
    primarySoft: 'rgba(251, 146, 60, 0.14)',
    amber: '#f59e0b',
    amberSoft: 'rgba(245, 158, 11, 0.14)',
    emerald: '#a78bfa',
    emeraldSoft: 'rgba(167, 139, 250, 0.14)',
  },
  minimal: {
    id: 'minimal',
    label: 'Minimal Light',
    bg: '#fafafa',
    surface: '#ffffff',
    border: '#f0f0f0',
    text: '#1a1a1a',
    textDim: '#666666',
    textFaint: '#999999',
    primary: '#000000',
    primarySoft: 'rgba(0, 0, 0, 0.05)',
  },
}

export function applyTheme(theme) {
  const t = THEMES[theme] || THEMES.light
  const root = document.documentElement

  root.style.setProperty('--theme-bg', t.bg)
  root.style.setProperty('--theme-surface', t.surface)
  root.style.setProperty('--theme-surface2', t.surface2 || t.surface)
  root.style.setProperty('--theme-border', t.border)
  root.style.setProperty('--theme-text', t.text)
  root.style.setProperty('--theme-text-dim', t.textDim)
  root.style.setProperty('--theme-text-faint', t.textFaint)
  root.style.setProperty('--theme-primary', t.primary)
  root.style.setProperty('--theme-primary-soft', t.primarySoft)
  root.style.setProperty('--theme-amber', t.amber || '#f4a73c')
  root.style.setProperty('--theme-amber-soft', t.amberSoft || 'rgba(244, 167, 60, 0.14)')
  root.style.setProperty('--theme-emerald', t.emerald || '#10b981')
  root.style.setProperty('--theme-emerald-soft', t.emeraldSoft || 'rgba(16, 185, 129, 0.14)')
}
