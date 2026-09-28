import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CSV_HEADER, buildPredictionsCsv, escapeCsvField, predictionsCsvFileName } from '../src/lib/csv.ts'
import { parsePredictions, predictionsForLottery } from '../src/lib/predictions.ts'

const record = (id, lottery_type, numbers, pattern = '統合予測（桁別頻度×トレンド）') => ({
  id, lottery_type, pattern, predicted_at: '2026-09-15', numbers,
})
const payload = {
  data: [
    record(1, 'numbers3', ['0', '3', '3']),
    record(2, 'loto6', ['1', '12', '23', '34', '41', '43']),
    record(3, 'numbers3', ['0', '0', '7'], 'カンマ, 引用符"付き"'),
  ],
}

test('CSV contains only the selected lottery, with BOM, header and CRLF line endings', () => {
  const rows = predictionsForLottery(parsePredictions(payload), 'numbers3')
  const csv = buildPredictionsCsv(rows, 'ナンバーズ3')
  assert.ok(csv.startsWith('\uFEFF'), 'BOM')
  const lines = csv.slice(1).split('\r\n')
  assert.deepEqual(lines, [
    CSV_HEADER.join(','),
    'ナンバーズ3,統合予測（桁別頻度×トレンド）,0 3 3,2026-09-15',
    'ナンバーズ3,"カンマ, 引用符""付き""",0 0 7,2026-09-15',
    '',
  ])
  assert.ok(!csv.includes('\n,') && !csv.includes('ロト6'))
  assert.ok(!/[^\r]\n/.test(csv), 'no bare LF')
})

test('leading zeros and the number order are preserved as text', () => {
  const csv = buildPredictionsCsv([record(1, 'numbers4', ['0', '0', '1', '2'])], 'ナンバーズ4')
  assert.match(csv, /,0 0 1 2,/)
})

test('an empty selection yields only the header', () => {
  assert.equal(buildPredictionsCsv([], 'ロト7'), `\uFEFF${CSV_HEADER.join(',')}\r\n`)
})

test('escapeCsvField quotes only when needed', () => {
  assert.equal(escapeCsvField('plain'), 'plain')
  assert.equal(escapeCsvField('a,b'), '"a,b"')
  assert.equal(escapeCsvField('say "hi"'), '"say ""hi"""')
  assert.equal(escapeCsvField('line\nbreak'), '"line\nbreak"')
  assert.equal(escapeCsvField(''), '')
})

test('file name includes the lottery id and the local date', () => {
  assert.equal(predictionsCsvFileName('numbers3', new Date(2026, 8, 29, 8, 30)), 'predictions_numbers3_20260929.csv')
  assert.equal(predictionsCsvFileName('loto7', new Date(2026, 0, 5)), 'predictions_loto7_20260105.csv')
})
