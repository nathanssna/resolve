// Profissional avalia o cliente: estrelas no serviço concluído; o cliente vê só a média no Perfil (a partir de 3). Supabase real, contas temporárias.
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

  // Serviço concluído (pela API até o aceite; a conclusão direto no banco).
  const conv = (await rpc(cliS, 'open_conversation', { p_professional_id: proS.user.id })).id;
  const msg = await rpc(cliS, 'create_request', { p_conversation_id: conv, p_service_id: 'encanador', p_description: 'Torneira pingando', p_when: 'Hoje' });
  const prop = await (await req(proS, '/rest/v1/proposals', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ conversation_id: conv, request_id: msg.request_id, amount: 150, scheduled_label: 'Hoje, à tarde' }) })).json();
  const order = await rpc(cliS, 'accept_proposal', { p_proposal_id: prop[0].id });
  sql(`update public.orders set status = 'concluido', completed_at = now() where id = '${order.id}'`);

  console.log('\nProfissional avalia');
  const pro = await device(proS, 'profissional');
  await pro.page.goto(`${APP}/pedido/${order.id}`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('Como foi atender Cliente?'), 'serviço concluído pede a nota do cliente');
  ok(await pro.waitText('Cliente não vê a sua nota: só a média de todas, depois de 3 avaliações.'), 'explica que o cliente vê só a média');
  await pro.press('4 estrelas');
  await pro.page.screenshot({ path: SHOTS + 'notacliente-1-avaliar.png', fullPage: true });
  await pro.press('Enviar avaliação');
  ok(await pro.waitText('Avaliação enviada'), 'enviada');
  const given = await api(proS, `/rest/v1/client_reviews?order_id=eq.${order.id}&select=rating`);
  ok(given[0]?.rating === 4, 'banco: 4 estrelas');
  ok((await api(cliS, `/rest/v1/client_reviews?select=rating`)).length === 0, 'o cliente não lê a nota pela API');
  await pro.page.reload({ waitUntil: 'networkidle0' });
  ok(await pro.waitText('Avaliação enviada') && !(await pro.text()).includes('Enviar avaliação'), 'depois de recarregar, continua avaliado');

  console.log('\nCliente');
  const cli = await device(cliS, 'cliente');
  await cli.page.goto(`${APP}/perfil`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText('Sua nota como cliente') && await cli.waitText('Aparece depois de 3 avaliações'), 'Perfil: com 1 avaliação, sem média');
  ok(!(await cli.text()).includes('4,0'), 'a nota 4 não aparece');
  await cli.page.goto(`${APP}/pedido/${order.id}`, { waitUntil: 'networkidle0' });
  await cli.waitText('Como foi o serviço de Pro?');
  ok(!(await cli.text()).includes('Como foi atender'), 'o cliente não vê o bloco do profissional');

  ok(errors.length === 0, 'sem erros nem alertas' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
