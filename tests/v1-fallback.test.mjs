import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  loadAllPredictions, loadPredictionData, loadPredictionPage, FETCH_ERROR_MESSAGE,
} from '../src/lib/api.ts'

const root = 'https://example.test/lottery'
const healthUrl = `${root}/health`
const v1First = `${root}/api/v1/predictions?limit=100&offset=0`
const v1Next = `${root}/api/v1/predictions?limit=100&offset=100`
const legacyFirst = `${root}/api/predictions?limit=100&offset=0`
const legacyNext = `${root}/api/predictions?limit=100&offset=100`
const record = (id, lottery_type = 'numbers3') => ({
  id, lottery_type, pattern: '予想', predicted_at: '2026-09-15', numbers: ['0', '3', '3'],
})
const firstPage = (next_url) => ({
  data: Array.from({ length: 100 }, (_, i) => record(i)), limit: 100, offset: 0, total: 112, next_url,
})
const lastPage = {
  data: Array.from({ length: 12 }, (_, i) => record(i + 100, 'loto7')),
  limit: 100, offset: 100, total: 112, next_url: null,
}
const options = () => ({ baseUrl: root, limit: 100, offset: 0, signal: new AbortController().signal })
const json = (value, status = 200) => new Response(JSON.stringify(value), { status })
const notFound = () => json({ error: { code: 'not_found', message: 'not found', request_id: 'x' } }, 404)

function mockLegacyOnly(t) {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url)
    if (url === healthUrl) return json({ status: 'ok' })
    if (url.includes('/api/v1/')) return notFound()
    if (url === legacyFirst) return json(firstPage('/lottery/api/predictions?limit=100&offset=100'))
    if (url === legacyNext) return json(lastPage)
    return notFound()
  })
  return calls
}

test('v1 path is requested first and used when it responds', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url)
    return json(url === healthUrl ? { status: 'ok' } : firstPage(null))
  })
  const info = t.mock.method(console, 'info', () => {})
  const page = await loadPredictionPage(options())
  assert.equal(page.url, v1First)
  assert.deepEqual(calls, [healthUrl, v1First])
  assert.equal(info.mock.callCount(), 0)
})

test('v1 404 falls back to the legacy path once and logs a single console.info line', async (t) => {
  const calls = mockLegacyOnly(t)
  const info = t.mock.method(console, 'info', () => {})
  const payload = await loadPredictionData(options())
  assert.equal(payload.total, 112)
  assert.deepEqual(calls, [healthUrl, v1First, legacyFirst])
  assert.equal(info.mock.callCount(), 1)
  assert.match(info.mock.calls[0].arguments[0], /\/api\/v1\/predictions/)
  assert.match(info.mock.calls[0].arguments[0], /\/api\/predictions/)
})

test('v1 500 is an error and does not fall back', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url)
    return url === healthUrl ? json({ status: 'ok' }) : json({}, 500)
  })
  const info = t.mock.method(console, 'info', () => {})
  await assert.rejects(loadPredictionData(options()), { message: FETCH_ERROR_MESSAGE })
  assert.deepEqual(calls, [healthUrl, v1First])
  assert.equal(info.mock.callCount(), 0)
})

test('legacy 404 after a v1 404 is an error', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url)
    return url === healthUrl ? json({ status: 'ok' }) : notFound()
  })
  t.mock.method(console, 'info', () => {})
  await assert.rejects(loadPredictionData(options()), { message: FETCH_ERROR_MESSAGE })
  assert.deepEqual(calls, [healthUrl, v1First, legacyFirst])
})

test('next_url follows the v1 path when v1 served the first page', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url)
    if (url === healthUrl) return json({ status: 'ok' })
    if (url === v1First) return json(firstPage('/lottery/api/v1/predictions?limit=100&offset=100'))
    if (url === v1Next) return json(lastPage)
    return notFound()
  })
  const predictions = await loadAllPredictions(options())
  assert.equal(predictions.length, 112)
  assert.deepEqual(calls, [healthUrl, v1First, v1Next])
})

test('next_url follows the legacy path after falling back', async (t) => {
  const calls = mockLegacyOnly(t)
  t.mock.method(console, 'info', () => {})
  const predictions = await loadAllPredictions(options())
  assert.equal(predictions.length, 112)
  assert.deepEqual(calls, [healthUrl, v1First, legacyFirst, legacyNext])
})

test('a legacy next_url returned by a v1 page is rejected', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url === healthUrl) return json({ status: 'ok' })
    return json(firstPage('/lottery/api/predictions?limit=100&offset=100'))
  })
  await assert.rejects(loadPredictionPage(options()), { message: 'Invalid next page URL' })
})

test('explicit page URLs are accepted for both v1 and legacy paths only', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => { calls.push(url); return json(lastPage) })
  for (const url of [v1Next, legacyNext]) {
    const page = await loadPredictionPage({ ...options(), url })
    assert.equal(page.url, url)
  }
  assert.deepEqual(calls, [v1Next, legacyNext])
  await assert.rejects(
    loadPredictionPage({ ...options(), url: `${root}/api/v2/predictions?limit=100&offset=100` }),
    { message: 'Invalid next page URL' },
  )
  assert.equal(calls.length, 2)
})

test('cancellation between v1 404 and the legacy retry stops the request', async (t) => {
  const controller = new AbortController()
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url)
    if (url === healthUrl) return json({ status: 'ok' })
    controller.abort()
    return notFound()
  })
  await assert.rejects(loadPredictionData({ ...options(), signal: controller.signal }), { name: 'AbortError' })
  assert.deepEqual(calls, [healthUrl, v1First])
})
