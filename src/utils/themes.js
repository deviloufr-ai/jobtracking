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
  }
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
