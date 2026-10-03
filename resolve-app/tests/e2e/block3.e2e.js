// Bloco 3: termos e privacidade, denunciar, bloquear, excluir conta. Supabase real, contas temporárias.
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

  console.log('Termos e privacidade');
  const anon = await device(null, 'visitante');
  await anon.page.goto(`${APP}/entrar`, { waitUntil: 'networkidle0' });
  ok(await anon.waitText('Ao continuar, você concorda com os Termos de uso e a Política de privacidade'), 'tela de entrar mostra o aceite');
  await anon.pressText('Termos de uso');
  ok(await anon.waitPath(/^\/legal\/termos$/) && await anon.waitText('Conduta: tolerância zero') && await anon.waitText('Denúncias e bloqueios'), 'abre os Termos (com conduta e denúncias)');
  await anon.page.goto(`${APP}/legal/privacidade`, { waitUntil: 'networkidle0' });
  ok(await anon.waitText('Lei 13.709/2018') && await anon.waitText('O que o outro lado vê'), 'abre a Política de privacidade');

  // Conversa com um pedido (pela API, como o app faz).
  const conv = (await rpc(cliS, 'open_conversation', { p_professional_id: proS.user.id })).id;
  const msg = await rpc(cliS, 'create_request', { p_conversation_id: conv, p_service_id: 'encanador', p_description: 'Torneira pingando', p_when: 'Hoje', p_address: { label: 'Casa', line: 'Avenida Paulista, 1000', area: 'Bela Vista', city: 'São Paulo' } });
  ok(!!msg.request_id, 'pedido criado');

  console.log('\nDenunciar e bloquear (cliente)');
  const cli = await device(cliS, 'cliente');
  await cli.page.goto(`${APP}/chat/${conv}`, { waitUntil: 'networkidle0' });
  const headerButtons = await cli.page.evaluate(() => [...document.querySelectorAll('[role="button"][aria-label]')].map((e) => e.getAttribute('aria-label')).filter((l) => ['Novo pedido', 'Ligar', 'Mais opções'].includes(l)));
  ok(headerButtons.join() === 'Ligar,Mais opções', `cabeçalho: só Ligar e ⋮ (${headerButtons})`);
  await cli.page.screenshot({ path: SHOTS + 'b3-0-cabecalho.png' });
  await cli.press('Mais opções');
  ok(await cli.waitText('Novo pedido') && await cli.waitText('Denunciar Pro') && await cli.waitText('Bloquear Pro') && await cli.waitText('Ver perfil'), 'menu ⋮: novo pedido, ver perfil, denunciar, bloquear');
  await cli.page.screenshot({ path: SHOTS + 'b3-0-menu.png' });
  await cli.pressText('Denunciar Pro');
  ok(await cli.waitPath(/^\/denunciar$/) && await cli.waitText('O que aconteceu?'), 'abre a denúncia');
  await cli.pressText('Pediu pagamento fora do combinado');
  await cli.type('Conte mais (opcional)', 'Pediu Pix adiantado de 50%');
  ok((await cli.text()).includes('Bloquear Pro também'), 'já sugere bloquear junto');
  await cli.page.screenshot({ path: SHOTS + 'b3-1-denuncia.png' });
  await cli.press('Enviar denúncia');
  ok(await cli.waitText('Denúncia enviada. Vamos analisar em até 24 horas.'), 'aviso do app: "Denúncia enviada"');
  await cli.page.screenshot({ path: SHOTS + 'dlg-2-aviso.png' });
  ok(await cli.waitPath(/^\/chat\//) && await cli.waitText('Você bloqueou Pro Teste.'), 'volta ao chat, bloqueado (sem campo de mensagem)');
  const reports = await api(cliS, '/rest/v1/reports?select=reason,details,conversation_id');
  ok(reports.length === 1 && reports[0].reason === 'pagamento' && reports[0].details === 'Pediu Pix adiantado de 50%' && reports[0].conversation_id === conv, 'denúncia gravada com motivo, detalhe e conversa');
  ok(!(await cli.page.$('textarea[aria-label], input[placeholder*="mensagem" i]')) || !(await cli.text()).includes('Qual o valor?'), 'sem respostas rápidas nem composer');
  await cli.page.screenshot({ path: SHOTS + 'b3-2-bloqueado.png' });
  const proMsg = await req(proS, '/rest/v1/messages', { method: 'POST', body: JSON.stringify({ conversation_id: conv, body: 'oi?' }) });
  ok(proMsg.status >= 400, `profissional bloqueado não manda mensagem (HTTP ${proMsg.status})`);
  ok((await api(proS, '/rest/v1/reports?select=id')).length === 0, 'o denunciado não vê a denúncia');
  await cli.page.goto(`${APP}/profissionais/encanador`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  ok(!(await cli.text()).includes('Pro Teste'), 'profissional bloqueado some da lista');

  console.log('\nDesbloquear em Conta e privacidade');
  await cli.page.goto(`${APP}/perfil`, { waitUntil: 'networkidle0' });
  await cli.pressText('Conta e privacidade');
  ok(await cli.waitPath(/^\/conta$/) && await cli.waitText('Pessoas bloqueadas') && await cli.waitText('Pro Teste'), 'lista mostra Pro Teste bloqueado');
  await cli.press('Desbloquear');
  ok(await cli.waitText('Ninguém.'), 'desbloqueado');
  await cli.page.goto(`${APP}/chat/${conv}`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText('Qual o valor?') && !(await cli.text()).includes('Você bloqueou'), 'chat volta ao normal');

  console.log('\nProfissional bloqueia');
  const pro = await device(proS, 'pro');
  await pro.page.goto(`${APP}/chat/${conv}`, { waitUntil: 'networkidle0' });
  await pro.press('Mais opções');
  ok(!(await pro.text()).includes('Ver perfil'), 'profissional não tem "Ver perfil" do cliente');
  await pro.pressText('Bloquear Cliente');
  ok(await pro.waitText('Vocês não vão mais conseguir trocar mensagens'), 'confirmação do app para bloquear');
  await pro.pressText('Bloquear');
  ok(await pro.waitText('Você bloqueou Cliente Teste.'), 'profissional bloqueia o cliente');
  const cliMsg = await req(cliS, '/rest/v1/messages', { method: 'POST', body: JSON.stringify({ conversation_id: conv, body: 'oi?' }) });
  const cliReq = await rpc(cliS, 'create_request', { p_conversation_id: conv, p_service_id: 'encanador', p_description: 'x', p_when: 'Hoje' });
  ok(cliMsg.status >= 400 && /Não é possível falar/.test(cliReq.message ?? ''), 'cliente bloqueado não manda mensagem nem pedido');
  await pro.press('Desbloquear');
  ok(await pro.waitGone('Você bloqueou'), 'profissional desbloqueia');

  console.log('\nExcluir conta (cliente)');
  const pid = (await api(proS, '/rest/v1/proposals', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ conversation_id: conv, request_id: msg.request_id, amount: 120, scheduled_label: 'Amanhã' }) }))[0].id;
  const order = await rpc(cliS, 'accept_proposal', { p_proposal_id: pid });
  ok(order.status === 'combinado', 'serviço combinado antes de excluir');
  await cli.page.goto(`${APP}/conta`, { waitUntil: 'networkidle0' });
  await cli.pressText('Excluir minha conta');
  ok(await cli.waitPath(/^\/conta\/excluir$/) && await cli.waitText('O serviço combinado em andamento será cancelado'), 'tela explica o que acontece (inclui o serviço em andamento)');
  await cli.page.screenshot({ path: SHOTS + 'b3-3-excluir.png' });
  await cli.press('Excluir minha conta');
  ok(await cli.waitText('Isso não pode ser desfeito.'), 'confirmação do app para excluir');
  await cli.pressText('Excluir');
  ok(await cli.page.waitForFunction(() => location.pathname === '/' || location.pathname === '/inicio', { timeout: 20000, polling: 300 }).then(() => true, () => false), 'volta para o início, sem conta');
  ok(await cli.waitText('Sua conta foi excluída.'), 'aviso do app: "Sua conta foi excluída."');
  const relog = await login('teste+cli@exemplo.invalid');
  ok(!relog.access_token, 'login antigo não funciona mais');
  ok((await api(proS, `/rest/v1/orders?id=eq.${order.id}&select=status`))[0]?.status === 'cancelado', 'serviço em andamento cancelado');
  await pro.page.bringToFront();
  await pro.page.goto(`${APP}/chat/${conv}`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('Conta excluída') && await pro.waitText('Esta conta foi excluída. Não é possível enviar mensagens.'), 'profissional vê "Conta excluída" e o chat travado');
  ok(await pro.waitText('Serviço cancelado: a conta foi excluída'), 'com o aviso do cancelamento');
  await pro.page.screenshot({ path: SHOTS + 'b3-4-pro.png' });

  ok(errors.length === 0, 'sem erros nem alertas' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
