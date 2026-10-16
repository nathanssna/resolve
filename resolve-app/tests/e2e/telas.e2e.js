// Prints de todas as telas (visitante, cliente, profissional) para a revisão visual. Não confere nada: só fotografa. Supabase real, contas temporárias.
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
  const DIR = SHOTS + 'telas/';
  fs.mkdirSync(DIR, { recursive: true });

  // Dados: pedido com proposta aceita (serviço hoje), outro concluído e avaliado, e conversa com mensagens.
  const conv = (await rpc(cliS, 'open_conversation', { p_professional_id: proS.user.id })).id;
  const deal = async (desc, service) => {
    const m = await rpc(cliS, 'create_request', { p_conversation_id: conv, p_service_id: service, p_description: desc, p_when: 'Hoje', p_address: { label: 'Casa', line: 'Avenida Paulista, 1000', area: 'Bela Vista', city: 'São Paulo' } });
    const p = await (await req(proS, '/rest/v1/proposals', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ conversation_id: conv, request_id: m.request_id, amount: 180, scheduled_label: 'Hoje, à noite', note: 'Material incluso' }) })).json();
    return rpc(cliS, 'accept_proposal', { p_proposal_id: p[0].id });
  };
  const done = await deal('Trocar duas tomadas da sala', 'eletricista');
  sql(`update public.orders set status = 'concluido', completed_at = now() where id = '${done.id}'`);
  await rpc(cliS, 'rate_order', { p_order_id: done.id, p_rating: 5, p_comment: 'Pontual e caprichoso' });
  const today = await deal('Torneira pingando no banheiro', 'encanador');
  sql(`update public.orders set scheduled_at = ((now() at time zone 'America/Sao_Paulo')::date + 1 + time '13:00') at time zone 'America/Sao_Paulo' where id = '${today.id}'`);
  await req(proS, '/rest/v1/messages', { method: 'POST', body: JSON.stringify({ conversation_id: conv, body: 'Chego às 14h, pode ser?' }) });
  await req(cliS, '/rest/v1/messages', { method: 'POST', body: JSON.stringify({ conversation_id: conv, body: 'Pode sim, obrigado' }) });
  const openReq = await rpc(cliS, 'create_request', { p_conversation_id: conv, p_service_id: 'encanador', p_description: 'Chuveiro sem água quente', p_when: 'Amanhã, à tarde', p_address: { label: 'Casa', line: 'Avenida Paulista, 1000', area: 'Bela Vista', city: 'São Paulo' } });

  const shoot = async (d, role, name, path, wait) => {
    await d.page.goto(`${APP}${path}`, { waitUntil: 'networkidle0' });
    if (wait) await d.waitText(wait, 10000);
    await sleep(800);
    await d.page.screenshot({ path: `${DIR}${role}-${name}.png`, fullPage: true });
    console.log(`  ${role}-${name}`);
  };

  console.log('\nVisitante');
  const vis = await device(null, 'visitante');
  for (const [n, p, w] of [
    ['boas-vindas', '/', null], ['entrar', '/entrar', null], ['buscar', '/buscar', null], ['servico', '/servico/encanador', 'Encanador'],
    ['profissionais', '/profissionais/encanador', null], ['perfil-pro', `/profissional/${proS.user.id}`, 'Pro Teste'], ['termos', '/legal/termos', null], ['ajuda', '/ajuda', null],
  ]) await shoot(vis, 'visitante', n, p, w);

  console.log('\nCliente');
  const cli = await device(cliS, 'cliente');
  for (const [n, p, w] of [
    ['inicio', '/inicio', 'O que vamos resolver'], ['mensagens', '/mensagens', 'Pro Teste'], ['pedidos', '/pedidos', null], ['favoritos', '/favoritos', null],
    ['perfil', '/perfil', 'Cliente Teste'], ['chat', `/chat/${conv}`, 'Pode sim, obrigado'], ['servico-combinado', `/pedido/${today.id}`, 'Combinado'],
    ['servico-concluido', `/pedido/${done.id}`, 'Tudo resolvido'], ['pedido-novo', `/pedido/novo?serviceId=encanador&proId=${proS.user.id}`, 'PASSO 1'],
    ['cancelar', `/pedido/cancelar?id=${today.id}`, null], ['enderecos', '/enderecos', null], ['endereco-novo', '/enderecos/editar', null],
    ['notificacoes', '/notificacoes', null], ['conta', '/conta', null], ['excluir-conta', '/conta/excluir', null], ['telefone', '/telefone', null],
    ['suporte', '/suporte', null], ['denunciar', `/denunciar?userId=${proS.user.id}&name=Pro%20Teste&conversationId=${conv}`, null],
    ['verificacao', '/verificacao', null], ['ajuda', '/ajuda', null],
  ]) await shoot(cli, 'cliente', n, p, w);

  console.log('\nProfissional');
  const pro = await device(proS, 'profissional');
  for (const [n, p, w] of [
    ['inicio', '/inicio', 'Olá'], ['mensagens', '/mensagens', 'Cliente Teste'], ['pedidos', '/pedidos', null], ['perfil', '/perfil', 'Pro Teste'],
    ['chat', `/chat/${conv}`, 'Pode sim, obrigado'], ['servico-combinado', `/pedido/${today.id}`, 'Combinado'], ['servico-concluido', `/pedido/${done.id}`, 'Tudo resolvido'],
    ['ficha', '/profissional/ficha', null], ['verificacao', '/profissional/verificacao', null], ['perfil-publico', `/profissional/${proS.user.id}`, 'Pro Teste'],
    ['notificacoes', '/notificacoes', null], ['ajuda', '/ajuda', null],
  ]) await shoot(pro, 'profissional', n, p, w);
  // Proposta aberta por cima do chat.
  await pro.page.goto(`${APP}/chat/${conv}?proposta=${openReq.request_id}`, { waitUntil: 'networkidle0' });
  await sleep(1000);
  await pro.page.screenshot({ path: `${DIR}profissional-proposta.png` });

  console.log(`\n${errors.length ? 'erros: ' + errors.join(' | ') : 'sem erros'}`);
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
