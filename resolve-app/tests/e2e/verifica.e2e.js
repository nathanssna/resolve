// Selo Verificado: o profissional envia documento e selfie, a equipe aprova no banco, o app liga o selo e apaga as fotos. Supabase real, contas temporárias.
const fs = require('fs'); const { execSync } = require('child_process');
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
const PW = fs.readFileSync(__dirname + '/.e2e_pw', 'utf8');

const sql = (q) => JSON.parse(execSync(`npx supabase db query --linked ${JSON.stringify(q)}`, { cwd: require('path').resolve(__dirname, '../..'), encoding: 'utf8' })).rows;

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ok   ' : '  FALHA', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const login = async (email) => (await (await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW }) })).json());

(async () => {
  const cliS = await login('teste+cli@exemplo.invalid');
  const proS = await login('teste+pro@exemplo.invalid');
  const req = (s, path, init = {}) => fetch(`${URL_}${path}`, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${s.access_token}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  const api = (s, path, init) => req(s, path, init).then((r) => r.json());
  const rpc = (s, fn, args) => api(s, `/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const errors = [];
  const dialogs = [];
  const device = async (session, tag) => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 390, height: 844 });
    if (session) await page.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), `sb-${REF}-auth-token`, JSON.stringify(session));
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    // Avisos agora são do próprio app: qualquer caixa do navegador é erro.
    page.on('dialog', async (d) => { dialogs.push(d.message()); errors.push(`${tag} caixa do navegador: ${d.message()}`); await d.accept(); });
    const text = () => page.evaluate(() => document.body.innerText);
    const waitText = async (t, ms = 15000) => { try { await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: ms, polling: 300 }, t); return true; } catch { return false; } };
    const waitGone = async (t, ms = 10000) => { try { await page.waitForFunction((t) => !document.body.innerText.includes(t), { timeout: ms, polling: 300 }, t); return true; } catch { return false; } };
    const waitPath = async (re, ms = 15000) => { try { await page.waitForFunction((x) => new RegExp(x).test(location.pathname), { timeout: ms, polling: 300 }, re.source); return true; } catch { return false; } };
    const press = async (name, role = 'button') => { const el = await page.waitForSelector(`::-p-aria([name="${name}"][role="${role}"])`, { timeout: 10000 }); await el.focus(); await page.keyboard.press('Enter'); };
    const pressText = async (label) => {
      await page.waitForFunction((l) => [...document.querySelectorAll('[role="button"],[role="link"],a')].some((e) => e.innerText.trim() === l), { timeout: 10000, polling: 300 }, label);
      const el = await page.evaluateHandle((l) => [...document.querySelectorAll('[role="button"],[role="link"],a')].filter((e) => e.innerText.trim() === l).at(-1), label);
      await el.asElement().focus(); await page.keyboard.press('Enter');
    };
    const type = async (label, value) => {
      const el = await page.waitForSelector(`input[aria-label="${label}"], textarea[aria-label="${label}"]`, { timeout: 10000 });
      await el.focus(); await el.type(value, { delay: 5 });
    };
    return { page, text, waitText, waitGone, waitPath, press, pressText, type };
  };

  const proId = proS.user.id;
  // Imagem PNG simples (o app converte para JPEG antes de enviar).
  const png = (file, rgb) => {
    const zlib = require('zlib');
    const w = 64, h = 64, raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
    const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
    return file;
  };
  // Em shots/ (o Chrome de teste não lê arquivos ocultos).
  const docFile = png(SHOTS + 'verifica-documento.png', [200, 180, 40]);
  const selfieFile = png(SHOTS + 'verifica-selfie.png', [40, 120, 200]);
  const files = () => sql(`select count(*)::int as n from storage.objects where bucket_id = 'verification' and name like '${proId}/%'`)[0].n;
  const row = () => sql(`select status, files_deleted_at from public.verifications where professional_id = '${proId}' order by created_at desc limit 1`)[0];

  console.log('Pedir o selo (profissional)');
  const pro = await device(proS, 'profissional');
  await pro.page.goto(`${APP}/perfil`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('Selo Verificado') && await pro.waitText('Verificar identidade'), 'Perfil mostra "Selo Verificado · Verificar identidade"');
  await pro.page.evaluate(() => [...document.querySelectorAll('[role="button"]')].find((e) => e.innerText.includes('Selo Verificado'))?.click());
  ok(await pro.waitPath(/^\/profissional\/verificacao$/) && await pro.waitText('Documento com foto') && await pro.waitText('Selfie com o documento'), 'abre a tela com as duas fotos');
  // Primeiro "Galeria" é o do documento; depois que ele vira "Trocar", sobra o da selfie.
  const gallery = async (file) => {
    const [chooser] = await Promise.all([
      pro.page.waitForFileChooser({ timeout: 10000 }),
      pro.page.evaluate(() => [...document.querySelectorAll('[role="button"]')].find((e) => e.innerText.trim() === 'Galeria')?.click()),
    ]);
    await chooser.accept([file]);
    await sleep(1500);
  };
  await gallery(docFile);
  await gallery(selfieFile);
  ok(await pro.page.evaluate(() => [...document.querySelectorAll('[role="button"]')].filter((e) => e.innerText.trim() === 'Trocar').length) === 2, 'as duas fotos escolhidas');
  const send = () => pro.page.evaluate(() => [...document.querySelectorAll('[role="button"]')].filter((e) => e.innerText.trim() === 'Enviar para análise').at(-1)?.getAttribute('aria-disabled'));
  ok((await send()) === 'true', 'sem autorizar, não envia');
  await pro.pressText('Autorizo o uso das fotos só para confirmar minha identidade');
  await pro.page.screenshot({ path: SHOTS + 'verifica-1-fotos.png' });
  await pro.pressText('Enviar para análise');
  ok(await pro.waitText('Em análise') && await pro.waitText('Você recebe um aviso quando a análise terminar.'), 'mostra "Em análise"');
  ok(row()?.status === 'pending' && files() === 2, 'pedido pendente no banco, com as 2 fotos no bucket');

  console.log('\nAprovar (painel)');
  sql(`update public.verifications set status = 'approved' where professional_id = '${proId}' and status = 'pending'`);
  await pro.page.goto(`${APP}/profissional/verificacao`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('Perfil verificado'), 'tela mostra "Perfil verificado"');
  let cleaned = false;
  for (let i = 0; i < 20 && !cleaned; i++) { await sleep(500); cleaned = files() === 0 && !!row()?.files_deleted_at; }
  ok(cleaned, 'o app apagou as fotos do servidor e marcou files_deleted_at');
  await pro.page.screenshot({ path: SHOTS + 'verifica-2-ok.png' });

  console.log('\nO cliente vê o selo');
  const cli = await device(cliS, 'cliente');
  await cli.page.goto(`${APP}/profissional/${proId}`, { waitUntil: 'networkidle0' });
  ok(await cli.page.waitForSelector('[aria-label="Verificado"]', { timeout: 15000 }).then(() => true, () => false), 'perfil público com o selo Verificado');

  fs.rmSync(docFile, { force: true }); fs.rmSync(selfieFile, { force: true });
  ok(errors.length === 0, 'sem erros nem alertas' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
