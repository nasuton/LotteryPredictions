import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadPredictionPage, FETCH_ERROR_MESSAGE } from '../src/lib/api.ts'
import { parsePredictionPage, predictionsForLottery } from '../src/lib/predictions.ts'

const root = 'https://example.test/lottery'
const firstUrl = `${root}/api/predictions?limit=100&offset=0`
const nextUrl = `${root}/api/predictions?limit=100&offset=100`
const record = (id, lottery_type = 'numbers3') => ({
  id, lottery_type, pattern: '予想パターン', predicted_at: '2026-09-15', numbers: ['0', '3', '3'],
})
const firstPayload = {
  data: Array.from({ length: 100 }, (_, i) => record(i)),
  limit: 100, offset: 0, total: 112,
  next_url: '/lottery/api/predictions?limit=100&offset=100',
}
const lastPayload = {
  data: Array.from({ length: 12 }, (_, i) => record(i + 100, 'loto7')),
  limit: 100, offset: 100, total: 112, next_url: null,
}
const options = () => ({ baseUrl: root, limit: 100, offset: 0, signal: new AbortController().signal })
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })

test('100 + 12 records: follows next_url only when requested and stops at the last page', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url)
    if (url.endsWith('/health')) return json({ status: 'ok' })
    return json(url === firstUrl ? firstPayload : lastPayload)
  })
  const first = await loadPredictionPage(options())
  assert.equal(first.predictions.length, 100)
  assert.equal(first.nextUrl, nextUrl)
  assert.deepEqual(calls, [`${root}/health`, firstUrl])
  const last = await loadPredictionPage({ ...options(), url: first.nextUrl })
  assert.equal(last.predictions.length, 12)
  assert.equal(last.offset, 100)
  assert.equal(last.total, 112)
  assert.equal(last.nextUrl, null)
  assert.equal(predictionsForLottery(last.predictions, 'loto7').length, 12)
  assert.equal(predictionsForLottery(last.predictions, 'numbers3').length, 0)
  assert.deepEqual(calls, [`${root}/health`, firstUrl, nextUrl])
})

for (const link of [nextUrl, '/lottery/api/predictions?limit=100&offset=100', '?limit=100&offset=100']) {
  test(`supports next URL format: ${link}`, () => {
    assert.equal(parsePredictionPage({ ...firstPayload, next_url: link }, firstUrl).nextUrl, nextUrl)
  })
}

for (const link of [null, undefined, '']) {
  test(`last page marker ${String(link)} disables next page`, () => {
    assert.equal(parsePredictionPage({ ...lastPayload, next_url: link }, nextUrl).nextUrl, null)
  })
}

for (const link of ['https://other.test/lottery/api/predictions', '/other-path', firstUrl]) {
  test(`invalid or repeating next URL rejected: ${link}`, () => {
    assert.throws(() => parsePredictionPage({ ...firstPayload, next_url: link }, firstUrl))
  })
}

test('next request uses server URL as-is, including cursor query parameters', async (t) => {
  const url = `${root}/api/predictions?cursor=page-two&limit=25`
  const calls = []
  t.mock.method(globalThis, 'fetch', async (input) => { calls.push(input); return json(lastPayload) })
  await loadPredictionPage({ ...options(), url })
  assert.deepEqual(calls, [url])
})

test('next-page failure can be retried with the same URL and leaves the first page intact', async (t) => {
  const first = parsePredictionPage(firstPayload, firstUrl)
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url)
    return calls.length === 1 ? json({}, 404) : json(lastPayload)
  })
  await assert.rejects(loadPredictionPage({ ...options(), url: first.nextUrl }), { message: FETCH_ERROR_MESSAGE })
  assert.equal(first.predictions.length, 100)
  const last = await loadPredictionPage({ ...options(), url: first.nextUrl })
  assert.equal(last.predictions.length, 12)
  assert.deepEqual(calls, [nextUrl, nextUrl])
})

test('limit is capped at the API maximum of 100', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url)
    return json(url.endsWith('/health') ? { status: 'ok' } : firstPayload)
  })
  await loadPredictionPage({ ...options(), limit: 500 })
  assert.equal(calls[1], firstUrl)
})

test('an empty collection is a valid last page', () => {
  const result = parsePredictionPage({ data: [], limit: 100, offset: 0, total: 0, next_url: null }, firstUrl)
  assert.deepEqual(result.predictions, [])
  assert.equal(result.nextUrl, null)
})

for (const metadata of [{ total: -1 }, { offset: '100' }, { limit: 0 }, { next_url: 123 }]) {
  test(`invalid metadata rejected: ${JSON.stringify(metadata)}`, () => {
    assert.throws(() => parsePredictionPage({ ...firstPayload, ...metadata }, firstUrl))
  })
}
