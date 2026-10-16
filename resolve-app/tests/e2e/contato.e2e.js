// Contato no chat: antes de combinar, o app avisa e o banco esconde; depois do aceite, aparece. Supabase real, contas temporárias.
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
const PW = fs.readFileSync(__dirname + '/.e2e_pw', 'utf8');

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

  const conv = (await rpc(cliS, 'open_conversation', { p_professional_id: proS.user.id })).id;
  const msg = await rpc(cliS, 'create_request', { p_conversation_id: conv, p_service_id: 'encanador', p_description: 'Torneira pingando', p_when: 'Hoje', p_address: { label: 'Casa', line: 'Avenida Paulista, 1000', area: 'Bela Vista', city: 'São Paulo' } });
  const prop = await (await req(proS, '/rest/v1/proposals', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ conversation_id: conv, request_id: msg.request_id, amount: 150, scheduled_label: 'Hoje, à tarde', note: 'me chama no 11 98765-4321' }) })).json();
  ok(prop[0]?.note === 'me chama no [contato oculto]', 'observação da proposta chega escondida');

  const NOTICE = 'vão escondidos até vocês combinarem';
  const field = 'Escreva uma mensagem';
  const cli = await device(cliS, 'cliente');
  await cli.page.goto(`${APP}/chat/${conv}`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText('Torneira pingando'), 'cliente abre o chat');

  console.log('\nAntes de combinar');
  await cli.type(field, 'Bom dia, pode ir hoje?');
  ok(!(await cli.text()).includes(NOTICE), 'mensagem comum: sem aviso');
  await cli.page.$eval(`input[aria-label="${field}"]`, (e) => e.select());
  await cli.type(field, 'meu zap é (11) 98765-4321');
  ok(await cli.waitText(NOTICE, 3000), 'com telefone: aviso aparece');
  await cli.page.screenshot({ path: SHOTS + 'contato-1-aviso.png' });
  await cli.press('Enviar');
  ok(await cli.waitText('meu zap é [contato oculto]'), 'cliente vê a mensagem com o contato escondido');
  ok(await cli.waitGone(NOTICE), 'campo limpo: aviso some');

  const pro = await device(proS, 'profissional');
  await pro.page.goto(`${APP}/chat/${conv}`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('meu zap é [contato oculto]'), 'profissional também vê escondido');
  ok(!(await pro.text()).includes('98765-4321'), 'o número não aparece para o profissional');

  console.log('\nDepois de combinar');
  const order = await rpc(cliS, 'accept_proposal', { p_proposal_id: prop[0].id });
  ok(!!order?.id, 'cliente aceita a proposta');
  await cli.page.reload({ waitUntil: 'networkidle0' });
  await cli.page.waitForSelector(`input[aria-label="${field}"]`);
  await cli.type(field, 'meu zap é (11) 98765-4321');
  await sleep(800);
  ok(!(await cli.text()).includes(NOTICE), 'com serviço combinado: sem aviso');
  await cli.press('Enviar');
  ok(await pro.waitText('meu zap é (11) 98765-4321'), 'profissional recebe o número');
  await cli.page.screenshot({ path: SHOTS + 'contato-2-combinado.png' });

  ok(errors.length === 0, 'sem erros nem alertas' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
