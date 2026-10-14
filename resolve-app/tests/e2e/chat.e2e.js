// Chat: "Negociar" preenche o campo e "digitando…" com os três pontos animados. Supabase real, contas temporárias.
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

  // Conversa com pedido e proposta (pela API, como o app faz).
  const conv = (await rpc(cliS, 'open_conversation', { p_professional_id: proS.user.id })).id;
  const msg = await rpc(cliS, 'create_request', { p_conversation_id: conv, p_service_id: 'encanador', p_description: 'Torneira pingando', p_when: 'Hoje', p_address: { label: 'Casa', line: 'Avenida Paulista, 1000', area: 'Bela Vista', city: 'São Paulo' } });
  const prop = await req(proS, '/rest/v1/proposals', { method: 'POST', body: JSON.stringify({ conversation_id: conv, request_id: msg.request_id, amount: 150, scheduled_label: 'Hoje, à tarde' }) });
  ok(!!msg.request_id && prop.status < 300, 'pedido e proposta criados');

  console.log('\nNegociar');
  const cli = await device(cliS, 'cliente');
  await cli.page.goto(`${APP}/chat/${conv}`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText('Aceitar proposta'), 'cliente vê a proposta');
  const input = () => cli.page.evaluate(() => { const el = document.querySelector('input[aria-label="Escreva uma mensagem"]'); return { value: el?.value, focused: document.activeElement === el }; });
  ok((await input()).value === '', 'campo começa vazio');
  await cli.pressText('Negociar');
  await sleep(500);
  let st = await input();
  ok(st.value === 'Consigo fechar por R$ ' && st.focused, `Negociar preenche e foca o campo ("${st.value}", foco: ${st.focused})`);
  await cli.type('Escreva uma mensagem', '130');
  ok((await input()).value === 'Consigo fechar por R$ 130', 'dá para continuar digitando depois do preenchimento');
  await cli.page.screenshot({ path: SHOTS + 'chat-1-negociar.png' });
  await cli.page.evaluate(() => document.activeElement?.blur());
  await cli.pressText('Negociar');
  await sleep(500);
  st = await input();
  ok(st.value === 'Consigo fechar por R$ ' && st.focused, 'Negociar de novo preenche outra vez');

  console.log('\nDigitando');
  const pro = await device(proS, 'profissional');
  await pro.page.goto(`${APP}/chat/${conv}`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('Torneira pingando'), 'profissional abre a conversa');
  await sleep(1500);
  await pro.type('Escreva uma mensagem', 'Posso ir às 15h');
  const dots = await cli.page.waitForSelector('[aria-label="digitando"]', { timeout: 10000 }).then(() => true, () => false);
  ok(dots, 'cliente vê "digitando" enquanto o profissional escreve');
  const opacities = new Set();
  for (let i = 0; i < 8 && dots; i++) {
    const o = await cli.page.evaluate(() => [...document.querySelectorAll('[aria-label="digitando"] div div')].map((d) => getComputedStyle(d).opacity).join());
    if (o) opacities.add(o);
    await sleep(120);
  }
  ok(opacities.size > 1, `os três pontos animam (${opacities.size} quadros diferentes)`);
  await cli.page.screenshot({ path: SHOTS + 'chat-2-digitando.png' });

  ok(errors.length === 0, 'sem erros nem alertas' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
