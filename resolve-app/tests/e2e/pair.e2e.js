// Dois pedidos ao mesmo profissional caem na mesma conversa. Supabase real, contas temporárias.
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
  const api = (s, path) => fetch(`${URL_}${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${s.access_token}` } }).then((r) => r.json());
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const errors = [];
  const device = async (session, tag) => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), `sb-${REF}-auth-token`, JSON.stringify(session));
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('dialog', async (d) => { errors.push(`${tag} alerta: ${d.message()}`); await d.accept(); });
    const text = () => page.evaluate(() => document.body.innerText);
    const waitText = async (t, ms = 15000) => { try { await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: ms, polling: 300 }, t); return true; } catch { return false; } };
    const waitPath = async (re, ms = 15000) => { try { await page.waitForFunction((x) => new RegExp(x).test(location.pathname), { timeout: ms, polling: 300 }, re.source); return true; } catch { return false; } };
    const press = async (name, role = 'button') => { const el = await page.waitForSelector(`::-p-aria([name="${name}"][role="${role}"])`, { timeout: 10000 }); await el.focus(); await page.keyboard.press('Enter'); };
    // Último botão com esse texto (o da folha de proposta fica no fim do DOM).
    const pressLast = async (label) => {
      await page.waitForFunction((l) => [...document.querySelectorAll('[role="button"]')].some((e) => e.innerText.trim() === l), { timeout: 10000, polling: 300 }, label);
      const el = await page.evaluateHandle((l) => [...document.querySelectorAll('[role="button"]')].filter((e) => e.innerText.trim() === l).at(-1), label);
      await el.asElement().focus(); await page.keyboard.press('Enter');
    };
    const type = async (label, value) => {
      const el = await page.waitForSelector(`input[aria-label="${label}"], textarea[aria-label="${label}"]`, { timeout: 10000 });
      await el.focus(); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace');
      await el.type(value, { delay: 5 });
    };
    return { page, text, waitText, waitPath, press, pressLast, type };
  };

  const cli = await device(cliS, 'cliente');
  const ask = async (service, description) => {
    await cli.page.goto(`${APP}/profissionais/${service}`, { waitUntil: 'networkidle0' });
    const opt = await cli.page.waitForSelector('::-p-text(Pro Teste)'); await opt.click();
    await cli.press('Pedir orçamento a Pro');
    await cli.type('O que você precisa?', description);
    await cli.press('Continuar');
    await cli.waitText('PASSO 2 DE 3');
    await cli.press('Continuar');
    await cli.waitText('PASSO 3 DE 3');
    await cli.press('Enviar para Pro');
    return (await cli.waitPath(/^\/chat\//, 20000)) ? new URL(cli.page.url()).pathname.split('/').pop() : null;
  };

  console.log('Cliente: dois pedidos ao mesmo profissional');
  const conv1 = await ask('encanador', 'Torneira da cozinha pingando');
  ok(!!conv1, 'primeiro pedido (encanador) abre a conversa');
  const conv2 = await ask('eletricista', 'Trocar duas tomadas da sala');
  ok(conv2 === conv1, 'segundo pedido (eletricista) abre a MESMA conversa');
  ok(await cli.waitText('Torneira da cozinha pingando') && await cli.waitText('Trocar duas tomadas da sala'), 'os dois pedidos aparecem no chat');
  const convs = await api(cliS, '/rest/v1/conversations?select=id');
  const reqs = await api(cliS, `/rest/v1/requests?conversation_id=eq.${conv1}&select=id,service_id&order=created_at`);
  ok(convs.length === 1 && reqs.map((r) => r.service_id).join() === 'encanador,eletricista', `1 conversa, 2 pedidos no banco (${convs.length}, ${reqs.map((r) => r.service_id)})`);
  const [reqEnc, reqEle] = reqs.map((r) => r.id);
  await cli.page.goto(`${APP}/mensagens`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText('Eletricista · 2 pedidos'), 'Mensagens: uma linha, com o pedido mais recente e "2 pedidos"');
  ok((await cli.page.evaluate(() => document.body.innerText.split('Pro Teste').length - 1)) === 1, 'Pro Teste aparece uma vez só na lista');
  await cli.page.screenshot({ path: SHOTS + 'pair-1-mensagens.png' });

  console.log('\nProfissional');
  const pro = await device(proS, 'pro');
  await pro.page.goto(`${APP}/inicio`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('2 pedidos esperando resposta'), 'painel conta os 2 pedidos');
  ok(await pro.waitText('Torneira da cozinha pingando') && await pro.waitText('Trocar duas tomadas da sala'), 'cada pedido aparece no painel');
  await pro.page.goto(`${APP}/chat/${conv1}`, { waitUntil: 'networkidle0' });
  await pro.press('Enviar proposta');
  ok(await pro.waitText('Para qual pedido?'), 'proposta pergunta para qual pedido');
  const chips = await pro.page.evaluate(() => [...document.querySelectorAll('[role="button"][aria-selected]')].map((e) => `${e.innerText.replace(/\s+/g, ' ').trim()}=${e.getAttribute('aria-selected')}`));
  ok(chips.some((c) => c.includes('Eletricista') && c.endsWith('=true')) && chips.some((c) => c.includes('Encanador') && c.endsWith('=false')), `o mais recente vem escolhido: ${chips.join(' | ')}`);
  await pro.type('Valor (R$)', '200');
  await pro.page.screenshot({ path: SHOTS + 'pair-2-escolha.png' });
  await pro.pressLast('Enviar proposta');
  await sleep(2000);
  let props = await api(proS, `/rest/v1/proposals?conversation_id=eq.${conv1}&select=request_id,amount,status`);
  ok(props.length === 1 && props[0].request_id === reqEle && Number(props[0].amount) === 200, 'proposta de R$ 200 foi para o pedido do eletricista');
  ok(await pro.waitText('Eletricista') && await pro.waitText('Aguardando resposta do cliente'), 'card da proposta diz de qual serviço é');

  console.log('\nCliente aceita');
  await cli.page.bringToFront();
  await cli.page.goto(`${APP}/chat/${conv1}`, { waitUntil: 'networkidle0' });
  await cli.press('Aceitar proposta');
  ok(await cli.waitText('Eletricista: Serviço combinado · R$ 200,00'), 'aviso de sistema diz o serviço');
  ok(await cli.waitText('Serviço combinado · Eletricista'), 'faixa do topo: serviço combinado do eletricista');
  await cli.page.screenshot({ path: SHOTS + 'pair-3-cliente.png' });

  console.log('\nProfissional: o outro pedido continua aberto');
  await pro.page.bringToFront();
  await pro.page.goto(`${APP}/chat/${conv1}`, { waitUntil: 'networkidle0' });
  await pro.press('Enviar proposta');
  await pro.type('Valor (R$)', '150');
  ok(!(await pro.text()).includes('Para qual pedido?'), 'com 1 pedido aberto, não pergunta');
  await pro.pressLast('Enviar proposta');
  await sleep(2000);
  props = await api(proS, `/rest/v1/proposals?request_id=eq.${reqEnc}&select=amount,status`);
  ok(props.length === 1 && Number(props[0].amount) === 150 && props[0].status === 'pending', 'proposta de R$ 150 foi para o pedido do encanador');
  await pro.page.screenshot({ path: SHOTS + 'pair-4-pro.png' });

  await cli.page.bringToFront();
  ok(await cli.waitText('R$ 150,00'), 'cliente recebe a segunda proposta pelo Realtime');
  await cli.press('Aceitar proposta');
  ok(await cli.waitText('Encanador: Serviço combinado · R$ 150,00'), 'cliente aceita a segunda');
  const orders = await api(cliS, `/rest/v1/orders?conversation_id=eq.${conv1}&select=service_id,amount`);
  ok(orders.length === 2, `2 serviços combinados na mesma conversa (${orders.map((o) => o.service_id)})`);
  await cli.page.goto(`${APP}/pedidos`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText('Encanador') && await cli.waitText('Eletricista'), 'Pedidos lista os dois serviços');

  ok(errors.length === 0, 'sem erros nem alertas' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
