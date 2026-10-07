import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../config/api'
import { loadAllHitRates } from '../lib/api'
import { hitRateKey } from '../lib/hitRates'
import type { LotteryHitRate } from '../lib/hitRates'

export type HitRateState =
  | { phase: 'loading' }
  | { phase: 'ready'; hitRates: ReadonlyMap<string, LotteryHitRate> }
  | { phase: 'error' }

export function useHitRates() {
  const [state, setState] = useState<HitRateState>({ phase: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    loadAllHitRates({ baseUrl: API_BASE_URL, signal: controller.signal })
      .then((rates) => {
        if (!controller.signal.aborted) {
          setState({ phase: 'ready', hitRates: new Map(rates.map((rate) => [hitRateKey(rate.lottery_type, rate.pattern), rate])) })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ phase: 'error' })
      })
    return () => controller.abort()
  }, [attempt])

  function reload() {
    setState({ phase: 'loading' })
    setAttempt((value) => value + 1)
  }

  return { state, reload }
}
