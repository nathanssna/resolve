// Cancelamento em cima da hora: prazo de 12 h, motivo, histórico do cliente, pausa automática e taxa no perfil. Supabase real, contas temporárias.
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
  const at = (hours) => new Date(Date.now() + hours * 3600e3).toISOString();
  // Serviço combinado pela API (pedido → proposta com data → aceite).
  const deal = async (hours) => {
    const conv = (await rpc(cliS, 'open_conversation', { p_professional_id: proId })).id;
    const msg = await rpc(cliS, 'create_request', { p_conversation_id: conv, p_service_id: 'encanador', p_description: 'Torneira pingando', p_when: 'Hoje', p_address: { label: 'Casa', line: 'Avenida Paulista, 1000', area: 'Bela Vista', city: 'São Paulo' } });
    const prop = await (await req(proS, '/rest/v1/proposals', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ conversation_id: conv, request_id: msg.request_id, amount: 150, scheduled_label: 'Hoje, tarde', scheduled_at: at(hours) }) })).json();
    const order = await rpc(cliS, 'accept_proposal', { p_proposal_id: prop[0].id });
    return { conv, order: order.id };
  };
  const orderRow = async (id) => (await api(cliS, `/rest/v1/orders?id=eq.${id}&select=status,canceled_late,cancel_reason`))[0];

  console.log('Pedido de cliente novo (profissional)');
  const conv = (await rpc(cliS, 'open_conversation', { p_professional_id: proId })).id;
  await rpc(cliS, 'create_request', { p_conversation_id: conv, p_service_id: 'encanador', p_description: 'Chuveiro queimado', p_when: 'Hoje', p_address: { label: 'Casa', line: 'Avenida Paulista, 1000', area: 'Bela Vista', city: 'São Paulo' } });
  const pro = await device(proS, 'profissional');
  await pro.page.goto(`${APP}/chat/${conv}`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('Sem telefone · cliente novo na Rezolveaê'), 'pedido mostra "Sem telefone · cliente novo na Rezolveaê"');

  console.log('\nNo prazo (faltam 30 h)');
  const d1 = await deal(30);
  const cli = await device(cliS, 'cliente');
  await cli.page.goto(`${APP}/pedido/${d1.order}`, { waitUntil: 'networkidle0' });
  await cli.pressText('Cancelar serviço');
  ok(await cli.waitText('Cancelar este serviço? Avise o profissional pelo chat.'), 'só pede confirmação');
  await cli.pressText('Cancelar');
  ok(await (async () => { for (let i = 0; i < 20; i++) { const r = await orderRow(d1.order); if (r?.status === 'cancelado') return r.canceled_late === false; await sleep(400); } return false; })(), 'cancelado, sem contar como em cima da hora');

  console.log('\nEm cima da hora (faltam 3 h)');
  const d2 = await deal(3);
  await cli.page.goto(`${APP}/pedido/${d2.order}`, { waitUntil: 'networkidle0' });
  await cli.pressText('Cancelar serviço');
  ok(await cli.waitPath(/^\/pedido\/cancelar$/) && await cli.waitText('Falta menos de 12 horas') && await cli.waitText('os profissionais veem isso'), 'abre a tela do motivo, explicando a consequência');
  const disabled = () => cli.page.evaluate(() => [...document.querySelectorAll('[role="button"]')].filter((e) => e.innerText.trim() === 'Cancelar serviço').at(-1)?.getAttribute('aria-disabled'));
  ok((await disabled()) === 'true', 'sem motivo, o botão fica desabilitado');
  await cli.pressText('Imprevisto');
  await cli.type('Conte mais (opcional)', 'Tive uma emergência no trabalho');
  await cli.page.screenshot({ path: SHOTS + 'cancela-1-motivo.png' });
  await cli.pressText('Cancelar serviço');
  ok(await cli.waitText('Serviço cancelado.'), 'aviso do app');
  const r2 = await orderRow(d2.order);
  ok(r2?.status === 'cancelado' && r2.canceled_late === true && r2.cancel_reason === 'Imprevisto: Tive uma emergência no trabalho', `gravado em cima da hora, com o motivo (${r2?.cancel_reason})`);
  await pro.page.goto(`${APP}/chat/${d2.conv}`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('Serviço cancelado em cima da hora pelo cliente: Imprevisto: Tive uma emergência no trabalho'), 'profissional vê o motivo no chat');

  console.log('\nHistórico do cliente');
  await rpc(cliS, 'create_request', { p_conversation_id: d2.conv, p_service_id: 'encanador', p_description: 'Outra torneira', p_when: 'Hoje', p_address: { label: 'Casa', line: 'Avenida Paulista, 1000', area: 'Bela Vista', city: 'São Paulo' } });
  await pro.page.reload({ waitUntil: 'networkidle0' });
  ok(await pro.waitText('0 serviços concluídos · 1 cancelamento em cima da hora'), 'pedido novo mostra o histórico do cliente');
  await pro.page.screenshot({ path: SHOTS + 'cancela-2-historico.png' });

  console.log('\nProfissional: 3 em cima da hora');
  for (let i = 1; i <= 3; i++) {
    const d = await deal(2);
    const r = await rpc(proS, 'cancel_order', { p_order_id: d.order, p_reason: `Imprevisto ${i}` });
    if (r.message) console.log('   ', r.message);
  }
  await pro.page.goto(`${APP}/inicio`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('por cancelamentos em cima da hora'), 'painel: "Pausado até … por cancelamentos em cima da hora"');
  const sw = await pro.page.evaluate(() => { const s = document.querySelector('[role="switch"][aria-label="Recebendo pedidos"]'); return [s?.getAttribute('aria-checked'), s?.getAttribute('aria-disabled')]; });
  ok(sw[0] === 'false' && sw[1] === 'true', `interruptor desligado e travado (${sw})`);
  await pro.page.screenshot({ path: SHOTS + 'cancela-3-pausado.png' });

  console.log('\nTaxa no perfil público');
  await cli.page.goto(`${APP}/profissional/${proId}`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText('Cancelou 3 de 5 serviços em cima da hora nos últimos 90 dias.'), 'cliente vê a taxa');
  ok(await cli.waitText('Não está recebendo pedidos agora'), 'e que ele não está recebendo pedidos');
  await cli.page.screenshot({ path: SHOTS + 'cancela-4-perfil.png' });

  ok(errors.length === 0, 'sem erros nem alertas' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
