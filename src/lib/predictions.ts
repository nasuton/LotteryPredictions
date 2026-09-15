export const lotteries = [
  { id: 'numbers3', name: 'ナンバーズ3' },
  { id: 'numbers4', name: 'ナンバーズ4' },
  { id: 'miniloto', name: 'ミニロト' },
  { id: 'loto6', name: 'ロト6' },
  { id: 'loto7', name: 'ロト7' },
] as const

export type LotteryId = (typeof lotteries)[number]['id']

export interface Prediction {
  id: number
  lottery_type: LotteryId
  pattern: string
  predicted_at: string
  numbers: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLotteryId(value: unknown): value is LotteryId {
  return lotteries.some((lottery) => lottery.id === value)
}

export function parsePredictions(payload: unknown): Prediction[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error('Invalid predictions response')
  }

  return payload.data.map((item: unknown) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'number' || !Number.isSafeInteger(item.id) ||
      !isLotteryId(item.lottery_type) ||
      typeof item.pattern !== 'string' || !item.pattern.trim() ||
      typeof item.predicted_at !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.predicted_at) ||
      !Array.isArray(item.numbers) || item.numbers.length === 0 ||
      !item.numbers.every((number: unknown) => typeof number === 'string' && /^\d+$/.test(number))
    ) {
      throw new Error('Invalid prediction record')
    }

    return {
      id: item.id,
      lottery_type: item.lottery_type,
      pattern: item.pattern,
      predicted_at: item.predicted_at,
      numbers: item.numbers as string[],
    }
  })
}

export function predictionsForLottery(predictions: Prediction[], lotteryId: LotteryId) {
  return predictions.filter((prediction) => prediction.lottery_type === lotteryId)
}

export interface PredictionPage {
  predictions: Prediction[]
  nextUrl: string | null
  offset: number
  limit: number
  total: number
  url: string
}

export function resolvePredictionUrl(value: string, currentUrl: string): string {
  const current = new URL(currentUrl)
  const resolved = new URL(value, current)
  if (
    resolved.origin !== current.origin || resolved.pathname !== current.pathname ||
    resolved.username || resolved.password || resolved.hash
  ) {
    throw new Error('Invalid next page URL')
  }
  return resolved.href
}

export function parsePredictionPage(payload: unknown, requestUrl: string): PredictionPage {
  const predictions = parsePredictions(payload)
  if (!isRecord(payload)) throw new Error('Invalid predictions response')
  const { limit, offset, total, next_url: nextUrl } = payload
  if (
    typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 ||
    typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0 ||
    typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0 ||
    (nextUrl !== null && nextUrl !== undefined && typeof nextUrl !== 'string')
  ) {
    throw new Error('Invalid pagination metadata')
  }
  const resolvedNext = typeof nextUrl === 'string' && nextUrl.trim()
    ? resolvePredictionUrl(nextUrl, requestUrl)
    : null
  if (resolvedNext === new URL(requestUrl).href) throw new Error('Next page repeats the current page')
  return { predictions, nextUrl: resolvedNext, limit, offset, total, url: requestUrl }
}
