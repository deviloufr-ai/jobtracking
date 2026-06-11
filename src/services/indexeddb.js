// IndexedDB wrapper for offline-first local caching
// Stores full copies of jobs, CVs, settings and offline mutation queue

const DB_NAME = 'jobtrackr'
const DB_VERSION = 1

const STORES = {
  JOBS: 'jobs',
  JOB_HISTORY: 'job_history',
  CVS: 'cvs',
  SETTINGS: 'settings',
  SYNC_QUEUE: 'sync_queue',
  METADATA: 'metadata'
}

class IndexedDBService {
  constructor() {
    this.db = null
    this.initialized = false
  }

  async init() {
    return new Promise((resolve, reject) => {
      if (this.initialized) {
        resolve(this.db)
        return
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('IndexedDB error:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        this.initialized = true
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result

        // Jobs store
        if (!db.objectStoreNames.contains(STORES.JOBS)) {
          db.createObjectStore(STORES.JOBS, { keyPath: 'id' })
        }

        // Job history store
        if (!db.objectStoreNames.contains(STORES.JOB_HISTORY)) {
          const historyStore = db.createObjectStore(STORES.JOB_HISTORY, { keyPath: 'id' })
          historyStore.createIndex('job_id', 'job_id', { unique: false })
        }

        // CVs store
        if (!db.objectStoreNames.contains(STORES.CVS)) {
          db.createObjectStore(STORES.CVS, { keyPath: 'id' })
        }

        // Settings store (single record)
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(STORES.SETTINGS, { keyPath: 'id' })
        }

        // Sync queue for offline mutations
        if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
          const queueStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' })
          queueStore.createIndex('status', 'status', { unique: false })
          queueStore.createIndex('timestamp', 'timestamp', { unique: false })
        }

        // Metadata (sync timestamps, etc.)
        if (!db.objectStoreNames.contains(STORES.METADATA)) {
          db.createObjectStore(STORES.METADATA, { keyPath: 'key' })
        }
      }
    })
  }

  async getStore(storeName, mode = 'readonly') {
    if (!this.initialized) {
      await this.init()
    }
    const transaction = this.db.transaction(storeName, mode)
    return transaction.objectStore(storeName)
  }

  // Jobs
  async getJob(id) {
    const store = await this.getStore(STORES.JOBS)
    return new Promise((resolve, reject) => {
      const request = store.get(id)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async getAllJobs() {
    const store = await this.getStore(STORES.JOBS)
    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async saveJob(job) {
    const store = await this.getStore(STORES.JOBS, 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.put(job)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async saveJobs(jobs) {
    const store = await this.getStore(STORES.JOBS, 'readwrite')
    return new Promise((resolve, reject) => {
      const transaction = store.transaction
      let count = 0

      jobs.forEach(job => {
        const request = store.put(job)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          count++
          if (count === jobs.length) {
            resolve()
          }
        }
      })
    })
  }

  async deleteJob(id) {
    const store = await this.getStore(STORES.JOBS, 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.delete(id)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async clearJobs() {
    const store = await this.getStore(STORES.JOBS, 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.clear()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  // CVs
  async saveCV(cv) {
    const store = await this.getStore(STORES.CVS, 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.put(cv)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async getAllCVs() {
    const store = await this.getStore(STORES.CVS)
    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  // Settings (single record)
  async saveSettings(settings) {
    const store = await this.getStore(STORES.SETTINGS, 'readwrite')
    const data = { id: 'settings', ...settings }
    return new Promise((resolve, reject) => {
      const request = store.put(data)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async getSettings() {
    const store = await this.getStore(STORES.SETTINGS)
    return new Promise((resolve, reject) => {
      const request = store.get('settings')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const result = request.result
        // Remove the 'id' key added during save
        if (result) {
          const { id, ...settings } = result
          resolve(settings)
        } else {
          resolve({})
        }
      }
    })
  }

  // Sync Queue
  async addToQueue(mutation) {
    const store = await this.getStore(STORES.SYNC_QUEUE, 'readwrite')
    const data = {
      ...mutation,
      timestamp: Date.now(),
      status: 'pending'
    }
    return new Promise((resolve, reject) => {
      const request = store.add(data)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  async getQueuedMutations() {
    const store = await this.getStore(STORES.SYNC_QUEUE)
    const index = store.index('status')
    return new Promise((resolve, reject) => {
      const request = index.getAll('pending')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || [])
    })
  }

  async removeFromQueue(id) {
    const store = await this.getStore(STORES.SYNC_QUEUE, 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.delete(id)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async clearQueue() {
    const store = await this.getStore(STORES.SYNC_QUEUE, 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.clear()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  // Metadata
  async setMetadata(key, value) {
    const store = await this.getStore(STORES.METADATA, 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.put({ key, value })
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async getMetadata(key) {
    const store = await this.getStore(STORES.METADATA)
    return new Promise((resolve, reject) => {
      const request = store.get(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result?.value)
    })
  }

  // Bulk operations
  async saveBulk(jobs, cvs, settings) {
    await Promise.all([
      this.saveJobs(jobs),
      this.saveSettings(settings),
      ...cvs.map(cv => this.saveCV(cv))
    ])
  }

  async clear() {
    await Promise.all([
      this.clearJobs(),
      this.clearQueue()
    ])
  }
}

export const indexeddb = new IndexedDBService()
