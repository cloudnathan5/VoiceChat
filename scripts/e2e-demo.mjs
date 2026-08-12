/**
 * End-to-end check for the static demo.
 *
 * Serves the built `demo/` directory alongside a fake OpenAI-compatible
 * endpoint, drives the page in a real browser, and asserts on both what the
 * user sees and what the model was actually sent. The second half is the
 * interesting one: the request body is where the duplicated-turn bug lived,
 * and it is invisible from the UI.
 *
 *   npm run build:demo && npm run test:e2e
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEMO_DIR = path.join(ROOT, 'demo')
const PORT = 4173

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
}

/** Reply the fake model streams back, split the way a real one would. */
const REPLY_TOKENS = [
  'The capital', ' of France', ' is Paris.', ' It has about',
  ' 2.1 million', ' residents.', ' Anything else', '?',
]

/** Every chat request the page made, captured for assertions. */
const received = []

/**
 * Poll until a condition holds. The second turn used to be given a flat 2.5s
 * and then asserted on, which failed roughly half the time on a loaded machine
 * — a red run that said nothing about the code.
 */
async function waitFor(predicate, description, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`timed out after ${timeout}ms waiting for ${description}`)
}

function serveApi(req, res, body) {
  if (req.url.startsWith('/v1/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ data: [{ id: 'fake-model' }, { id: 'other-model' }] }))
    return true
  }

  if (req.url.startsWith('/v1/chat/completions')) {
    received.push(JSON.parse(body))
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    })
    let i = 0
    const tick = setInterval(() => {
      if (i < REPLY_TOKENS.length) {
        const payload = { choices: [{ delta: { content: REPLY_TOKENS[i++] } }] }
        // Deliberately flush mid-line: this is exactly the boundary that used
        // to drop tokens.
        const frame = `data: ${JSON.stringify(payload)}\n\n`
        res.write(frame.slice(0, 12))
        res.write(frame.slice(12))
        return
      }
      clearInterval(tick)
      res.write('data: [DONE]\n\n')
      res.end()
    }, 15)
    return true
  }

  return false
}

async function serveStatic(req, res) {
  const urlPath = req.url.split('?')[0]
  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '')
  const filePath = path.join(DEMO_DIR, relative)

  if (!filePath.startsWith(DEMO_DIR) || !existsSync(filePath)) {
    res.writeHead(404).end('not found')
    return
  }

  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream',
  })
  res.end(await readFile(filePath))
}

function startServer() {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      if (!serveApi(req, res, body)) serveStatic(req, res)
    })
  })
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)))
}

async function main() {
  if (!existsSync(path.join(DEMO_DIR, 'index.html'))) {
    throw new Error('demo/index.html is missing — run `npm run build:demo` first')
  }

  const server = await startServer()
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox'],
  })

  const failures = []
  try {
    const page = await browser.newPage()

    const consoleErrors = []
    page.on('pageerror', (error) => consoleErrors.push(`uncaught: ${error.message}`))

    // Resource failures are tracked by URL rather than by console text, so
    // the sandbox's blocked Google Fonts request can be told apart from a
    // genuinely broken asset of our own.
    const badResources = []
    const isOurs = (url) => url.startsWith(`http://localhost:${PORT}`)
    page.on('requestfailed', (request) => {
      const error = request.failure()?.errorText || ''
      // Cancelling the response body once `[DONE]` arrives is deliberate — it
      // is the same path barge-in takes to stop a reply mid-sentence — and the
      // browser reports it as an aborted request.
      if (error === 'net::ERR_ABORTED' && request.url().includes('/chat/completions')) return
      if (isOurs(request.url())) badResources.push(`${request.url()} (${error})`)
    })
    page.on('response', (response) => {
      if (isOurs(response.url()) && response.status() >= 400) {
        badResources.push(`${response.url()} (HTTP ${response.status()})`)
      }
    })

    const origin = `http://localhost:${PORT}`

    // Seed the state the app would otherwise build through the settings UI.
    await page.addInitScript((base) => {
      localStorage.setItem(
        'vc_providers',
        JSON.stringify([{ id: 'p1', name: 'Fake', baseUrl: `${base}/v1`, apiKey: 'test-key' }]),
      )
      localStorage.setItem(
        'vc_threads',
        JSON.stringify([
          {
            id: 't1',
            title: 'E2E thread',
            selected_provider_id: 'p1',
            selected_model_id: 'fake-model',
          },
        ]),
      )
      localStorage.setItem('vc_messages', JSON.stringify({ t1: [] }))
      localStorage.setItem('lastUsedProviderId', 'p1')
      localStorage.setItem('lastUsedModelId', 'fake-model')
      localStorage.setItem('darkMode', 'true')
    }, origin)

    await page.goto(origin, { waitUntil: 'networkidle' })

    await page.getByText('E2E thread').first().click()

    const input = page.getByPlaceholder('Type your message...')
    await input.waitFor({ timeout: 5000 })
    await input.fill('What is the capital of France?')
    await input.press('Enter')

    // ── The reply renders, in full ──
    await page.waitForFunction(
      () => document.body.innerText.includes('Anything else?'),
      { timeout: 15000 },
    )
    const shown = await page.evaluate(() => document.body.innerText)
    assert.ok(
      shown.includes('The capital of France is Paris.'),
      'streamed reply should render without dropped tokens',
    )

    // ── The model received a sane conversation ──
    assert.equal(received.length, 1, `expected exactly one chat request, got ${received.length}`)
    const sent = received[0].messages
    const userTurns = sent.filter((m) => m.role === 'user')
    assert.equal(
      userTurns.length,
      1,
      `the question should be sent once, not ${userTurns.length} times: ${JSON.stringify(sent)}`,
    )
    assert.equal(userTurns[0].content, 'What is the capital of France?')
    assert.ok(
      !sent.some((m) => !m.content?.trim()),
      `no empty placeholder should be sent: ${JSON.stringify(sent)}`,
    )

    // ── A second turn carries the first as history, still without duplicates ──
    await input.fill('And Germany?')
    // The composer drops a send outright while a reply is still in flight, and
    // the reply's last token renders a beat before `[DONE]` clears that flag.
    // Waiting on the rendered text alone therefore typed into a composer that
    // was still busy, and the turn vanished. Wait for the send button to go
    // live — that is the same condition the send path checks.
    await page.waitForFunction(
      () => {
        const send = [...document.querySelectorAll('button')].find((b) => b.querySelector('svg.lucide-send'))
        return Boolean(send) && !send.disabled
      },
      { timeout: 15000 },
    )
    await input.press('Enter')

    await waitFor(() => received.length === 2, 'the second turn to reach the endpoint')

    assert.equal(received.length, 2, 'second turn should reach the endpoint')
    const second = received[1].messages
    assert.deepEqual(
      second.map((m) => m.role),
      ['user', 'assistant', 'user'],
      `second request should be Q/A/Q: ${JSON.stringify(second)}`,
    )
    assert.equal(second[2].content, 'And Germany?')

    assert.deepEqual(badResources, [], `broken assets: ${badResources.join(' | ')}`)
    assert.deepEqual(consoleErrors, [], `uncaught errors: ${consoleErrors.join(' | ')}`)

    console.log('e2e: demo loads, streams, and sends a clean conversation ✓')
  } catch (error) {
    failures.push(error)
  } finally {
    await browser.close()
    server.close()
  }

  if (failures.length > 0) {
    console.error(failures[0])
    process.exitCode = 1
  }
}

main()
