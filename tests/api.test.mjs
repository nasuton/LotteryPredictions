import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadPredictionData, FETCH_ERROR_MESSAGE } from '../src/lib/api.ts'

const options = () => ({
  baseUrl: 'https://example.test/lottery/',
  limit: 50,
  offset: 0,
  signal: new AbortController().signal,
})

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
})

test('health succeeds before requesting predictions; custom limit is sent', async (t) => {
  const events = []
  const payload = { sample: [] }
  t.mock.method(globalThis, 'fetch', async (url) => {
    events.push(url)
    return events.length === 1 ? json({ status: 'ok' }) : json(payload)
  })
  const result = await loadPredictionData({
    ...options(), limit: 100, onHealthy: () => events.push('healthy'),
  })
  assert.deepEqual(result, payload)
  assert.deepEqual(events, [
    'https://example.test/lottery/health', 'healthy',
    'https://example.test/lottery/api/predictions?limit=100&offset=0',
  ])
})

for (const health of [{ status: 'NG' }, {}, null]) {
  test(`health ${JSON.stringify(health)} stops predictions request`, async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => json(health))
    await assert.rejects(loadPredictionData(options()), { message: FETCH_ERROR_MESSAGE })
    assert.equal(fetchMock.mock.callCount(), 1)
  })
}

for (const code of [403, 404, 500]) {
  test(`health HTTP ${code} stops predictions request`, async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => json({}, code))
    await assert.rejects(loadPredictionData(options()), { message: FETCH_ERROR_MESSAGE })
    assert.equal(fetchMock.mock.callCount(), 1)
  })
}

test('predictions HTTP error is rejected after a successful health check', async (t) => {
  let call = 0
  t.mock.method(globalThis, 'fetch', async () =>
    ++call === 1 ? json({ status: 'ok' }) : json({}, 404))
  await assert.rejects(loadPredictionData(options()), { message: FETCH_ERROR_MESSAGE })
  assert.equal(call, 2)
})

test('invalid JSON does not count as a healthy response', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('<html>Error</html>'))
  await assert.rejects(loadPredictionData(options()), SyntaxError)
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('network errors are rejected', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch') })
  await assert.rejects(loadPredictionData(options()), TypeError)
})

test('cancellation after health prevents the next request', async (t) => {
  const controller = new AbortController()
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    controller.abort()
    return json({ status: 'ok' })
  })
  await assert.rejects(loadPredictionData({ ...options(), signal: controller.signal }), { name: 'AbortError' })
  assert.equal(fetchMock.mock.callCount(), 1)
})
