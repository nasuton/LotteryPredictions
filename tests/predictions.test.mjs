import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lotteries, parsePredictions, predictionsForLottery } from '../src/lib/predictions.ts'

const example = {
  id: 1244, lottery_type: 'numbers3',
  pattern: '統合予測（桁別頻度×トレンド×連続性×履歴重み）',
  predicted_at: '2026-09-15', numbers: ['0', '3', '3'], numbers_raw: '0,3,3',
}

test('parses the supplied response structure without losing zeros or repeated digits', () => {
  const result = parsePredictions({ data: [example], total: 1, limit: 50, offset: 0 })
  assert.deepEqual(result[0].numbers, ['0', '3', '3'])
  assert.equal(result[0].pattern, example.pattern)
  assert.equal(result[0].predicted_at, '2026-09-15')
})

test('each tab receives only its lottery type in response order', () => {
  const input = lotteries.map((lottery, index) => ({ ...example, id: index, lottery_type: lottery.id }))
  const predictions = parsePredictions({ data: input })
  for (const lottery of lotteries) {
    const rows = predictionsForLottery(predictions, lottery.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].lottery_type, lottery.id)
  }
})

test('empty data and missing lottery types are valid empty results', () => {
  assert.deepEqual(parsePredictions({ data: [] }), [])
  assert.deepEqual(predictionsForLottery(parsePredictions({ data: [example] }), 'loto7'), [])
})

for (const input of [null, {}, { data: null }, { data: [{}] },
  { data: [{ ...example, numbers: null }] },
  { data: [{ ...example, numbers: [0, 3, 3] }] },
  { data: [{ ...example, predicted_at: null }] },
]) {
  test(`malformed response is rejected: ${JSON.stringify(input)}`, () => {
    assert.throws(() => parsePredictions(input))
  })
}
