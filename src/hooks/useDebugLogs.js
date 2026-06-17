import { useEffect } from 'react'
import { useSettings } from './useSettings'

export function useDebugLogs() {
  const { settings } = useSettings()

  useEffect(() => {
    const originalLog = console.log
    const originalWarn = console.warn
    const originalDebug = console.debug
    const originalInfo = console.info

    if (!settings.debugLogsEnabled) {
      // Override console methods to suppress logs
      console.log = () => {}
      console.warn = () => {}
      console.debug = () => {}
      console.info = () => {}
    } else {
      // Restore original console methods
      console.log = originalLog
      console.warn = originalWarn
      console.debug = originalDebug
      console.info = originalInfo
    }

    return () => {
      // Restore on cleanup
      console.log = originalLog
      console.warn = originalWarn
      console.debug = originalDebug
      console.info = originalInfo
    }
  }, [settings.debugLogsEnabled])
}
