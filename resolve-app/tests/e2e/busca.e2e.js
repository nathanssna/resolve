// Busca por frase (search_services), como visitante. Supabase real, sem contas.
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const APP = 'http://localhost:8099';
const SHOTS = __dirname + '/shots/';
fs.mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(
  fs.readFileSync(require('path').resolve(__dirname, '../../.env'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const REF = new URL(URL_).hostname.split('.')[0];

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ok   ' : '  FALHA', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const errors = [];
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', async (d) => { errors.push(`caixa do navegador: ${d.message()}`); await d.accept(); });
  const input = 'input[placeholder="Ex.: instalar um chuveiro"]';
  // Títulos dos resultados, em ordem (abaixo de "Resultados").
  const results = () => page.evaluate(() => {
    const t = document.body.innerText;
    const i = t.indexOf('Resultados');
    return i < 0 ? [] : t.slice(i + 'Resultados'.length).split('\n').map((l) => l.trim()).filter(Boolean);
  });
  const TITLES = ['Encanador', 'Eletricista', 'Suporte de informática', 'Montagem de móveis', 'Pintor', 'Limpeza', 'Ar-condicionado', 'Chaveiro'];
  const shown = async () => (await results()).filter((l) => TITLES.includes(l));
  const search = async (q) => {
    const el = await page.waitForSelector(input, { timeout: 15000 });
    await el.focus();
    await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    if (q) await el.type(q, { delay: 10 });
    await sleep(1500); // 250 ms de espera + resposta do banco
    return shown();
  };

  console.log('Busca por frase (visitante)');
  await page.goto(`${APP}/buscar`, { waitUntil: 'networkidle0' });
  ok(await page.waitForFunction(() => document.body.innerText.includes('Buscas comuns'), { timeout: 15000 }).then(() => true, () => false), 'abre com as buscas comuns');

  let r = await search('preciso instalar um chuveiro');
  ok(r.join() === 'Encanador,Eletricista', `"preciso instalar um chuveiro" → ${r}`);
  await page.screenshot({ path: SHOTS + 'busca-1-frase.png' });
  r = await search('meu notebook está muito lento');
  ok(r.join() === 'Suporte de informática', `"meu notebook está muito lento" → ${r}`);
  r = await search('fiquei trancado pra fora de casa');
  ok(r.join() === 'Chaveiro', `"fiquei trancado pra fora de casa" → ${r}`);
  r = await search('ar condicionado nao gela');
  ok(r[0] === 'Ar-condicionado', `sem acento: "ar condicionado nao gela" → ${r}`);
  r = await search('chuvero');
  ok(r.includes('Encanador'), `erro de digitação: "chuvero" → ${r}`);
  r = await search('chu');
  ok(r.includes('Encanador'), `começo curto ("chu") usa a busca local → ${r}`);
  r = await search('geladeria');
  ok(r.length === 0 && (await page.evaluate(() => document.body.innerText)).includes('Nada encontrado'), '"geladeria" → Nada encontrado');
  await page.screenshot({ path: SHOTS + 'busca-2-vazio.png' });

  r = await search('privada entupida');
  ok(r.join() === 'Encanador', `"privada entupida" → ${r}`);
  await page.evaluate(() => [...document.querySelectorAll('[role="button"]')].find((e) => e.innerText.includes('Encanador'))?.click());
  ok(await page.waitForFunction(() => location.pathname === '/servico/encanador', { timeout: 10000 }).then(() => true, () => false), 'tocar no resultado abre o serviço');

  console.log('\nSem internet');
  await page.goto(`${APP}/buscar`, { waitUntil: 'networkidle0' });
  await page.setRequestInterception(true);
  page.on('request', (rq) => (rq.url().includes('/rpc/search_services') ? rq.abort() : rq.continue()));
  r = await search('torneira');
  ok(r.includes('Encanador'), `banco fora do ar: busca local ("torneira") → ${r}`);
  r = await search('preciso instalar um chuveiro');
  ok(r.length === 0 && (await page.evaluate(() => document.body.innerText)).includes('Nada encontrado'), 'banco fora do ar: frase sem resultado local → Nada encontrado (sem travar)');

  ok(errors.length === 0, 'sem erros nem alertas' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
