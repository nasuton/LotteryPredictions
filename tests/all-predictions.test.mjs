import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadAllPredictions, FETCH_ERROR_MESSAGE } from '../src/lib/api.ts'

const root = 'https://example.test/lottery'
const firstUrl = `${root}/api/v1/predictions?limit=100&offset=0`
const nextUrl = `${root}/api/v1/predictions?limit=100&offset=100`
const record = (id, lottery_type = 'numbers3') => ({
  id, lottery_type, pattern: '予想', predicted_at: '2026-09-15', numbers: ['0', '3', '3'],
})
const first = {
  data: Array.from({ length: 100 }, (_, i) => record(i)),
  limit: 100, offset: 0, total: 112, next_url: '/lottery/api/v1/predictions?limit=100&offset=100',
}
const last = {
  data: Array.from({ length: 12 }, (_, i) => record(i + 100, 'loto7')),
  limit: 100, offset: 100, total: 112, next_url: null,
}
const options = () => ({ baseUrl: root, limit: 100, offset: 0, signal: new AbortController().signal })
const json = (value, status = 200) => new Response(JSON.stringify(value), { status })

function mockPages(t, final = last) {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url)
    return json(url.endsWith('/health') ? { status: 'ok' } : url === firstUrl ? first : final)
  })
  return calls
}

test('fetches 100 + 12 automatically and returns all 112 in order after completion', async (t) => {
  const calls = mockPages(t)
  const progress = []
  const predictions = await loadAllPredictions({ ...options(), onProgress: (loaded, total) => progress.push([loaded, total]) })
  assert.equal(predictions.length, 112)
  assert.deepEqual(predictions.map((item) => item.id), Array.from({ length: 112 }, (_, i) => i))
  assert.deepEqual(predictions[0].numbers, ['0', '3', '3'])
  assert.equal(predictions.filter((item) => item.lottery_type === 'loto7').length, 12)
  assert.deepEqual(progress, [[100, 112], [112, 112]])
  assert.deepEqual(calls, [`${root}/health`, firstUrl, nextUrl])
})

test('a failed later page rejects the whole load; retry restarts health and all pages', async (t) => {
  const calls = []
  let fail = true
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url)
    if (url === nextUrl && fail) return json({}, 500)
    return json(url.endsWith('/health') ? { status: 'ok' } : url === firstUrl ? first : last)
  })
  await assert.rejects(loadAllPredictions(options()), { message: FETCH_ERROR_MESSAGE })
  assert.equal(calls.length, 3)
  fail = false
  const predictions = await loadAllPredictions(options())
  assert.equal(predictions.length, 112)
  assert.deepEqual(calls, [...[`${root}/health`, firstUrl, nextUrl], ...[`${root}/health`, firstUrl, nextUrl]])
})

test('an earlier next URL stops the chain without another request', async (t) => {
  const calls = mockPages(t, { ...last, next_url: firstUrl })
  await assert.rejects(loadAllPredictions(options()), { message: FETCH_ERROR_MESSAGE })
  assert.equal(calls.length, 3)
})

test('query parameter order does not bypass loop detection', async (t) => {
  const calls = mockPages(t, { ...last, next_url: `${root}/api/v1/predictions?offset=0&limit=100` })
  await assert.rejects(loadAllPredictions(options()), { message: FETCH_ERROR_MESSAGE })
  assert.equal(calls.length, 3)
})

test('missing data on the last page is an error, not a partial success', async (t) => {
  mockPages(t, { ...last, data: [] })
  await assert.rejects(loadAllPredictions(options()), { message: FETCH_ERROR_MESSAGE })
})

test('overlapping records are not duplicated', async (t) => {
  mockPages(t, { ...last, data: [record(99), ...last.data] })
  const predictions = await loadAllPredictions(options())
  assert.equal(predictions.length, 112)
  assert.equal(predictions.filter((item) => item.id === 99).length, 1)
})

test('cancellation between pages stops the next request', async (t) => {
  const calls = mockPages(t)
  const controller = new AbortController()
  await assert.rejects(loadAllPredictions({ ...options(), signal: controller.signal, onProgress: () => controller.abort() }), { name: 'AbortError' })
  assert.deepEqual(calls, [`${root}/health`, firstUrl])
})

test('an empty result is a successful complete load', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => json(url.endsWith('/health') ? { status: 'ok' } : {
    data: [], limit: 100, offset: 0, total: 0, next_url: null,
  }))
  assert.deepEqual(await loadAllPredictions(options()), [])
})
