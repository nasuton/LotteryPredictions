import { useEffect, useState } from 'react'
import { API_BASE_URL, PREDICTIONS_LIMIT, PREDICTIONS_OFFSET } from '../config/api'
import { loadAllPredictions } from '../lib/api'
import type { Prediction } from '../lib/predictions'

type PredictionState =
  | { phase: 'checking' }
  | { phase: 'loading'; loaded: number; total: number | null }
  | { phase: 'success'; predictions: Prediction[] }
  | { phase: 'error' }

export function usePredictions() {
  const [state, setState] = useState<PredictionState>({ phase: 'checking' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    loadAllPredictions({
      baseUrl: API_BASE_URL,
      limit: PREDICTIONS_LIMIT,
      offset: PREDICTIONS_OFFSET,
      signal: controller.signal,
      onHealthy: () => {
        if (!controller.signal.aborted) setState({ phase: 'loading', loaded: 0, total: null })
      },
      onProgress: (loaded, total) => {
        if (!controller.signal.aborted) setState({ phase: 'loading', loaded, total })
      },
    })
      .then((predictions) => {
        if (!controller.signal.aborted) setState({ phase: 'success', predictions })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ phase: 'error' })
      })
    return () => controller.abort()
  }, [attempt])

  function retry() {
    if (state.phase !== 'error') return
    setState({ phase: 'checking' })
    setAttempt((value) => value + 1)
  }

  return { state, retry }
}
