import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  daysAgo, formatBatchTime, formatLongDate, parseDateTime, parseLocalDate, staleNote,
} from '../src/lib/status.ts'

// Node re-reads process.env.TZ, so each zone can be verified in-process.
function withTimeZone(timeZone, fn) {
  const previous = process.env.TZ
  process.env.TZ = timeZone
  try {
    fn()
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
}

for (const timeZone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
  test(`parseLocalDate keeps 2026-09-28 on September 28 in ${timeZone}`, () => {
    withTimeZone(timeZone, () => {
      const date = parseLocalDate('2026-09-28')
      assert.equal(date.getFullYear(), 2026)
      assert.equal(date.getMonth(), 8)
      assert.equal(date.getDate(), 28)
      assert.equal(formatLongDate(date), '2026年9月28日（月）')
      // The naive alternative shifts to the previous day west of UTC.
      const naive = new Date('2026-09-28')
      assert.equal(formatLongDate(naive), timeZone === 'America/Los_Angeles' ? '2026年9月27日（日）' : '2026年9月28日（月）')
    })
  })
}

test('parseLocalDate rejects invalid values', () => {
  for (const value of ['2026/09/28', '2026-9-28', '2026-13-01', '2026-02-30', '', 'today']) {
    assert.equal(parseLocalDate(value), null, value)
  }
})

test('formatLongDate uses the ja-JP long style with a weekday', () => {
  assert.equal(formatLongDate(new Date(2026, 0, 1)), '2026年1月1日（木）')
  assert.equal(formatLongDate(new Date(2026, 11, 31)), '2026年12月31日（木）')
})

test('formatBatchTime shows month/day and 24-hour time for an offset ISO string', () => {
  const date = parseDateTime('2026-09-28T03:05:12+09:00')
  assert.equal(formatBatchTime(date, 'Asia/Tokyo'), '9月28日 03:05')
  assert.equal(formatBatchTime(date, 'UTC'), '9月27日 18:05')
  withTimeZone('Asia/Tokyo', () => assert.equal(formatBatchTime(date), '9月28日 03:05'))
  assert.equal(formatBatchTime(parseDateTime('2026-09-28T00:00:00+09:00'), 'Asia/Tokyo'), '9月28日 00:00')
})

test('parseDateTime returns null for empty or invalid values', () => {
  assert.equal(parseDateTime(''), null)
  assert.equal(parseDateTime('not a date'), null)
  assert.equal(parseDateTime('2026-09-28T03:05:12+09:00').toISOString(), '2026-09-27T18:05:12.000Z')
})

test('daysAgo counts calendar days regardless of the time of day', () => {
  const today = new Date(2026, 8, 30, 23, 59)
  assert.equal(daysAgo(new Date(2026, 8, 30, 0, 1), today), 0)
  assert.equal(daysAgo(new Date(2026, 8, 29, 23, 0), today), 1)
  assert.equal(daysAgo(new Date(2026, 8, 28), today), 2)
  assert.equal(daysAgo(new Date(2026, 9, 1), today), -1)
})

test('staleNote appears from 2 days old, not before', () => {
  const today = new Date(2026, 8, 30, 8, 0)
  assert.equal(staleNote(parseLocalDate('2026-09-30'), today), null)
  assert.equal(staleNote(parseLocalDate('2026-09-29'), today), null)
  assert.equal(staleNote(parseLocalDate('2026-09-28'), today), '2日前')
  assert.equal(staleNote(parseLocalDate('2026-09-01'), today), '29日前')
  assert.equal(staleNote(parseLocalDate('2026-10-05'), today), null)
})

test('staleNote boundary holds across a DST change', () => {
  withTimeZone('America/Los_Angeles', () => {
    // DST ends 2026-11-01 in Los Angeles; day arithmetic must still be exact.
    assert.equal(staleNote(parseLocalDate('2026-10-31'), new Date(2026, 10, 1, 9)), null)
    assert.equal(staleNote(parseLocalDate('2026-10-30'), new Date(2026, 10, 1, 9)), '2日前')
  })
})
