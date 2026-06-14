// Job search service selector - supports multiple APIs
import * as adzuna from './adzuna'
import * as remoteOk from './remoteOk'
import * as jSearch from './jSearch'
import * as franceTravail from './franceTravail'

const STORAGE_KEY = 'jobSearch_api'

const APIs = {
  francetravail: {
    name: 'France Travail',
    service: franceTravail,
    isConfigured: () => true,
  },
  remoteok: {
    name: 'RemoteOK',
    service: remoteOk,
    isConfigured: () => true,
  },
  jsearch: {
    name: 'JSearch',
    service: jSearch,
    isConfigured: () => true,
  },
  adzuna: {
    name: 'Adzuna',
    service: adzuna,
    isConfigured: adzuna.isAdzunaConfigured,
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
  return saved && APIs[saved] ? saved : 'francetravail'
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
