import { resolvePredictionUrl } from './predictions.ts'
import type { LotteryId } from './predictions.ts'

export type HitRateLotteryId = Extract<LotteryId, 'miniloto' | 'loto6' | 'loto7'>

export interface LotteryHitRate {
  lottery_type: HitRateLotteryId
  pattern: string
  prediction_count: number
  hit_rate: number
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
      typeof item.hit_rate !== 'number' || !Number.isFinite(item.hit_rate) || item.hit_rate < 0 || item.hit_rate > 100
    ) {
      throw new Error('Invalid hit rate record')
    }
    return {
      lottery_type: item.lottery_type,
      pattern: item.pattern,
      prediction_count: item.prediction_count,
      hit_rate: item.hit_rate,
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
