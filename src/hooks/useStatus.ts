import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../config/api'
import { fetchStatus } from '../lib/api'
import type { ApiStatus } from '../lib/status'

export type StatusState =
  | { phase: 'loading' }
  | { phase: 'ready'; status: ApiStatus }
  | { phase: 'unavailable' }

// Loaded independently of the predictions list: a failure here only hides the panel.
export function useStatus() {
  const [state, setState] = useState<StatusState>({ phase: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchStatus({ baseUrl: API_BASE_URL, signal: controller.signal })
      .then((status) => {
        if (!controller.signal.aborted) setState({ phase: 'ready', status })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ phase: 'unavailable' })
      })
    return () => controller.abort()
  }, [attempt])

  function reload() {
    setState({ phase: 'loading' })
    setAttempt((value) => value + 1)
  }

  return { state, reload }
}
