import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fetchStatus, FETCH_ERROR_MESSAGE, HttpError } from '../src/lib/api.ts'
import { batchRunForLottery, parseStatus, summaryForLottery } from '../src/lib/status.ts'

const root = 'https://example.test/lottery'
const statusUrl = `${root}/api/v1/status`
const options = () => ({ baseUrl: `${root}/`, signal: new AbortController().signal })
const json = (value, status = 200) => new Response(JSON.stringify(value), { status })

const run = (overrides = {}) => ({
  batch_name: 'registration', lottery_type: 'loto6', status: 'success',
  started_at: '2026-09-28T03:05:00+09:00', finished_at: '2026-09-28T03:05:12+09:00',
  rows_affected: 43, message: '', ...overrides,
})
const payload = {
  data: {
    predictions: {
      total: 305,
      by_type: [
        { lottery_type: 'loto6', count: 43, latest_predicted_at: '2026-09-28' },
        { lottery_type: 'numbers3', count: 120, latest_predicted_at: '2026-09-27' },
      ],
    },
    last_batch_runs: [
      run(),
      run({ batch_name: 'scraping', finished_at: '2026-09-28T03:04:00+09:00', rows_affected: 1 }),
      run({ lottery_type: 'numbers3', status: 'failed', message: 'timeout' }),
    ],
    generated_at: '2026-09-28T12:00:00+09:00',
  },
}

test('fetchStatus requests /api/v1/status and returns the parsed status', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push([url, init.cache]); return json(payload) })
  const status = await fetchStatus(options())
  assert.deepEqual(calls, [[statusUrl, 'no-store']])
  assert.equal(status.predictions.total, 305)
  assert.equal(status.predictions.by_type.length, 2)
  assert.equal(status.last_batch_runs.length, 3)
  assert.equal(status.generated_at, '2026-09-28T12:00:00+09:00')
  assert.deepEqual(summaryForLottery(status, 'loto6'), { lottery_type: 'loto6', count: 43, latest_predicted_at: '2026-09-28' })
  assert.equal(summaryForLottery(status, 'loto7'), null)
})

test('last_batch_runs null is accepted and yields no batch run', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json({ data: { ...payload.data, last_batch_runs: null } }))
  const status = await fetchStatus(options())
  assert.equal(status.last_batch_runs, null)
  assert.equal(batchRunForLottery(status, 'loto6'), null)
  assert.equal(summaryForLottery(status, 'loto6').count, 43)
})

test('empty by_type is accepted', () => {
  const status = parseStatus({ data: { ...payload.data, predictions: { total: 0, by_type: [] } } })
  assert.deepEqual(status.predictions.by_type, [])
  assert.equal(summaryForLottery(status, 'loto6'), null)
})

test('404 (legacy API) rejects with an HttpError so the panel can stay hidden', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json({ error: { code: 'not_found', message: '', request_id: 'r' } }, 404))
  await assert.rejects(fetchStatus(options()), (error) => {
    assert.ok(error instanceof HttpError)
    assert.equal(error.status, 404)
    assert.equal(error.message, FETCH_ERROR_MESSAGE)
    return true
  })
})

test('network errors are rejected', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch') })
  await assert.rejects(fetchStatus(options()), TypeError)
})

test('invalid payload shapes are rejected', async (t) => {
  for (const bad of [null, {}, { data: {} }, { data: { predictions: { total: 1 }, generated_at: 'x' } },
    { data: { predictions: { total: 1, by_type: [] }, last_batch_runs: 'no', generated_at: 'x' } }]) {
    assert.throws(() => parseStatus(bad), { message: 'Invalid status response' })
  }
  t.mock.method(globalThis, 'fetch', async () => json({ data: {} }))
  await assert.rejects(fetchStatus(options()), { message: 'Invalid status response' })
})

test('unknown lottery types and statuses are skipped, not fatal', () => {
  const status = parseStatus({
    data: {
      ...payload.data,
      predictions: { total: 2, by_type: [{ lottery_type: 'bingo5', count: 1, latest_predicted_at: '2026-09-28' }, payload.data.predictions.by_type[0]] },
      last_batch_runs: [run({ status: 'running' }), run({ lottery_type: 'bingo5' }), run()],
    },
  })
  assert.equal(status.predictions.by_type.length, 1)
  assert.equal(status.last_batch_runs.length, 1)
})

test('batchRunForLottery prefers registration, otherwise the latest run of the type', () => {
  const status = parseStatus(payload)
  assert.equal(batchRunForLottery(status, 'loto6').batch_name, 'registration')
  assert.equal(batchRunForLottery(status, 'numbers3').status, 'failed')
  assert.equal(batchRunForLottery(status, 'loto7'), null)

  const noRegistration = parseStatus({
    data: {
      ...payload.data,
      last_batch_runs: [
        run({ batch_name: 'scraping', finished_at: '2026-09-27T03:00:00+09:00' }),
        run({ batch_name: 'cleanup', finished_at: '2026-09-28T04:00:00+09:00', status: 'skipped' }),
      ],
    },
  })
  assert.equal(batchRunForLottery(noRegistration, 'loto6').batch_name, 'cleanup')
})
