// Manual browser check for the status panel. Not part of `npm test`.
//
//   npm run build
//   npm i --no-save playwright-core axe-core
//   node tests/browser/status-panel.browser.mjs
//
// All API calls are intercepted with page.route, so the result never depends on
// the live API. Set EDGE_PATH to override the browser executable and
// SCREENSHOT_DIR to keep screenshots.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const axeSource = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8')

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist')
const API_ROOT = 'https://nasuton.com/lottery'
const EDGE_PATH = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || ''

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  const file = path.join(distDir, pathname === '/' ? 'index.html' : pathname)
  try {
    const body = await readFile(file)
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' })
    response.end(body)
  } catch {
    response.writeHead(404)
    response.end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const siteUrl = `http://127.0.0.1:${server.address().port}/`

const toDateOnly = (date) => {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
const daysAgo = (days) => { const date = new Date(); date.setDate(date.getDate() - days); return date }
const today = toDateOnly(new Date())
const fiveDaysAgo = toDateOnly(daysAgo(5))
const oneDayAgo = toDateOnly(daysAgo(1))

const types = ['numbers3', 'numbers4', 'miniloto', 'loto6', 'loto7']
const predictions = types.flatMap((lottery_type, typeIndex) => Array.from({ length: 3 }, (_, i) => ({
  id: typeIndex * 10 + i, lottery_type, pattern: `予想パターン${i + 1}`, predicted_at: today,
  numbers: lottery_type.startsWith('numbers') ? ['0', '3', '3'] : ['1', '12', '23', '34', '41'],
})))
const predictionsPayload = { data: predictions, limit: 100, offset: 0, total: predictions.length, next_url: null }

const run = (lottery_type, status, finished_at = '2026-09-28T03:05:12+09:00') => ({
  batch_name: 'registration', lottery_type, status, started_at: '2026-09-28T03:05:00+09:00',
  finished_at, rows_affected: 43, message: status === 'failed' ? 'timeout' : '',
})
const statusPayload = ({ runs, numbers3Status = 'success' } = {}) => ({
  data: {
    predictions: {
      total: 305,
      by_type: [
        { lottery_type: 'numbers3', count: 120, latest_predicted_at: today },
        { lottery_type: 'numbers4', count: 98, latest_predicted_at: oneDayAgo },
        { lottery_type: 'loto6', count: 43, latest_predicted_at: fiveDaysAgo },
        { lottery_type: 'loto7', count: 44, latest_predicted_at: today },
      ],
    },
    last_batch_runs: runs === undefined
      ? [run('numbers3', numbers3Status), run('numbers4', 'skipped'), run('loto6', 'success'), run('loto7', 'success')]
      : runs,
    generated_at: new Date().toISOString(),
  },
})

const json = (body, status = 200) => ({
  status, contentType: 'application/json', body: JSON.stringify(body),
  headers: { 'Access-Control-Allow-Origin': '*', 'X-Request-ID': 'browser-test' },
})
const notFound = () => json({ error: { code: 'not_found', message: 'not found', request_id: 'x' } }, 404)

const browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true })
const results = []
let failures = 0

async function scenario(name, { status, health = json({ status: 'ok' }), legacyOnly = false, viewport = { width: 1280, height: 900 }, timezoneId = 'Asia/Tokyo' }, check) {
  const context = await browser.newContext({ viewport, locale: 'ja-JP', timezoneId })
  const page = await context.newPage()
  const consoleErrors = []
  const consoleInfos = []
  page.on('console', (message) => {
    // Browser-generated resource logs for intentionally mocked 4xx/5xx are not app errors.
    if (message.type() === 'error' && !/^Failed to load resource: the server responded with a status of/.test(message.text())) consoleErrors.push(message.text())
    if (message.type() === 'info') consoleInfos.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(String(error)))
  const requests = []
  let healthResponse = health
  let statusResponse = status
  await page.route(`${API_ROOT}/**`, async (route) => {
    const url = new URL(route.request().url())
    requests.push(url.pathname)
    if (url.pathname === '/lottery/health') return route.fulfill(healthResponse)
    if (url.pathname === '/lottery/api/v1/predictions' && !legacyOnly) return route.fulfill(json(predictionsPayload))
    if (url.pathname === '/lottery/api/predictions' && legacyOnly) return route.fulfill(json(predictionsPayload))
    if (url.pathname === '/lottery/api/v1/status' && !legacyOnly) return route.fulfill(statusResponse)
    return route.fulfill(notFound())
  })
  await page.goto(siteUrl)
  try {
    await check({
      page, requests, consoleInfos,
      setHealth: (value) => { healthResponse = value },
      setStatus: (value) => { statusResponse = value },
    })
    assert.deepEqual(consoleErrors, [], 'console errors')
    results.push(`✔ ${name}`)
  } catch (error) {
    failures += 1
    results.push(`✖ ${name}\n    ${String(error.stack || error).split('\n').slice(0, 30).join('\n    ')}`)
  } finally {
    if (SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name.replaceAll(/[^\w-]+/g, '_')}.png`), fullPage: true })
    }
    await context.close()
  }
}

const panel = (page) => page.locator('section.status-panel')
const item = (page, label) => panel(page).locator('.status-item', { has: page.locator('dt', { hasText: label }) }).locator('dd')

async function waitForLoaded(page) {
  await page.locator('.api-status--success').waitFor()
}

async function runAxe(page) {
  await page.addScriptTag({ content: axeSource })
  return page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    return result.violations.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map((node) => node.target.join(' ')) }))
  })
}

const todayLabel = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long', timeZone: 'Asia/Tokyo' }).format(new Date())

// A Los Angeles viewer must still see JST batch times and JST-based staleness.
await scenario('1 normal response shows the panel and follows the selected tab (viewer in Los Angeles, times in JST)', { status: json(statusPayload()), timezoneId: 'America/Los_Angeles' }, async ({ page, requests }) => {
  await waitForLoaded(page)
  await panel(page).waitFor()
  await page.getByRole('heading', { level: 2, name: '更新状況（ナンバーズ3）' }).waitFor()
  assert.match(await item(page, '予想更新日').innerText(), new RegExp(`^${todayLabel}（.）$`))
  assert.equal(await item(page, '予想更新日').locator('time').getAttribute('dateTime'), today)
  assert.equal(await item(page, '予想パターン数').innerText(), '120件')
  assert.equal((await item(page, '最終バッチ').innerText()).replace(/\s+/g, ' '), '成功 / 9月28日 03:05 （日本時間）')
  assert.equal(await item(page, '最終バッチ').locator('time').getAttribute('dateTime'), '2026-09-27T18:05:12.000Z')
  assert.equal(await panel(page).locator('.status-note').count(), 0)
  assert.equal(await panel(page).getAttribute('aria-live'), null)

  await page.getByRole('tab', { name: 'loto6' }).click()
  await page.getByRole('heading', { level: 2, name: '更新状況（ロト6）' }).waitFor()
  assert.match(await item(page, '予想更新日').innerText(), /（5日前）$/)
  assert.equal(await item(page, '予想パターン数').innerText(), '43件')

  await page.getByRole('tab', { name: 'numbers4' }).click()
  assert.doesNotMatch(await item(page, '予想更新日').innerText(), /日前/, '1 day old is not flagged')
  assert.equal(await item(page, '最終バッチ').locator('.batch-status').innerText(), 'スキップ')

  await page.getByRole('tab', { name: 'miniloto' }).click()
  assert.equal(await item(page, '予想更新日').innerText(), '未登録')
  assert.equal(await item(page, '予想パターン数').innerText(), '0件')
  assert.equal(await item(page, '最終バッチ').count(), 0)

  assert.ok(requests.includes('/lottery/api/v1/status'))
  assert.ok(requests.includes('/lottery/api/v1/predictions'))
  assert.ok(!requests.includes('/lottery/api/predictions'), 'no legacy call when v1 works')
})

await scenario('2 last_batch_runs null hides the batch row', { status: json(statusPayload({ runs: null })) }, async ({ page }) => {
  await waitForLoaded(page)
  await panel(page).waitFor()
  assert.equal(await item(page, '予想パターン数').innerText(), '120件')
  assert.equal(await item(page, '最終バッチ').count(), 0)
  assert.equal(await panel(page).locator('.status-note').count(), 0)
})

await scenario('3 status 404 hides the panel while predictions still render', { status: notFound() }, async ({ page }) => {
  await waitForLoaded(page)
  await page.getByRole('table', { name: 'ナンバーズ3の予想一覧' }).waitFor()
  assert.equal(await page.getByRole('table', { name: 'ナンバーズ3の予想一覧' }).locator('tbody tr').count(), 3)
  await page.waitForTimeout(300)
  assert.equal(await panel(page).count(), 0)
  assert.equal(await page.getByRole('alert').count(), 0)
})

await scenario('4 failed batch shows the fallback note', { status: json(statusPayload({ numbers3Status: 'failed' })) }, async ({ page }) => {
  await waitForLoaded(page)
  await panel(page).waitFor()
  assert.equal(await item(page, '最終バッチ').locator('.batch-status').innerText(), '失敗')
  assert.equal(await panel(page).locator('.status-note').innerText(), '表示中の予想は前回のものです。')
  await page.getByRole('tab', { name: 'loto6' }).click()
  assert.equal(await panel(page).locator('.status-note').count(), 0)
})

await scenario('5 axe WCAG 2.1 AA has no violations (desktop, incl. failed state)', { status: json(statusPayload({ numbers3Status: 'failed' })) }, async ({ page }) => {
  await waitForLoaded(page)
  await panel(page).waitFor()
  assert.deepEqual(await runAxe(page), [])
})

await scenario('6 retry reloads predictions and status together', {
  status: json({}, 500), health: json({ status: 'NG' }),
}, async ({ page, requests, setHealth, setStatus }) => {
  await page.getByRole('alert').waitFor()
  assert.equal(await panel(page).count(), 0)
  assert.equal(requests.filter((p) => p === '/lottery/api/v1/status').length, 1)
  setHealth(json({ status: 'ok' }))
  setStatus(json(statusPayload()))
  await page.getByRole('button', { name: '再試行' }).click()
  await waitForLoaded(page)
  await panel(page).waitFor()
  assert.equal(requests.filter((p) => p === '/lottery/api/v1/status').length, 2)
  assert.equal(await item(page, '予想パターン数').innerText(), '120件')
})

await scenario('7 mobile 390x844 keeps layout intact and passes axe', {
  status: json(statusPayload({ numbers3Status: 'failed' })), viewport: { width: 390, height: 844 },
}, async ({ page }) => {
  await waitForLoaded(page)
  await panel(page).waitFor()
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
    panel: document.querySelector('section.status-panel').getBoundingClientRect().toJSON(),
  }))
  assert.ok(metrics.scrollWidth <= metrics.innerWidth, `horizontal overflow: ${JSON.stringify(metrics)}`)
  assert.ok(metrics.panel.width <= 390 && metrics.panel.width >= 300, `panel width ${metrics.panel.width}`)
  await page.getByRole('tab', { name: 'loto6' }).click()
  assert.deepEqual(await runAxe(page), [])
})

await scenario('8 legacy API (v1 404) still loads predictions and logs one info line', {
  status: notFound(), legacyOnly: true,
}, async ({ page, requests, consoleInfos }) => {
  await waitForLoaded(page)
  assert.equal(await page.getByRole('table', { name: 'ナンバーズ3の予想一覧' }).locator('tbody tr').count(), 3)
  assert.equal(await panel(page).count(), 0)
  assert.deepEqual(
    requests.filter((p) => p.includes('/predictions')),
    ['/lottery/api/v1/predictions', '/lottery/api/predictions'],
  )
  assert.equal(consoleInfos.filter((text) => text.includes('/api/predictions')).length, 1)
})

await scenario('9 CSV download exports only the selected tab', { status: json(statusPayload()) }, async ({ page }) => {
  await waitForLoaded(page)
  // The button is hidden while loading and appears per visible tab only.
  assert.equal(await page.getByRole('button', { name: /CSVファイルでダウンロード/ }).count(), 1)
  await page.getByRole('tab', { name: 'loto6' }).click()
  const button = page.getByRole('button', { name: 'ロト6の予想をCSVファイルでダウンロード' })
  await button.waitFor()
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()])
  assert.match(download.suggestedFilename(), /^predictions_loto6_\d{8}\.csv$/)
  const csv = await readFile(await download.path(), 'utf8')
  const lines = csv.split('\r\n')
  assert.equal(lines[0], '\uFEFF宝くじ,予想パターン,予想数字,対象抽選日')
  assert.deepEqual(lines.slice(1, 4), [1, 2, 3].map((i) => `ロト6,予想パターン${i},1 12 23 34 41,${today}`))
  assert.equal(lines.length, 5, 'header + 3 rows + trailing newline')
  assert.ok(!csv.includes('ナンバーズ3'))
  assert.deepEqual(await runAxe(page), [])
})

await browser.close()
server.close()
console.log(results.join('\n'))
console.log(`\n${results.length - failures} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
