import { parsePredictionPage, resolvePredictionUrl } from './predictions.ts'

export const FETCH_ERROR_MESSAGE = 'データの取得に失敗しました'
const REQUEST_TIMEOUT_MS = 15_000

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
    throw new Error(FETCH_ERROR_MESSAGE)
  }

  return response.json()
}

export async function loadPredictionData({
  baseUrl, limit, offset, signal, onHealthy,
}: LoadOptions): Promise<unknown> {
  const root = baseUrl.replace(/\/+$/, '')
  const health = await requestJson(`${root}/health`, signal)

  if (
    typeof health !== 'object' || health === null ||
    !('status' in health) || health.status !== 'ok'
  ) {
    throw new Error(FETCH_ERROR_MESSAGE)
  }

  signal.throwIfAborted()
  onHealthy?.()

  const query = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, Math.trunc(limit)))), offset: String(offset) })
  return requestJson(`${root}/api/predictions?${query}`, signal)
}

export async function loadPredictionPage(options: LoadOptions & { url?: string }) {
  const root = options.baseUrl.replace(/\/+$/, '')
  const query = new URLSearchParams({
    limit: String(Math.min(100, Math.max(1, Math.trunc(options.limit)))),
    offset: String(options.offset),
  })
  const initialUrl = `${root}/api/predictions?${query}`
  const url = options.url ? resolvePredictionUrl(options.url, initialUrl) : initialUrl
  const payload = options.url
    ? await requestJson(url, options.signal)
    : await loadPredictionData(options)
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
