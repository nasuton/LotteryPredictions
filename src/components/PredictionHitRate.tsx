import type { HitRateState } from '../hooks/useHitRates'
import { formatHitRate, hitRateKey } from '../lib/hitRates'
import type { Prediction } from '../lib/predictions'

export function PredictionHitRate({ state, prediction }: { state: HitRateState; prediction: Prediction }) {
  if (state.phase === 'loading') return <span className="hit-rate-placeholder">取得中…</span>
  if (state.phase === 'error') return <span className="hit-rate-placeholder">取得不可</span>

  const rate = state.hitRates.get(hitRateKey(prediction.lottery_type, prediction.pattern))
  if (!rate || rate.prediction_count === 0) return <span className="hit-rate-placeholder">未集計</span>

  return (
    <div className="hit-rate-value">
      <strong>{formatHitRate(rate.hit_rate)}</strong>
      <span className="hit-rate-count">集計 {rate.prediction_count.toLocaleString('ja-JP')}件</span>
    </div>
  )
}
