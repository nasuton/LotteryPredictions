import { parsePredictionPage, resolvePredictionUrl } from './predictions.ts'
import { parseStatus } from './status.ts'
import type { ApiStatus } from './status.ts'
import { hitRateKey, parseHitRatePage } from './hitRates.ts'
import type { LotteryHitRate } from './hitRates.ts'

export const FETCH_ERROR_MESSAGE = 'データの取得に失敗しました'
const REQUEST_TIMEOUT_MS = 15_000

// API v1 paths. The legacy predictions path is used only when v1 responds
// with 404, so the API and this front end can be deployed in either order.
export const PREDICTIONS_PATH = '/api/v1/predictions'
export const LEGACY_PREDICTIONS_PATH = '/api/predictions'
export const STATUS_PATH = '/api/v1/status'
export const HEALTH_PATH = '/health'
export const HIT_RATES_PATH = '/api/v1/lottery_hit_rates'

export class HttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(FETCH_ERROR_MESSAGE)
    this.name = 'HttpError'
    this.status = status
  }
}

interface LoadOptions {
  baseUrl: string
  limit: number
  offset: number
  signal: AbortSignal
  onHealthy?: () => void
}

async function requestJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new HttpError(response.status)
  }

  return response.json()
}

function apiRoot(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function predictionsQuery({ limit, offset }: Pick<LoadOptions, 'limit' | 'offset'>): string {
  return new URLSearchParams({
    limit: String(Math.min(100, Math.max(1, Math.trunc(limit)))),
    offset: String(offset),
  }).toString()
}

async function checkHealth({ baseUrl, signal, onHealthy }: LoadOptions): Promise<void> {
  const health = await requestJson(`${apiRoot(baseUrl)}${HEALTH_PATH}`, signal)

  if (
    typeof health !== 'object' || health === null ||
    !('status' in health) || health.status !== 'ok'
  ) {
    throw new Error(FETCH_ERROR_MESSAGE)
  }

  signal.throwIfAborted()
  onHealthy?.()
}

interface FirstPage {
  payload: unknown
  url: string
}

async function loadFirstPage(options: LoadOptions): Promise<FirstPage> {
  await checkHealth(options)

  const root = apiRoot(options.baseUrl)
  const query = predictionsQuery(options)
  const url = `${root}${PREDICTIONS_PATH}?${query}`

  try {
    return { payload: await requestJson(url, options.signal), url }
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error
  }

  options.signal.throwIfAborted()
  console.info(`[api] ${PREDICTIONS_PATH} が 404 のため旧パス ${LEGACY_PREDICTIONS_PATH} で再試行します`)
  const legacyUrl = `${root}${LEGACY_PREDICTIONS_PATH}?${query}`
  return { payload: await requestJson(legacyUrl, options.signal), url: legacyUrl }
}

export async function loadPredictionData(options: LoadOptions): Promise<unknown> {
  return (await loadFirstPage(options)).payload
}

// A next-page URL must stay on the same path family that served the first page
// (v1 or legacy); anything else is rejected.
function resolvePageUrl(value: string, options: LoadOptions): string {
  const root = apiRoot(options.baseUrl)
  const query = predictionsQuery(options)
  let lastError: unknown
  for (const path of [PREDICTIONS_PATH, LEGACY_PREDICTIONS_PATH]) {
    try {
      return resolvePredictionUrl(value, `${root}${path}?${query}`)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

export async function loadPredictionPage(options: LoadOptions & { url?: string }) {
  if (options.url) {
    const url = resolvePageUrl(options.url, options)
    return parsePredictionPage(await requestJson(url, options.signal), url)
  }
  const { payload, url } = await loadFirstPage(options)
  return parsePredictionPage(payload, url)
}

export async function loadAllPredictions(
  options: LoadOptions & { onProgress?: (loaded: number, total: number) => void },
) {
  let page = await loadPredictionPage(options)
  const total = page.total
  const predictions = new Map<number, (typeof page.predictions)[number]>()
  const visited = new Set<string>()

  while (true) {
    options.signal.throwIfAborted()
    const key = new URL(page.url)
    key.searchParams.sort()
    if (visited.has(key.href)) throw new Error(FETCH_ERROR_MESSAGE)
    visited.add(key.href)

    for (const prediction of page.predictions) {
      if (!predictions.has(prediction.id)) predictions.set(prediction.id, prediction)
    }
    options.onProgress?.(predictions.size, total)
    if (!page.nextUrl) break
    const nextKey = new URL(page.nextUrl)
    nextKey.searchParams.sort()
    if (visited.has(nextKey.href)) throw new Error(FETCH_ERROR_MESSAGE)
    options.signal.throwIfAborted()
    page = await loadPredictionPage({ ...options, url: page.nextUrl })
  }

  // Do not report success with an incomplete result set.
  if (predictions.size !== Math.max(0, total - options.offset)) {
    throw new Error(FETCH_ERROR_MESSAGE)
  }
  return [...predictions.values()]
}

// Independent of the predictions load: failures here must not block the list.
export async function fetchStatus(
  { baseUrl, signal }: Pick<LoadOptions, 'baseUrl' | 'signal'>,
): Promise<ApiStatus> {
  const payload = await requestJson(`${apiRoot(baseUrl)}${STATUS_PATH}`, signal)
  return parseStatus(payload)
}

export async function loadAllHitRates(
  { baseUrl, signal }: Pick<LoadOptions, 'baseUrl' | 'signal'>,
): Promise<LotteryHitRate[]> {
  let url: string | null = `${apiRoot(baseUrl)}${HIT_RATES_PATH}?limit=100&offset=0`
  const visited = new Set<string>()
  const hitRates = new Map<string, LotteryHitRate>()
  let total: number | null = null

  while (url) {
    signal.throwIfAborted()
    const key = new URL(url)
    key.searchParams.sort()
    if (visited.has(key.href)) throw new Error(FETCH_ERROR_MESSAGE)
    visited.add(key.href)

    const page = parseHitRatePage(await requestJson(url, signal), url)
    signal.throwIfAborted()
    total ??= page.total
    for (const rate of page.hitRates) {
      hitRates.set(hitRateKey(rate.lottery_type, rate.pattern), rate)
    }
    url = page.nextUrl
  }

  if (hitRates.size !== total) throw new Error(FETCH_ERROR_MESSAGE)
  return [...hitRates.values()]
}
