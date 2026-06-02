import puppeteer from '/home/ubuntu/.npm/_npx/7d92d9a2d2ccc630/node_modules/puppeteer/lib/puppeteer/puppeteer.js';

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  const logs = [];

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[VoiceChat]') || text.includes('error') || text.includes('Error') || text.includes('FAIL')) {
      logs.push({ type: msg.type(), text });
      console.log(`[${msg.type()}] ${text}`);
    }
  });

  page.on('pageerror', err => {
    logs.push({ type: 'pageerror', text: err.message });
    console.log(`[PAGE ERROR] ${err.message}`);
  });

  await page.goto('https://cloudnathan5.github.io/VoiceChat/', { waitUntil: 'networkidle0', timeout: 30000 });
  console.log('\n--- Page loaded ---\n');
  await page.waitForTimeout(2000);

  const localStorageData = await page.evaluate(() => ({
    vc_providers: localStorage.getItem('vc_providers'),
    vc_threads: localStorage.getItem('vc_threads'),
    vc_messages: localStorage.getItem('vc_messages'),
  }));
  console.log('\n--- LocalStorage ---');
  console.log(JSON.stringify(localStorageData, null, 2));

  const newConvBtn = await page.$('button');
  if (newConvBtn) {
    await newConvBtn.click();
    await page.waitForTimeout(1000);
  }

  const providers = await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    return selects.map(s => ({
      id: s.id,
      value: s.value,
      options: Array.from(s.options).map(o => ({ value: o.value, text: o.text }))
    }));
  });
  console.log('\nSelects:', JSON.stringify(providers, null, 2));

  const providerList = await page.evaluate(() => JSON.parse(localStorage.getItem('vc_providers') || '[]'));
  console.log('\nProviders:', JSON.stringify(providerList, null, 2));

  const threads = await page.evaluate(() => JSON.parse(localStorage.getItem('vc_threads') || '[]'));
  console.log('\nThreads:', JSON.stringify(threads, null, 2));

  const messages = await page.evaluate(() => JSON.parse(localStorage.getItem('vc_messages') || '{}'));
  console.log('\nMessages:', JSON.stringify(messages, null, 2));

  console.log('\n--- Creating provider ---');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const addBtn = buttons.find(b => b.textContent.includes('Add') || b.textContent.includes('Provider'));
    if (addBtn) { addBtn.click(); return 'clicked'; }
    return 'no button';
  });
  await page.waitForTimeout(1000);

  const form = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    return { count: inputs.length, inputs: Array.from(inputs).map(i => ({ type: i.type, value: i.value })) };
  });
  console.log('Form:', JSON.stringify(form, null, 2));

  await page.waitForTimeout(2000);

  console.log('\n--- All VoiceChat logs ---');
  logs.forEach(l => console.log(`[${l.type}] ${l.text}`));

  await page.screenshot({ path: '/tmp/voicechat-debug.png', fullPage: true });
  console.log('\nScreenshot saved');

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
