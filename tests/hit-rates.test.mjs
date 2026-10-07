import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError, loadAllHitRates } from '../src/lib/api.ts'
import { formatHitRate, hitRateKey, matchRateColumnsForLottery, parseHitRatePage, supportsHitRate } from '../src/lib/hitRates.ts'

const baseUrl = 'https://example.com/lottery'
const firstUrl = `${baseUrl}/api/v1/lottery_hit_rates?limit=100&offset=0`
const nextUrl = '/lottery/api/v1/lottery_hit_rates?limit=100&offset=100'
const options = () => ({ baseUrl, signal: new AbortController().signal })
const rate = (overrides = {}) => ({
  lottery_type: 'loto6', pattern: 'frequency', prediction_count: 120, hit_rate: 12.5,
  match_3_rate: 10, match_4_rate: 2, match_5_rate: 0.4,
  match_6_rate: overrides.lottery_type === 'miniloto' ? null : 0.1,
  match_7_rate: overrides.lottery_type === 'loto7' ? 0 : null,
  ...overrides,
})
const page = (data, overrides = {}) => ({ data, total: data.length, limit: 100, offset: 0, next_url: null, ...overrides })
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })

test('loads all hit rate pages and keeps identical pattern names separate by lottery type', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push([url, init.cache, init.headers.Accept])
    return json(url === firstUrl
      ? page([rate()], { total: 2, next_url: nextUrl })
      : page([rate({ lottery_type: 'loto7', hit_rate: 0 })], { total: 2, offset: 100 }))
  })
  const rates = await loadAllHitRates(options())
  assert.deepEqual(calls, [firstUrl, `https://example.com${nextUrl}`].map((url) => [url, 'no-store', 'application/json']))
  assert.deepEqual(rates, [rate(), rate({ lottery_type: 'loto7', hit_rate: 0 })])
  assert.notEqual(hitRateKey('loto6', 'frequency'), hitRateKey('loto7', 'frequency'))
})

test('empty results and zero rates are accepted; percentage values are not multiplied by 100', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json(page([])))
  assert.deepEqual(await loadAllHitRates(options()), [])
  assert.equal(parseHitRatePage(page([rate({ hit_rate: 0 })]), firstUrl).hitRates[0].hit_rate, 0)
  assert.deepEqual([0, 12.5, 12.34, 100].map(formatHitRate), ['0%', '12.5%', '12.34%', '100%'])
  assert.ok(supportsHitRate('miniloto'))
  assert.ok(supportsHitRate('loto6'))
  assert.ok(supportsHitRate('loto7'))
  assert.equal(supportsHitRate('numbers3'), false)
  assert.equal(supportsHitRate('numbers4'), false)
})

test('rejects malformed records and pagination metadata', () => {
  for (const item of [
    rate({ lottery_type: 'numbers3' }), rate({ pattern: '' }), rate({ hit_rate: null }),
    rate({ hit_rate: '12.5' }), rate({ hit_rate: -1 }), rate({ hit_rate: 101 }), rate({ hit_rate: NaN }),
    rate({ prediction_count: -1 }), rate({ prediction_count: 1.5 }),
  ]) assert.throws(() => parseHitRatePage(page([item]), firstUrl))
  for (const payload of [null, {}, { data: null }, page([], { total: -1 }), page([], { limit: 0 }),
    page([], { offset: -1 }), page([], { next_url: 2 })]) {
    assert.throws(() => parseHitRatePage(payload, firstUrl))
  }
})

test('parses each lottery with only its supported match rates', () => {
  for (const [lottery_type, maxMatches] of [['miniloto', 5], ['loto6', 6], ['loto7', 7]]) {
    const expected = rate({ lottery_type })
    const parsed = parseHitRatePage(page([expected]), firstUrl).hitRates[0]
    assert.deepEqual(parsed, expected)
    assert.deepEqual(matchRateColumnsForLottery(lottery_type).map(({ count }) => count),
      Array.from({ length: maxMatches - 2 }, (_, i) => i + 3))
  }
})

test('rejects missing, null, non-numeric or out-of-range rates for applicable match counts', () => {
  for (const lottery_type of ['miniloto', 'loto6', 'loto7']) {
    for (const { field } of matchRateColumnsForLottery(lottery_type)) {
      for (const invalid of [undefined, null, '1.5', -1, 101, Infinity, NaN]) {
        assert.throws(() => parseHitRatePage(page([rate({ lottery_type, [field]: invalid })]), firstUrl))
      }
      assert.equal(parseHitRatePage(page([rate({ lottery_type, [field]: 0 })]), firstUrl).hitRates[0][field], 0)
    }
  }
})

test('normalizes unsupported match rates to null even if the API supplies a value', () => {
  const mini = parseHitRatePage(page([rate({ lottery_type: 'miniloto', match_6_rate: 1, match_7_rate: 2 })]), firstUrl).hitRates[0]
  assert.equal(mini.match_6_rate, null)
  assert.equal(mini.match_7_rate, null)
  const six = parseHitRatePage(page([rate({ match_7_rate: 3 })]), firstUrl).hitRates[0]
  assert.equal(six.match_7_rate, null)
})

test('rejects unsafe next page URLs before sending another request', async (t) => {
  for (const next of ['https://other.example/api/v1/lottery_hit_rates', '/lottery/api/v1/predictions',
    '/lottery/api/lottery_hit_rates', `${nextUrl}#fragment`]) {
    const calls = []
    t.mock.method(globalThis, 'fetch', async (url) => { calls.push(url); return json(page([rate()], { total: 2, next_url: next })) })
    await assert.rejects(loadAllHitRates(options()))
    assert.deepEqual(calls, [firstUrl])
  }
})

test('rejects cycles, including the same URL with reordered query parameters', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url)
    return json(page([rate()], { next_url: '/lottery/api/v1/lottery_hit_rates?offset=0&limit=100' }))
  })
  await assert.rejects(loadAllHitRates(options()))
  assert.deepEqual(calls, [firstUrl])
})

test('rejects incomplete and duplicate result sets', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json(page([rate()], { total: 2 })))
  await assert.rejects(loadAllHitRates(options()))
  t.mock.method(globalThis, 'fetch', async () => json(page([rate(), rate()])))
  await assert.rejects(loadAllHitRates(options()))
})

test('does not return partial rates when a later page fails', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => json(
    url === firstUrl ? page([rate()], { total: 2, next_url: nextUrl }) : {},
    url === firstUrl ? 200 : 500,
  ))
  await assert.rejects(loadAllHitRates(options()), (error) => error instanceof HttpError && error.status === 500)
})

test('404 and network failures reject independently of the predictions API', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => { calls.push(url); return json({}, 404) })
  await assert.rejects(loadAllHitRates(options()), (error) => error instanceof HttpError && error.status === 404)
  assert.deepEqual(calls, [firstUrl])
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch') })
  await assert.rejects(loadAllHitRates(options()), TypeError)
})

test('cancellation stops requests and discards responses from an aborted load', async (t) => {
  const controller = new AbortController()
  controller.abort()
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('No request expected') })
  await assert.rejects(loadAllHitRates({ baseUrl, signal: controller.signal }), { name: 'AbortError' })

  const active = new AbortController()
  t.mock.method(globalThis, 'fetch', async () => { active.abort(); return json(page([rate()])) })
  await assert.rejects(loadAllHitRates({ baseUrl, signal: active.signal }), { name: 'AbortError' })
})
