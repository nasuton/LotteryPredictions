import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  daysAgo, formatBatchTime, formatLongDate, parseDateTime, parseLocalDate, staleNote, toJstDateOnly,
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

test('formatBatchTime always shows JST regardless of the viewer time zone', () => {
  const date = parseDateTime('2026-09-28T03:05:12+09:00')
  for (const timeZone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
    withTimeZone(timeZone, () => assert.equal(formatBatchTime(date), '9月28日 03:05', timeZone))
  }
  assert.equal(formatBatchTime(date, 'UTC'), '9月27日 18:05')
  assert.equal(formatBatchTime(parseDateTime('2026-09-28T00:00:00+09:00')), '9月28日 00:00')
  assert.equal(formatBatchTime(parseDateTime('2026-09-27T15:00:00Z')), '9月28日 00:00')
})

test('parseDateTime returns null for empty or invalid values', () => {
  assert.equal(parseDateTime(''), null)
  assert.equal(parseDateTime('not a date'), null)
  assert.equal(parseDateTime('2026-09-28T03:05:12+09:00').toISOString(), '2026-09-27T18:05:12.000Z')
})

test('toJstDateOnly uses the JST calendar date in every time zone', () => {
  // 2026-09-28T23:30 JST is still 2026-09-28 in Japan but 14:30Z the same day.
  const lateEvening = new Date('2026-09-28T23:30:00+09:00')
  // 2026-09-29T00:30 JST is 2026-09-28T15:30Z: UTC-based code would say the 28th.
  const justAfterMidnight = new Date('2026-09-29T00:30:00+09:00')
  for (const timeZone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
    withTimeZone(timeZone, () => {
      assert.equal(toJstDateOnly(lateEvening), '2026-09-28', timeZone)
      assert.equal(toJstDateOnly(justAfterMidnight), '2026-09-29', timeZone)
    })
  }
})

test('daysAgo counts JST calendar days regardless of the time of day', () => {
  const now = new Date('2026-09-30T23:59:00+09:00')
  assert.equal(daysAgo('2026-09-30', now), 0)
  assert.equal(daysAgo('2026-09-29', now), 1)
  assert.equal(daysAgo('2026-09-28', now), 2)
  assert.equal(daysAgo('2026-10-01', now), -1)
  assert.equal(daysAgo('2026/09/30', now), null)
  // Just after midnight JST: the previous JST day is 1 day ago even though UTC is still the 29th.
  assert.equal(daysAgo('2026-09-29', new Date('2026-09-30T00:10:00+09:00')), 1)
})

test('staleNote appears from 2 days old, not before', () => {
  const now = new Date('2026-09-30T08:00:00+09:00')
  assert.equal(staleNote('2026-09-30', now), null)
  assert.equal(staleNote('2026-09-29', now), null)
  assert.equal(staleNote('2026-09-28', now), '2日前')
  assert.equal(staleNote('2026-09-01', now), '29日前')
  assert.equal(staleNote('2026-10-05', now), null)
  assert.equal(staleNote('invalid', now), null)
})

test('staleNote boundary is the same in every viewer time zone', () => {
  // 2026-09-30T08:00 JST is 2026-09-29T16:00 Los Angeles: local-date logic would flag 09-28 as 1 day ago.
  const now = new Date('2026-09-30T08:00:00+09:00')
  for (const timeZone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
    withTimeZone(timeZone, () => {
      assert.equal(staleNote('2026-09-29', now), null, timeZone)
      assert.equal(staleNote('2026-09-28', now), '2日前', timeZone)
    })
  }
})
