// Pausar o recebimento de pedidos (painel do profissional) e o que o cliente vê. Supabase real, contas temporárias.
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

  const proId = proS.user.id;
  const paused = async () => (await api(proS, `/rest/v1/professionals?id=eq.${proId}&select=paused`))[0]?.paused;
  const until = async (fn, ms = 8000) => { for (const t = Date.now(); Date.now() - t < ms; await sleep(300)) if (await fn()) return true; return false; };
  const sw = (d) => d.page.evaluate(() => document.querySelector('[role="switch"][aria-label="Recebendo pedidos"]')?.getAttribute('aria-checked'));

  console.log('Pausar (profissional)');
  const pro = await device(proS, 'profissional');
  await pro.page.goto(`${APP}/inicio`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('Recebendo pedidos') && await pro.waitText('Encanador e Eletricista ·') && (await sw(pro)) === 'true', 'painel mostra "Recebendo pedidos" ligado');
  await pro.press('Recebendo pedidos', 'switch');
  ok(await pro.waitText('Pausar os pedidos?'), 'pede confirmação para pausar');
  await pro.pressText('Pausar');
  ok(await until(async () => (await paused()) === true), 'gravado no banco');
  ok(await pro.waitText('Pedidos pausados') && await pro.waitText('Você não aparece nas buscas') && (await sw(pro)) === 'false', 'painel mostra pausado');
  await pro.page.screenshot({ path: SHOTS + 'pause-1-painel.png' });

  console.log('\nO cliente');
  const cli = await device(cliS, 'cliente');
  await cli.page.goto(`${APP}/profissionais/encanador`, { waitUntil: 'networkidle0' });
  // O banco de produção não tem outros profissionais: espera a lista carregar e confere que ele não está.
  await cli.waitText('Encanador'); await sleep(2000);
  ok(!(await cli.text()).includes('Pro Teste'), 'some da lista do serviço');
  await cli.page.goto(`${APP}/profissional/${proId}`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText('Não está recebendo pedidos agora') && !(await cli.text()).includes('Pedir orçamento a Pro'), 'perfil: botão "Não está recebendo pedidos agora" no lugar do pedido');
  const disabled = await cli.page.evaluate(() => [...document.querySelectorAll('[role="button"]')].find((e) => e.innerText.includes('Não está recebendo pedidos agora'))?.getAttribute('aria-disabled'));
  ok(disabled === 'true', 'botão desabilitado');
  await cli.page.screenshot({ path: SHOTS + 'pause-2-perfil.png' });
  await cli.page.goto(`${APP}/pedido/novo?serviceId=encanador&proId=${proId}`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText('Pro não está recebendo pedidos agora') && await cli.waitText('Escolha outro profissional'), 'pedido direto (ex.: "Novo pedido" no chat) avisa que pausou');
  const conv = await rpc(cliS, 'open_conversation', { p_professional_id: proId });
  ok(conv.message === 'Este profissional não está recebendo pedidos no momento', `API também recusa: ${conv.message ?? conv.id}`);

  console.log('\nDe volta');
  await pro.page.bringToFront();
  await pro.press('Recebendo pedidos', 'switch');
  ok(await until(async () => (await paused()) === false), 'religar não pede confirmação e grava');
  ok(await pro.waitText('Encanador e Eletricista ·'), 'painel volta ao normal');
  await cli.page.bringToFront();
  await cli.page.goto(`${APP}/profissionais/encanador`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText('Pro Teste'), 'volta para a lista');

  ok(errors.length === 0, 'sem erros nem alertas' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
