// Manual UI check: npm run build && node tests/browser/hit-rates.browser.mjs
// Requires playwright-core and Edge. API responses are mocked locally.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright-core')
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  try {
    const file = path.join(dist, pathname === '/' ? 'index.html' : pathname)
    const content = await readFile(file)
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' })
    response.end(content)
  } catch {
    response.writeHead(404)
    response.end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ executablePath: process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true })
const predictions = ['numbers3', 'numbers4', 'miniloto', 'loto6', 'loto7'].flatMap((lottery_type, index) =>
  ['頻度分析 + スリープ分析', 'zero', 'missing', 'no-history'].map((pattern, i) => ({
    id: index * 10 + i, lottery_type, pattern, predicted_at: '2026-10-07',
    numbers: lottery_type.startsWith('numbers') ? ['0', '3', '3']
      : ['1', '5', '12', '23', '34', '41', '42'].slice(0, { miniloto: 5, loto6: 6, loto7: 7 }[lottery_type]),
  })))
const rates = ['miniloto', 'loto6', 'loto7'].flatMap((lottery_type, index) => [
  { lottery_type, pattern: '頻度分析 + スリープ分析', prediction_count: 120, hit_rate: [12.5, 23.45, 100][index],
    match_3_rate: [10, 20, 60][index], match_4_rate: [2, 2, 20][index], match_5_rate: [0.5, 0.45, 10][index],
    match_6_rate: [null, 1, 7][index], match_7_rate: [null, null, 3][index] },
  ...['zero', 'no-history'].map((pattern) => ({ lottery_type, pattern, prediction_count: pattern === 'zero' ? 80 : 0, hit_rate: 0,
    match_3_rate: 0, match_4_rate: 0, match_5_rate: 0,
    match_6_rate: lottery_type === 'miniloto' ? null : 0, match_7_rate: lottery_type === 'loto7' ? 0 : null })),
])
const payload = (data) => ({ data, total: data.length, limit: 100, offset: 0, next_url: null })
const fulfill = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*' } })
const results = []

try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, locale: 'ja-JP' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    let rateStatus = 200
    let rateData = rates
    let rateRequests = 0
    let releaseRates
    const ratesGate = new Promise((resolve) => { releaseRates = resolve })
    await page.route('https://nasuton.com/lottery/**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/health')) return fulfill(route, { status: 'ok' })
      if (url.pathname.endsWith('/predictions')) return fulfill(route, payload(predictions))
      if (url.pathname.endsWith('/lottery_hit_rates')) {
        rateRequests += 1
        await ratesGate
        return fulfill(route, payload(rateData), rateStatus)
      }
      return fulfill(route, {}, 404)
    })
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.locator('.api-status--success').waitFor()
    assert.equal(await page.getByRole('columnheader', { name: /ヒット率/ }).count(), 0)
    await page.getByRole('tab', { name: 'numbers4' }).click()
    assert.equal(await page.getByRole('columnheader', { name: /ヒット率/ }).count(), 0)

    await page.getByRole('tab', { name: 'loto6' }).click()
    const table = page.getByRole('table', { name: 'ロト6の予想一覧' })
    assert.equal(await table.getByText('取得中…', { exact: true }).count(), 4)
    releaseRates()
    await table.getByText('23.45%', { exact: true }).waitFor()
    const cell = (pattern) => table.locator('tbody tr').filter({ has: page.locator('td', { hasText: new RegExp(`^${pattern}$`) }) }).locator('td').last()
    assert.match(await cell('頻度分析 \\+ スリープ分析').innerText(), /3個以上一致\s+23\.45%\s+集計 120件/)
    assert.match(await cell('zero').innerText(), /^3個以上一致\s+0%\s+集計 80件/)
    assert.equal(await cell('zero').locator('dd', { hasText: /^0%$/ }).count(), 4)
    assert.equal(await cell('missing').innerText(), '未集計')
    assert.equal(await cell('no-history').innerText(), '未集計')
    await page.getByRole('tab', { name: 'miniloto' }).click()
    await page.getByRole('table', { name: 'ミニロトの予想一覧' }).getByText('12.5%', { exact: true }).waitFor()
    const breakdown = (name) => page.getByRole('table', { name }).locator('tbody tr').first().locator('.hit-rate-breakdown')
    assert.deepEqual(await breakdown('ミニロトの予想一覧').locator('dt').allTextContents(), ['3個一致', '4個一致', '5個一致'])
    assert.deepEqual(await breakdown('ミニロトの予想一覧').locator('dd').allTextContents(), ['10%', '2%', '0.5%'])
    await page.getByRole('tab', { name: 'loto6' }).click()
    assert.deepEqual(await breakdown('ロト6の予想一覧').locator('dt').allTextContents(), ['3個一致', '4個一致', '5個一致', '6個一致'])
    assert.deepEqual(await breakdown('ロト6の予想一覧').locator('dd').allTextContents(), ['20%', '2%', '0.45%', '1%'])
    await page.getByRole('tab', { name: 'loto7' }).click()
    await page.getByRole('table', { name: 'ロト7の予想一覧' }).getByText('100%', { exact: true }).waitFor()
    assert.deepEqual(await breakdown('ロト7の予想一覧').locator('dt').allTextContents(), ['3個一致', '4個一致', '5個一致', '6個一致', '7個一致'])
    assert.deepEqual(await breakdown('ロト7の予想一覧').locator('dd').allTextContents(), ['60%', '20%', '10%', '7%', '3%'])
    const metrics = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
    assert.ok(metrics.scroll <= metrics.width, `horizontal overflow: ${JSON.stringify(metrics)}`)
    if (process.env.SCREENSHOT_DIR) {
      await mkdir(process.env.SCREENSHOT_DIR, { recursive: true })
      await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `hit-rates-${viewport.width}.png`), fullPage: true })
    }

    // Reload uses a fresh page so failures are visible even when predictions succeed.
    rateStatus = 500
    await page.reload()
    await page.locator('.api-status--success').waitFor()
    await page.getByRole('tab', { name: 'loto6' }).click()
    await page.getByRole('alert').waitFor()
    assert.equal(await table.locator('tbody tr').count(), 4)
    assert.equal(await table.getByText('取得不可', { exact: true }).count(), 4)
    rateStatus = 200
    await page.getByRole('button', { name: 'ヒット率を再取得' }).click()
    await table.getByText('23.45%', { exact: true }).waitFor()
    assert.equal(await page.getByRole('alert').count(), 0)
    assert.equal(rateRequests, 3)

    rateData = []
    await page.reload()
    await page.locator('.api-status--success').waitFor()
    await page.getByRole('tab', { name: 'loto6' }).click()
    await table.getByText('未集計', { exact: true }).first().waitFor()
    assert.equal(await table.getByText('未集計', { exact: true }).count(), 4)
    assert.deepEqual(errors, [])
    results.push(`${viewport.width}px: loading, per-match rates (mini 3-5, loto6 3-6, loto7 3-7), zero, missing data, tab matching, failure, retry and empty response passed`)
    await context.close()
  }
  console.log(results.join('\n'))
} finally {
  await browser.close()
  server.close()
}
