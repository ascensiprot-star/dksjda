import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"|"$/g, '')];
    })
);
const url = env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const email = 'huxaifa0fficial@gmail.com';

const linkResponse = await fetch(`${url}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'magiclink', email }),
});
const link = await linkResponse.json();
const tokenHash = link.hashed_token || link.properties?.hashed_token;
const verifyResponse = await fetch(`${url}/auth/v1/verify`, {
  method: 'POST',
  headers: { apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
});
const session = await verifyResponse.json();
if (!session.access_token) throw new Error('No session');

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome`,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

async function newPage(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript(([key, value]) => {
    localStorage.setItem(key, JSON.stringify(value));
    sessionStorage.setItem('zejesh_sec_unlocked_ts', Date.now().toString());
  }, ['zejesh-auth', session]);
  const page = await context.newPage();
  return { context, page };
}

const desktop = await newPage({ width: 1440, height: 1000 });
await desktop.page.goto('http://localhost:4321/admin', { waitUntil: 'domcontentloaded' });
await desktop.page.waitForTimeout(6500);
await desktop.page.screenshot({ path: '/tmp/opencode/qa-light-dashboard.png', fullPage: true });

const views = [
  ['atlas', 'System Atlas', 6500],
  ['products', 'Products & Archive', 2500],
  ['analytics', 'Analytics', 3000],
  ['control', 'Control Plane', 7000],
];
for (const [slug, label, wait] of views) {
  const button = desktop.page.getByRole('button', { name: label }).first();
  if (await button.count()) {
    await button.click();
    await desktop.page.waitForTimeout(wait);
    await desktop.page.screenshot({ path: `/tmp/opencode/qa-light-${slug}.png`, fullPage: slug === 'atlas' });
    console.log(`${slug}: captured`);
  }
}
await desktop.context.close();

const mobile = await newPage({ width: 390, height: 844 });
await mobile.page.goto('http://localhost:4321/admin', { waitUntil: 'domcontentloaded' });
await mobile.page.waitForTimeout(6500);
await mobile.page.screenshot({ path: '/tmp/opencode/qa-light-mobile.png', fullPage: true });
await mobile.context.close();

await browser.close();
