const puppeteer = require('puppeteer');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function poll(fn, timeout, interval = 500) {
  const start = Date.now();
  return new Promise(async (resolve, reject) => {
    while (Date.now() - start < timeout) {
      const result = await fn();
      if (result) return resolve(result);
      await sleep(interval);
    }
    return reject(new Error(`Poll timed out after ${timeout}ms`));
  });
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--ignore-certificate-errors', '--ignore-ssl-errors']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  let lastAccumulated = '';
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('accumulated_len=')) {
      const match = text.match(/accumulated_len=(\d+)/);
      if (match) {
        const len = parseInt(match[1]);
        if (len > 100) {
          const preview = text.match(/accumulated_preview=(.*)/s);
          if (preview) {
            lastAccumulated = preview[1].substring(0, 2000);
          }
        }
      }
    }
  });

  // Create thread with provider and model
  const providersResp = await fetch('http://localhost:4001/api/providers');
  const providers = await providersResp.json();
  const hpc = providers.find(p => p.name === 'hpc');

  const threadResp = await fetch('http://localhost:4001/api/threads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Web Search E2E Test',
      providerId: hpc.id,
      selectedProviderId: hpc.id,
      selectedModelId: 'Qwen-3.6-Opus'
    })
  });
  const thread = await threadResp.json();
  console.log('Thread:', thread.id);

  // Load page
  await page.goto('https://10.50.0.1:3001/', { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(5000);

  // Click thread
  const threads = await page.$$('.truncate.text-sm');
  if (threads.length > 0) await threads[0].click();
  await sleep(2000);

  // Type message
  const textarea = await page.$('textarea');
  await textarea.click();
  await textarea.type('breaking news today 2026', { delay: 50 });
  await sleep(500);

  // Click send
  const buttons = await page.$$('.flex.items-end.space-x-3 button');
  if (buttons.length > 0) await buttons[buttons.length - 1].click();

  // Poll for AI response
  console.log('Waiting for AI response...');
  const aiResponse = await poll(async () => {
    if (lastAccumulated) return lastAccumulated;
    return null;
  }, 120000);

  console.log('\n=== AI Response ===');
  console.log(aiResponse);
  console.log('==================\n');

  // Check if response contains real facts from search results
  const hasFacts = aiResponse.includes('Yardeni') ||
                   aiResponse.includes('S&P') ||
                   aiResponse.includes('Trump') ||
                   aiResponse.includes('Iran') ||
                   aiResponse.includes('Ebola') ||
                   aiResponse.includes('gaza') ||
                   aiResponse.includes('World Cup') ||
                   aiResponse.includes('Knicks') ||
                   aiResponse.includes('NBA') ||
                   aiResponse.includes('Spirit Airlines') ||
                   aiResponse.includes('Scripps') ||
                   aiResponse.includes('Spelling Bee');

  console.log('Response contains real facts:', hasFacts);

  if (!hasFacts) {
    console.log('FAIL: Model did not use search results');
  } else {
    console.log('PASS: Model used search results');
  }

  await browser.close();
  console.log('Done');
})();
