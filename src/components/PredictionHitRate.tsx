import type { HitRateState } from '../hooks/useHitRates'
import { formatHitRate, hitRateKey, matchRateColumnsForLottery } from '../lib/hitRates'
import type { Prediction } from '../lib/predictions'

export function PredictionHitRate({ state, prediction }: { state: HitRateState; prediction: Prediction }) {
  if (state.phase === 'loading') return <span className="hit-rate-placeholder">取得中…</span>
  if (state.phase === 'error') return <span className="hit-rate-placeholder">取得不可</span>

  const rate = state.hitRates.get(hitRateKey(prediction.lottery_type, prediction.pattern))
  if (!rate || rate.prediction_count === 0) return <span className="hit-rate-placeholder">未集計</span>

  return (
    <div className="hit-rate-value">
      <span className="hit-rate-summary-label">3個以上一致</span>
      <strong>{formatHitRate(rate.hit_rate)}</strong>
      <span className="hit-rate-count">集計 {rate.prediction_count.toLocaleString('ja-JP')}件</span>
      <dl className="hit-rate-breakdown">
        {matchRateColumnsForLottery(rate.lottery_type).map(({ count, field }) => (
          <div key={field}>
            <dt>{count}個一致</dt>
            <dd>{rate[field] === null ? '未集計' : formatHitRate(rate[field])}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
