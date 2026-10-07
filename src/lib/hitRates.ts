import { resolvePredictionUrl } from './predictions.ts'
import type { LotteryId } from './predictions.ts'

export type HitRateLotteryId = Extract<LotteryId, 'miniloto' | 'loto6' | 'loto7'>

export interface LotteryHitRate {
  lottery_type: HitRateLotteryId
  pattern: string
  prediction_count: number
  hit_rate: number
  match_3_rate: number
  match_4_rate: number
  match_5_rate: number
  match_6_rate: number | null
  match_7_rate: number | null
}

const matchRateColumns = [
  { count: 3, field: 'match_3_rate' },
  { count: 4, field: 'match_4_rate' },
  { count: 5, field: 'match_5_rate' },
  { count: 6, field: 'match_6_rate' },
  { count: 7, field: 'match_7_rate' },
] as const

export function matchRateColumnsForLottery(lotteryId: HitRateLotteryId) {
  const maxMatches = { miniloto: 5, loto6: 6, loto7: 7 }[lotteryId]
  return matchRateColumns.filter((column) => column.count <= maxMatches)
}

export function supportsHitRate(lotteryId: LotteryId): lotteryId is HitRateLotteryId {
  return lotteryId === 'miniloto' || lotteryId === 'loto6' || lotteryId === 'loto7'
}

export function hitRateKey(lotteryId: LotteryId, pattern: string): string {
  return JSON.stringify([lotteryId, pattern])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPercentage(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

export function parseHitRatePage(payload: unknown, requestUrl: string) {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error('Invalid hit rates response')
  }

  const hitRates: LotteryHitRate[] = payload.data.map((item: unknown) => {
    if (
      !isRecord(item) ||
      (item.lottery_type !== 'miniloto' && item.lottery_type !== 'loto6' && item.lottery_type !== 'loto7') ||
      typeof item.pattern !== 'string' || !item.pattern.trim() ||
      typeof item.prediction_count !== 'number' || !Number.isSafeInteger(item.prediction_count) || item.prediction_count < 0 ||
      !isPercentage(item.hit_rate) ||
      !isPercentage(item.match_3_rate) ||
      !isPercentage(item.match_4_rate) ||
      !isPercentage(item.match_5_rate) ||
      (item.lottery_type !== 'miniloto' && !isPercentage(item.match_6_rate)) ||
      (item.lottery_type === 'loto7' && !isPercentage(item.match_7_rate))
    ) {
      throw new Error('Invalid hit rate record')
    }
    return {
      lottery_type: item.lottery_type,
      pattern: item.pattern,
      prediction_count: item.prediction_count,
      hit_rate: item.hit_rate,
      match_3_rate: item.match_3_rate,
      match_4_rate: item.match_4_rate,
      match_5_rate: item.match_5_rate,
      match_6_rate: item.lottery_type !== 'miniloto' ? item.match_6_rate as number : null,
      match_7_rate: item.lottery_type === 'loto7' ? item.match_7_rate as number : null,
    }
  })

  const { limit, offset, total, next_url: nextUrl } = payload
  if (
    typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 ||
    typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0 ||
    typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0 ||
    (nextUrl !== null && nextUrl !== undefined && typeof nextUrl !== 'string')
  ) {
    throw new Error('Invalid hit rates pagination')
  }
  const resolvedNext = typeof nextUrl === 'string' && nextUrl.trim()
    ? resolvePredictionUrl(nextUrl, requestUrl)
    : null
  return { hitRates, nextUrl: resolvedNext, total }
}

export function formatHitRate(value: number): string {
  return `${new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 }).format(value)}%`
}
