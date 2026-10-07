import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { usePredictions } from './hooks/usePredictions'
import { useStatus } from './hooks/useStatus'
import { useHitRates } from './hooks/useHitRates'
import { supportsHitRate } from './lib/hitRates'
import { PredictionHitRate } from './components/PredictionHitRate'
import { FETCH_ERROR_MESSAGE } from './lib/api'
import { buildPredictionsCsv, downloadCsv, predictionsCsvFileName } from './lib/csv'
import { lotteries, predictionsForLottery } from './lib/predictions'
import type { LotteryId, Prediction } from './lib/predictions'
import { SiteFooter } from './components/SiteFooter'
import { StatusPanel } from './components/StatusPanel'

import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState<LotteryId>('numbers3')
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const { state, retry } = usePredictions()
  const { state: statusState, reload: reloadStatus } = useStatus()
  const { state: hitRateState, reload: reloadHitRates } = useHitRates()
  const activeLottery = lotteries.find((lottery) => lottery.id === activeTab) ?? lotteries[0]
  const isLoading = state.phase === 'checking' || state.phase === 'loading'
  const statusLabel = { checking: '確認中', loading: '取得中', success: 'OK', error: '通信エラー' }[state.phase]
  const statusMessage = {
    checking: 'APIの接続状態を確認しています…',
    loading: state.phase === 'loading' && state.total !== null
      ? '予想データを取得しています…（' + state.loaded + ' / ' + state.total + '件）'
      : '予想データを取得しています…',
    success: state.phase === 'success' ? '全' + state.predictions.length + '件の予想データを取得しました。' : '',
    error: FETCH_ERROR_MESSAGE + '。再試行してください。',
  }[state.phase]

  function handleRetry() {
    retry()
    reloadStatus()
    reloadHitRates()
  }

  function handleDownloadCsv(lottery: (typeof lotteries)[number], rows: Prediction[]) {
    downloadCsv(predictionsCsvFileName(lottery.id), buildPredictionsCsv(rows, lottery.name))
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % lotteries.length
        break
      case 'ArrowLeft':
        nextIndex = (index - 1 + lotteries.length) % lotteries.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = lotteries.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    setActiveTab(lotteries[nextIndex].id)
    tabRefs.current[nextIndex]?.focus({ preventScroll: true })
    tabRefs.current[nextIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <h1>宝くじ予想</h1>
        <p>宝くじの種類を選択してください。</p>
        <p className="prediction-notice">
          <strong>本ページで公開している予想情報は、当せんを保証するものではありません。</strong>
          <br />
          選択された数字は、複数の予想パターンで重複している場合があります。
        </p>
      </header>

      <main>
        <div className={`api-status api-status--${state.phase}`}>
          <p role={state.phase === 'error' ? 'alert' : 'status'} aria-atomic="true">
            <span className="status-badge">{statusLabel}</span>
            <span>{statusMessage}</span>
          </p>
          {state.phase === 'error' && (
            <button type="button" className="retry-button" onClick={handleRetry}>再試行</button>
          )}
        </div>

        <StatusPanel state={statusState} lotteryId={activeLottery.id} lotteryName={activeLottery.name} />

        <div className="lottery-workspace">
          <div className="lottery-tabs" role="tablist" aria-label="宝くじの種類">
            {lotteries.map((lottery, index) => (
              <button
                key={lottery.id}
                ref={(element) => { tabRefs.current[index] = element }}
                id={`tab-${lottery.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === lottery.id}
                aria-controls={`panel-${lottery.id}`}
                tabIndex={activeTab === lottery.id ? 0 : -1}
                className="lottery-tab"
                onClick={() => setActiveTab(lottery.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                {lottery.id}
              </button>
            ))}
          </div>

          {lotteries.map((lottery) => {
            const showHitRate = supportsHitRate(lottery.id)
            const rows = state.phase === 'success'
              ? predictionsForLottery(state.predictions, lottery.id)
              : []

            return (
              <section
                key={lottery.id}
                id={`panel-${lottery.id}`}
                role="tabpanel"
                aria-labelledby={`tab-${lottery.id}`}
                aria-busy={isLoading}
                tabIndex={0}
                hidden={activeTab !== lottery.id}
                className="lottery-panel"
              >
                <div className="panel-heading">
                  <h2>{lottery.name}</h2>
                  {state.phase === 'success' && <span className="record-count">{rows.length}件</span>}
                  {state.phase === 'success' && rows.length > 0 && (
                    <button
                      type="button"
                      className="csv-button"
                      aria-label={`${lottery.name}の予想をCSVファイルでダウンロード`}
                      onClick={() => handleDownloadCsv(lottery, rows)}
                    >
                      CSVダウンロード
                    </button>
                  )}
                </div>
                {showHitRate && (
                  <div className="hit-rate-notice">
                    <p>ヒット率は、各予想パターンの過去の集計における3個以上一致率です（最新の集計値）。</p>
                    {hitRateState.phase === 'error' && (
                      <div className="hit-rate-error">
                        <p role="alert">ヒット率の取得に失敗しました。</p>
                        <button type="button" className="retry-button" onClick={reloadHitRates}>ヒット率を再取得</button>
                      </div>
                    )}
                  </div>
                )}
                {state.phase === 'success' && rows.length > 0 ? (
                  <table className={`prediction-table${showHitRate ? ' prediction-table--hit-rates' : ''}`} aria-label={`${lottery.name}の予想一覧`}>
                    <thead>
                      <tr>
                        <th scope="col">予想パターン</th>
                        <th scope="col">予想数字</th>
                        <th scope="col">対象抽選日</th>
                        {showHitRate && <th scope="col">ヒット率<br />（3個以上一致）</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((prediction) => (
                        <tr key={prediction.id}>
                          <td>{prediction.pattern}</td>
                          <td>
                            <div className="prediction-numbers">
                              <span className="visually-hidden">{prediction.numbers.join('、')}</span>
                              {prediction.numbers.map((number, index) => (
                                <span className="number-chip" key={index} aria-hidden="true">{number}</span>
                              ))}
                            </div>
                          </td>
                          <td><time dateTime={prediction.predicted_at}>{prediction.predicted_at.replaceAll('-', '/')}</time></td>
                          {showHitRate && <td><PredictionHitRate state={hitRateState} prediction={prediction} /></td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">
                    <p className="empty-state-title">
                      {isLoading ? '読み込み中です…' : state.phase === 'error'
                        ? FETCH_ERROR_MESSAGE : '予想データがありません'}
                    </p>
                    {state.phase === 'success' && (
                      <p>取得したデータには{lottery.name}の予想が含まれていません。</p>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

export default App
