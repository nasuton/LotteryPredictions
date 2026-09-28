import type { StatusState } from '../hooks/useStatus'
import type { LotteryId } from '../lib/predictions'
import {
  batchRunForLottery, batchStatusLabels, formatBatchTime, formatLongDate,
  parseDateTime, parseLocalDate, staleNote, summaryForLottery,
} from '../lib/status'

import './StatusPanel.css'

interface StatusPanelProps {
  state: StatusState
  lotteryId: LotteryId
  lotteryName: string
}

// Reflects the selected tab. No aria-live on purpose: announcing on every tab
// switch would be noisy; the content is read when the user reaches the section.
export function StatusPanel({ state, lotteryId, lotteryName }: StatusPanelProps) {
  if (state.phase !== 'ready') return null

  const summary = summaryForLottery(state.status, lotteryId)
  const latestDate = summary ? parseLocalDate(summary.latest_predicted_at) : null
  const stale = summary ? staleNote(summary.latest_predicted_at) : null
  const run = batchRunForLottery(state.status, lotteryId)
  const runDate = run ? parseDateTime(run.finished_at || run.started_at) : null

  return (
    <section className="status-panel" aria-labelledby="status-panel-title">
      <h2 id="status-panel-title" className="status-panel-title">
        更新状況<span className="status-panel-target">（{lotteryName}）</span>
      </h2>
      <dl className="status-list">
        <div className="status-item">
          <dt>予想更新日</dt>
          <dd>
            {latestDate && summary ? (
              <>
                <time dateTime={summary.latest_predicted_at}>{formatLongDate(latestDate)}</time>
                {stale && <span className="status-stale">（{stale}）</span>}
              </>
            ) : '未登録'}
          </dd>
        </div>
        <div className="status-item">
          <dt>予想パターン数</dt>
          <dd>{summary ? `${summary.count}件` : '0件'}</dd>
        </div>
        {run && (
          <div className="status-item">
            <dt>最終バッチ</dt>
            <dd>
              <span className={`batch-status batch-status--${run.status}`}>{batchStatusLabels[run.status]}</span>
              {runDate && (
                <>
                  <span className="status-separator" aria-hidden="true">/</span>
                  <time dateTime={runDate.toISOString()}>{formatBatchTime(runDate)}</time>
                  <span className="status-timezone">（日本時間）</span>
                </>
              )}
            </dd>
          </div>
        )}
      </dl>
      {run?.status === 'failed' && (
        <p className="status-note">表示中の予想は前回のものです。</p>
      )}
    </section>
  )
}
