// Job search service selector - supports multiple APIs
import * as adzuna from './adzuna'
import * as franceTravail from './franceTravail'
import * as welcomeToTheJungle from './welcomeToTheJungle'

const STORAGE_KEY = 'jobSearch_api'

const APIs = {
  adzuna: {
    name: 'Adzuna',
    service: adzuna,
    isConfigured: adzuna.isAdzunaConfigured,
  },
  franceTravail: {
    name: 'France Travail',
    service: franceTravail,
    isConfigured: () => true, // Always available (free public API)
  },
  wttj: {
    name: 'Welcome to the Jungle',
    service: welcomeToTheJungle,
    isConfigured: () => true, // Always available (free public API)
  },
}

export function getAvailableAPIs() {
  return Object.entries(APIs).map(([key, api]) => ({
    id: key,
    name: api.name,
    configured: api.isConfigured?.() ?? true,
  }))
}

export function getSavedAPI() {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved && APIs[saved] ? saved : 'franceTravail'
}

export function setActiveAPI(apiId) {
  if (APIs[apiId]) {
    localStorage.setItem(STORAGE_KEY, apiId)
  }
}

export async function searchJobs(apiId, params) {
  const api = APIs[apiId] || APIs[getSavedAPI()]
  if (!api) throw new Error('Invalid API selected')
  return api.service.searchJobs(params)
}

export function getAPIName(apiId) {
  return APIs[apiId]?.name || 'Unknown'
}
