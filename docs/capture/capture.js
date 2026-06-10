// Drive the system Chrome (headless, fake camera) over the LOCAL capture stack,
// seed dummy data, and screenshot the main screens of every parcours.
// Output: docs/captures/*.png
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8985';
const API = BASE + '/api';
const OUT = path.resolve(__dirname, '..', 'captures');
fs.mkdirSync(OUT, { recursive: true });

const CHROME = '/usr/bin/google-chrome';
// A tiny solid-colour PNG (data URL) used as a stand-in selfie / CNI photo.
const DUMMY_IMG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqGf4DwACxgGAVHJpQAAAAABJRU5ErkJggg==';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[cap]', ...a);

async function api(method, url, body) {
  const r = await fetch(API + url, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  try { return { ok: r.ok, status: r.status, data: t ? JSON.parse(t) : null }; }
  catch { return { ok: r.ok, status: r.status, data: t }; }
}

async function waitApp() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(API + '/config'); if (r.ok) return true; } catch {}
    await sleep(2000);
  }
  throw new Error('app not ready');
}

async function seed() {
  log('seeding dummy data…');
  const img = await api('POST', '/kyc/image', { image: DUMMY_IMG, kind: 'selfie' });
  const key = img.data && img.data.key ? img.data.key : null;
  log('image key', key);
  const mk = (prenom, nom, cni, phone, pay, ville) => ({
    prenom, nom, sexe: 'M', cni, niu: null, cniExp: '01/01/2031', phone,
    email: (prenom + '.' + nom).toLowerCase().replace(/\s/g, '') + '@exemple.cm',
    quartier: 'Bonamoussadi', ville, pay, payPhone: phone, delivery: 'promote',
    selfie: !!key, selfieKey: key, cniRectoKey: key, cniVersoKey: key,
  });
  const rows = [
    ['Yvan', 'NGAMENI', '1A2B3C4D', '+237690111222', 'om', 'Douala', 'validate', null],
    ['Sandrine', 'ETO', '5E6F7A8B', '+237670333444', 'mtn', 'Yaoundé', 'validate', null],
    ['Paul', 'MBARGA', '9C0D1E2F', '+237690555666', 'om', 'Douala', 'fail', 'Solde insuffisant'],
    ['Aicha', 'MBALLA', '3A4B5C6D', '+237680777888', 'mtn', 'Bafoussam', 'validate', null],
    ['Brice', 'TALLA', '7E8F9A0B', '+237690999000', 'om', 'Douala', 'fail', 'Le client a refusé'],
  ];
  const refs = {};
  for (const [p, n, cni, ph, pay, ville, outcome, reason] of rows) {
    const c = await api('POST', '/subscriptions/self', mk(p, n, cni, ph, pay, ville));
    if (!c.ok) { log('create failed', p, c.status, c.data); continue; }
    const ref = c.data.ref;
    refs[p] = ref;
    await api('PATCH', `/subscriptions/${ref}/pay`, { outcome, reason });
    log('created', ref, p, outcome);
  }
  return refs;
}

async function login(page, email, pw) {
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type=email]', { timeout: 15000 });
  await page.type('input[type=email]', email, { delay: 8 });
  await page.type('input[autocomplete="current-password"]', pw, { delay: 8 });
  await Promise.all([
    page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 15000 }).catch(() => {}),
    page.click('.btn-primary'),
  ]);
  await sleep(1500);
}

async function shot(page, name) {
  await sleep(900);
  const f = path.join(OUT, name + '.png');
  await page.screenshot({ path: f });
  log('shot', name);
}

(async () => {
  await waitApp();
  const refs = await seed();
  await sleep(1500);

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage',
           '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
           '--hide-scrollbars', '--force-device-scale-factor=2'],
  });
  const page = await browser.newPage();

  const phone = { width: 460, height: 940, deviceScaleFactor: 2 };
  const desk = { width: 1440, height: 950, deviceScaleFactor: 1.5 };

  const safe = async (label, fn) => { try { await fn(); } catch (e) { log('SKIP', label, e.message); } };

  // ---- login page ----
  await safe('login', async () => {
    await page.setViewport(phone);
    await page.evaluate(() => { try { localStorage.clear(); } catch {} });
    await page.goto(BASE + '/login', { waitUntil: 'networkidle2' });
    await shot(page, '01-connexion');
  });

  // ---- client welcome + identity ----
  await safe('client-welcome', async () => {
    await page.setViewport(phone);
    await page.goto(BASE + '/client', { waitUntil: 'networkidle2' });
    await sleep(1200);
    await shot(page, '02-client-accueil');
  });
  await safe('client-identity', async () => {
    // click the "Commencer" primary button on the welcome screen
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /commencer|start/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(1400);
    await shot(page, '03-client-identite');
  });

  // ---- admin ----
  await safe('admin', async () => {
    await page.setViewport(desk);
    await login(page, 'admin@afrilandfirstbank.com', 'promote');
    await page.goto(BASE + '/admin', { waitUntil: 'networkidle2' });
    await sleep(1600);
    await shot(page, '04-admin-vue-ensemble');
    const click = async (label) => page.evaluate((t) => {
      const b = [...document.querySelectorAll('.admin-nav button, button')].find((x) => (x.textContent || '').trim().includes(t));
      if (b) b.click();
    }, label);
    await click('Configuration'); await sleep(1200); await shot(page, '05-admin-config');
    await click('Utilisateurs'); await sleep(1200); await shot(page, '06-admin-utilisateurs');
    await click('Historique'); await sleep(1600); await shot(page, '07-admin-transactions');
  });

  // ---- agent ----
  await safe('agent', async () => {
    await page.setViewport(desk);
    await login(page, 'awa.fall@afrilandfirstbank.com', 'promote');
    await page.goto(BASE + '/agent', { waitUntil: 'networkidle2' });
    await sleep(1600);
    await shot(page, '08-conseiller-accueil');
  });

  // ---- print point ----
  await safe('print', async () => {
    await page.setViewport(phone);
    await login(page, 'imprimeur.promote@afrilandfirstbank.com', 'promote');
    await page.goto(BASE + '/print', { waitUntil: 'networkidle2' });
    await sleep(1200);
    const ref = refs['Yvan'];
    if (ref) {
      await page.type('input', ref, { delay: 10 }).catch(() => {});
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => /rechercher|search/i.test(x.textContent || '')) || document.querySelector('.btn-primary');
        if (b) b.click();
      });
      await sleep(1600);
    }
    await shot(page, '09-imprimeur-recherche');
    // open the first result if present
    await page.evaluate(() => { const b = document.querySelector('.card button'); if (b) b.click(); });
    await sleep(1600);
    await shot(page, '10-imprimeur-fiche');
  });

  await browser.close();
  log('done. files in', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
