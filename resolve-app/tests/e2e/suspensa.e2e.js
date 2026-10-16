// Conta suspensa: aviso no início, em Mensagens, no chat (no lugar do campo) e no pedido novo; reativada, some. Supabase real, contas temporárias.
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
  const suspend = (until) => sql(`update public.profiles set suspended_until = ${until} where id = '${cliS.user.id}'`);

  const conv = (await rpc(cliS, 'open_conversation', { p_professional_id: proS.user.id })).id;
  await rpc(cliS, 'create_request', { p_conversation_id: conv, p_service_id: 'encanador', p_description: 'Torneira pingando', p_when: 'Hoje' });
  const NOTICE = 'Sua conta está suspensa';

  console.log('\nSuspensa por 3 dias');
  suspend("now() + interval '3 days'");
  const until = new Date(Date.now() + 3 * 86400000);
  const ddmm = `${String(until.getDate()).padStart(2, '0')}/${String(until.getMonth() + 1).padStart(2, '0')}`;
  const cli = await device(cliS, 'cliente');
  await cli.page.goto(`${APP}/inicio`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText(`${NOTICE} até ${ddmm}`), `início: aviso com a data (${ddmm})`);
  ok(await cli.waitText('Enquanto isso, você não faz pedidos'), 'explica o que vale');
  await cli.page.screenshot({ path: SHOTS + 'suspensa-1-inicio.png' });
  await cli.page.goto(`${APP}/mensagens`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText(NOTICE), 'Mensagens: aviso');
  await cli.page.goto(`${APP}/chat/${conv}`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText(NOTICE) && !(await cli.page.$('input[aria-label="Escreva uma mensagem"]')), 'chat: aviso no lugar do campo');
  await cli.page.screenshot({ path: SHOTS + 'suspensa-2-chat.png' });
  await cli.page.goto(`${APP}/pedido/novo?serviceId=encanador&proId=${proS.user.id}`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText(NOTICE) && !(await cli.text()).includes('PASSO 1 DE 3'), 'pedido novo: bloqueado com o aviso');
  await cli.pressText('Falar com a Rezolveaê');
  ok(await cli.waitPath(/^\/suporte$/), 'botão leva ao canal oficial');

  console.log('\nSem prazo');
  suspend("'infinity'");
  await cli.page.goto(`${APP}/inicio`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText(NOTICE) && !(await cli.text()).includes(`${NOTICE} até`), 'aviso sem data');

  console.log('\nPrazo vencido e reativada');
  suspend("now() - interval '1 minute'");
  await cli.page.reload({ waitUntil: 'networkidle0' });
  await cli.waitText('O que vamos resolver hoje?');
  ok(!(await cli.text()).includes(NOTICE), 'suspensão vencida: sem aviso');
  suspend('null');
  await cli.page.goto(`${APP}/chat/${conv}`, { waitUntil: 'networkidle0' });
  ok(!!(await cli.page.waitForSelector('input[aria-label="Escreva uma mensagem"]', { timeout: 15000 }).catch(() => null)), 'reativada: campo de mensagem de volta');

  ok(errors.length === 0, 'sem erros nem alertas' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
