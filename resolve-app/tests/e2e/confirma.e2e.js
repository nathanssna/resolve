// Confirmar o serviço no dia: cliente pelo botão, profissional pelo botão do lembrete (?acao=confirmar); "Preciso remarcar" abre a remarcação. Supabase real, contas temporárias.
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
  const { execSync } = require('child_process');
  const sql = (q) => execSync(`npx supabase db query --linked ${JSON.stringify(q)}`, { cwd: require('path').resolve(__dirname, '../..'), stdio: 'ignore' });

  // Serviço combinado para hoje às 23h (Brasília).
  const conv = (await rpc(cliS, 'open_conversation', { p_professional_id: proS.user.id })).id;
  const msg = await rpc(cliS, 'create_request', { p_conversation_id: conv, p_service_id: 'encanador', p_description: 'Torneira pingando', p_when: 'Hoje' });
  const prop = await (await req(proS, '/rest/v1/proposals', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ conversation_id: conv, request_id: msg.request_id, amount: 150, scheduled_label: 'Hoje, à noite' }) })).json();
  const order = await rpc(cliS, 'accept_proposal', { p_proposal_id: prop[0].id });
  sql(`update public.orders set scheduled_at = ((now() at time zone 'America/Sao_Paulo')::date + time '23:00') at time zone 'America/Sao_Paulo' where id = '${order.id}'`);

  console.log('\nCliente confirma');
  const cli = await device(cliS, 'cliente');
  await cli.page.goto(`${APP}/pedido/${order.id}`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText('Confirme o serviço de hoje') && await cli.waitText('Assim Pro sabe que está tudo certo'), 'pede a confirmação');
  await cli.page.screenshot({ path: SHOTS + 'confirma-1-cliente.png' });
  await cli.press('Confirmar');
  ok(await cli.waitText('Serviço de hoje confirmado') && await cli.waitText('Pro ainda não confirmou.'), 'confirmado; o outro ainda não');

  console.log('\nProfissional confirma pelo botão do lembrete');
  const pro = await device(proS, 'profissional');
  await pro.page.goto(`${APP}/pedido/${order.id}?acao=confirmar`, { waitUntil: 'networkidle0' });
  // Às 23h o período da noite (desde as 18h) já começou: para o profissional, a tela é a de "Serviço feito".
  ok(await pro.waitText('Cliente confirmou. Quando terminar, marque como feito.'), 'confirma ao abrir; vê que o cliente confirmou');
  await pro.page.goto(`${APP}/chat/${conv}`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('Cliente confirmou: hoje à noite.') && await pro.waitText('Pro confirmou: hoje à noite.'), 'os dois avisos no chat');
  ok(await cli.waitText('Pro também confirmou.'), 'cliente vê na hora (Realtime)');
  await cli.page.screenshot({ path: SHOTS + 'confirma-2-os-dois.png' });

  console.log('\nPreciso remarcar');
  await pro.page.goto(`${APP}/pedido/${order.id}?acao=remarcar`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('Escolha o novo dia e período'), 'abre a remarcação');

  ok(errors.length === 0, 'sem erros nem alertas' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
