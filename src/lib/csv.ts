import type { Prediction } from './predictions.ts'
import { toJstDateOnly } from './status.ts'

export const CSV_HEADER = ['宝くじ', '予想パターン', '予想数字', '対象抽選日'] as const

// Excel on Windows needs the BOM to read UTF-8 CSV correctly; RFC 4180 uses CRLF.
const BOM = '\uFEFF'
const NEWLINE = '\r\n'

export function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

// Numbers are joined with a space so leading zeros and order survive in spreadsheets.
export function buildPredictionsCsv(predictions: readonly Prediction[], lotteryName: string): string {
  const rows = predictions.map((prediction) => [
    lotteryName,
    prediction.pattern,
    prediction.numbers.join(' '),
    prediction.predicted_at,
  ])
  return BOM + [CSV_HEADER, ...rows].map((row) => row.map(escapeCsvField).join(',')).join(NEWLINE) + NEWLINE
}

// The date stamp is the JST calendar date, matching the dates shown on the page.
export function predictionsCsvFileName(lotteryId: string, now: Date = new Date()): string {
  return `predictions_${lotteryId}_${toJstDateOnly(now).replaceAll('-', '')}.csv`
}

export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
