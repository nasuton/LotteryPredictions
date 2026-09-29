import { lotteries } from './predictions.ts'
import type { LotteryId } from './predictions.ts'

export const batchStatuses = ['success', 'failed', 'skipped'] as const
export type BatchStatus = (typeof batchStatuses)[number]

export interface PredictionSummary {
  lottery_type: LotteryId
  count: number
  latest_predicted_at: string
}

export interface BatchRun {
  batch_name: string
  lottery_type: LotteryId
  status: BatchStatus
  started_at: string
  finished_at: string
  rows_affected: number
  message: string
}

export interface ApiStatus {
  predictions: {
    total: number
    by_type: PredictionSummary[]
  }
  // null until the batch side starts recording runs.
  last_batch_runs: BatchRun[] | null
  generated_at: string
}

export const REGISTRATION_BATCH = 'registration'
export const STALE_AFTER_DAYS = 2

export const batchStatusLabels: Record<BatchStatus, string> = {
  success: '成功',
  failed: '失敗',
  skipped: 'スキップ',
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLotteryId(value: unknown): value is LotteryId {
  return lotteries.some((lottery) => lottery.id === value)
}

function isBatchStatus(value: unknown): value is BatchStatus {
  return batchStatuses.some((status) => status === value)
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function parseSummary(item: unknown): PredictionSummary | null {
  if (
    !isRecord(item) || !isLotteryId(item.lottery_type) || !isCount(item.count) ||
    typeof item.latest_predicted_at !== 'string' || !DATE_ONLY.test(item.latest_predicted_at)
  ) {
    return null
  }
  return { lottery_type: item.lottery_type, count: item.count, latest_predicted_at: item.latest_predicted_at }
}

function parseBatchRun(item: unknown): BatchRun | null {
  if (
    !isRecord(item) || typeof item.batch_name !== 'string' ||
    !isLotteryId(item.lottery_type) || !isBatchStatus(item.status)
  ) {
    return null
  }
  return {
    batch_name: item.batch_name,
    lottery_type: item.lottery_type,
    status: item.status,
    started_at: typeof item.started_at === 'string' ? item.started_at : '',
    finished_at: typeof item.finished_at === 'string' ? item.finished_at : '',
    rows_affected: isCount(item.rows_affected) ? item.rows_affected : 0,
    message: typeof item.message === 'string' ? item.message : '',
  }
}

// Unknown lottery types or statuses are skipped instead of failing the whole panel.
export function parseStatus(payload: unknown): ApiStatus {
  if (!isRecord(payload) || !isRecord(payload.data)) throw new Error('Invalid status response')
  const { predictions, last_batch_runs: runs, generated_at: generatedAt } = payload.data
  if (
    !isRecord(predictions) || !isCount(predictions.total) || !Array.isArray(predictions.by_type) ||
    (runs !== null && runs !== undefined && !Array.isArray(runs)) ||
    typeof generatedAt !== 'string'
  ) {
    throw new Error('Invalid status response')
  }

  return {
    predictions: {
      total: predictions.total,
      by_type: predictions.by_type.map(parseSummary).filter((item) => item !== null),
    },
    last_batch_runs: Array.isArray(runs) ? runs.map(parseBatchRun).filter((item) => item !== null) : null,
    generated_at: generatedAt,
  }
}

export function summaryForLottery(status: ApiStatus, lotteryId: LotteryId): PredictionSummary | null {
  return status.predictions.by_type.find((item) => item.lottery_type === lotteryId) ?? null
}

function runTime(run: BatchRun): number {
  const time = new Date(run.finished_at || run.started_at).getTime()
  return Number.isNaN(time) ? -Infinity : time
}

// Prefers the registration batch; otherwise the most recently finished run of the type.
export function batchRunForLottery(status: ApiStatus, lotteryId: LotteryId): BatchRun | null {
  if (!status.last_batch_runs) return null
  const runs = status.last_batch_runs.filter((run) => run.lottery_type === lotteryId)
  if (runs.length === 0) return null
  const registration = runs.find((run) => run.batch_name === REGISTRATION_BATCH)
  if (registration) return registration
  return runs.reduce((latest, run) => (runTime(run) > runTime(latest) ? run : latest))
}

// `YYYY-MM-DD` has no time zone; build a local date so the day never shifts.
export function parseLocalDate(value: string): Date | null {
  const match = DATE_ONLY.exec(value)
  if (!match) return null
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (
    date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null
  }
  return date
}

export function parseDateTime(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// e.g. 2026年9月28日（月）
export function formatLongDate(date: Date, timeZone?: string): string {
  const long = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long', timeZone }).format(date)
  const weekday = new Intl.DateTimeFormat('ja-JP', { weekday: 'short', timeZone }).format(date)
  return `${long}（${weekday}）`
}

// All times shown in the UI are JST: the API records batch runs and prediction
// dates in Japan time, so viewers abroad see the same values as the batch logs.
export const JST = 'Asia/Tokyo'

// e.g. 9月28日 03:05 (JST)
export function formatBatchTime(date: Date, timeZone: string = JST): string {
  const day = new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', timeZone }).format(date)
  const time = new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone,
  }).format(date)
  return `${day} ${time}`
}

// Calendar date (`YYYY-MM-DD`) of an instant in JST, independent of the viewer's zone.
export function toJstDateOnly(instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: JST,
  }).formatToParts(instant)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function dateOnlyToUtc(value: string): number | null {
  const match = DATE_ONLY.exec(value)
  if (!match) return null
  const [, year, month, day] = match
  return Date.UTC(Number(year), Number(month) - 1, Number(day))
}

// Whole calendar days from a `YYYY-MM-DD` (JST) value to today's JST date.
export function daysAgo(dateOnly: string, now: Date = new Date()): number | null {
  const start = dateOnlyToUtc(dateOnly)
  const end = dateOnlyToUtc(toJstDateOnly(now))
  if (start === null || end === null) return null
  return Math.round((end - start) / 86_400_000)
}

// Returns a "N 日前" note only when the latest prediction is at least 2 days old (JST).
export function staleNote(dateOnly: string, now: Date = new Date()): string | null {
  const days = daysAgo(dateOnly, now)
  return days !== null && days >= STALE_AFTER_DAYS ? `${days}日前` : null
}
