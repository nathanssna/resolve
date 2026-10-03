// Bloco 2: favoritos, telefone, perfil com avaliações, escolha de serviço, novo pedido pelo chat,
// cancelar/recusar pedido, avaliação com comentário. Supabase real, contas temporárias.
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
  const api = (s, path, init = {}) => fetch(`${URL_}${path}`, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${s.access_token}`, 'content-type': 'application/json', ...(init.headers || {}) } }).then((r) => r.json());
  const rpc = (s, fn, args) => api(s, `/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const errors = [];
  const device = async (session, tag) => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), `sb-${REF}-auth-token`, JSON.stringify(session));
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    // Avisos agora são do próprio app: qualquer caixa do navegador é erro.
    page.on('dialog', async (d) => { errors.push(`${tag} caixa do navegador: ${d.message()}`); await d.accept(); });
    const text = () => page.evaluate(() => document.body.innerText);
    const waitText = async (t, ms = 15000) => { try { await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: ms, polling: 300 }, t); return true; } catch { return false; } };
    const waitPath = async (re, ms = 15000) => { try { await page.waitForFunction((x) => new RegExp(x).test(location.pathname), { timeout: ms, polling: 300 }, re.source); return true; } catch { return false; } };
    const press = async (name, role = 'button') => { const el = await page.waitForSelector(`::-p-aria([name="${name}"][role="${role}"])`, { timeout: 10000 }); await el.focus(); await page.keyboard.press('Enter'); };
    // Botão pelo texto visível (o último, se houver vários).
    const pressText = async (label, { exact = false, last = true } = {}) => {
      const find = (l, exact) => [...document.querySelectorAll('[role="button"]')].filter((e) => (exact ? e.innerText.trim() === l : e.innerText.includes(l)));
      await page.waitForFunction((l, ex, f) => new Function('return ' + f)()(l, ex).length > 0, { timeout: 10000, polling: 300 }, label, exact, find.toString());
      const el = await page.evaluateHandle((l, ex, last, f) => { const all = new Function('return ' + f)()(l, ex); return last ? all.at(-1) : all[0]; }, label, exact, last, find.toString());
      await el.asElement().focus(); await page.keyboard.press('Enter');
    };
    const type = async (label, value) => {
      const el = await page.waitForSelector(`input[aria-label="${label}"], textarea[aria-label="${label}"]`, { timeout: 10000 });
      await el.focus(); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace');
      await el.type(value, { delay: 5 });
    };
    return { page, text, waitText, waitPath, press, pressText, type };
  };

  const cli = await device(cliS, 'cliente');

  console.log('Favoritos');
  await cli.page.goto(`${APP}/servico/encanador`, { waitUntil: 'networkidle0' });
  await cli.press('Favoritar');
  ok(await cli.page.waitForSelector('::-p-aria([name="Remover dos favoritos"][role="button"])', { timeout: 8000 }).then(() => true, () => false), 'coração marcado');
  await sleep(1000);
  ok((await api(cliS, '/rest/v1/favorites?select=service_id')).map((f) => f.service_id).join() === 'encanador', 'favorito salvo no banco');
  await cli.page.goto(`${APP}/favoritos`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText('Encanador'), 'aparece em Favoritos depois de recarregar o app');

  console.log('\nTelefone');
  await cli.page.goto(`${APP}/perfil`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText('Adicionar telefone'), 'Perfil oferece "Adicionar telefone"');
  await cli.pressText('Adicionar telefone');
  ok(await cli.waitPath(/^\/telefone$/), 'abre a tela de telefone');
  await cli.type('Celular com DDD', '11912345678');
  ok((await cli.page.$eval('input[aria-label="Celular com DDD"]', (e) => e.value)) === '(11) 91234-5678', 'máscara (11) 91234-5678');
  await cli.press('Salvar telefone');
  ok(await cli.waitPath(/^\/perfil$/) && await cli.waitText('(11) 91234-5678'), 'Perfil mostra o telefone salvo');
  ok((await rpc(cliS, 'get_my_profile', {})).phone === '+5511912345678', 'banco guarda +5511912345678');

  console.log('\nPerfil do profissional e escolha do serviço');
  await cli.page.goto(`${APP}/profissionais/encanador`, { waitUntil: 'networkidle0' });
  const opt = await cli.page.waitForSelector('::-p-text(Pro Teste)'); await opt.click();
  await cli.press('Ver perfil e avaliações de Pro');
  ok(await cli.waitPath(/^\/profissional\/[0-9a-f-]+$/) && await cli.waitText('Pequenos reparos em casa.') && await cli.waitText('Pro ainda não recebeu avaliações'), 'perfil abre com bio e "ainda não recebeu avaliações"');
  ok((await cli.text()).includes('Encanador') && (await cli.text()).includes('Eletricista'), 'perfil lista os dois serviços');
  await cli.press('Pedir orçamento a Pro');
  ok(await cli.waitText('Qual serviço?'), 'pedido pergunta qual serviço (profissional faz 2)');
  ok(await cli.waitText('Novo no Resolve'), 'pedido mostra "Novo no Resolve", não 0,0');
  await cli.pressText('Eletricista', { exact: true });
  await cli.type('O que você precisa?', 'Trocar duas tomadas da sala');
  await cli.press('Continuar'); await cli.waitText('PASSO 2 DE 3'); await cli.press('Continuar'); await cli.waitText('PASSO 3 DE 3');
  await cli.press('Enviar para Pro');
  ok(await cli.waitPath(/^\/chat\//, 20000), 'pedido enviado');
  const conv = new URL(cli.page.url()).pathname.split('/').pop();
  let reqs = await api(cliS, `/rest/v1/requests?conversation_id=eq.${conv}&select=id,service_id&order=created_at`);
  ok(reqs.map((r) => r.service_id).join() === 'eletricista', 'o pedido foi para Eletricista (o serviço trocado)');

  console.log('\nNovo pedido pelo chat');
  await cli.press('Mais opções');
  await cli.pressText('Novo pedido', { exact: true });
  ok(await cli.waitPath(/^\/pedido\/novo$/) && await cli.waitText('Qual serviço?'), '"Novo pedido" no chat abre o formulário');
  await cli.pressText('Encanador', { exact: true });
  await cli.type('O que você precisa?', 'Torneira pingando no banheiro');
  await cli.press('Continuar'); await cli.waitText('PASSO 2 DE 3'); await cli.press('Continuar'); await cli.waitText('PASSO 3 DE 3');
  await cli.press('Enviar para Pro');
  ok(await cli.waitPath(new RegExp(`^/chat/${conv}$`), 20000), 'volta para a MESMA conversa');
  reqs = await api(cliS, `/rest/v1/requests?conversation_id=eq.${conv}&select=id,service_id,closed_by&order=created_at`);
  ok(reqs.map((r) => r.service_id).join() === 'eletricista,encanador', '2 pedidos na conversa');
  const [reqEle, reqEnc] = reqs.map((r) => r.id);

  console.log('\nCliente cancela um pedido');
  await cli.waitText('Torneira pingando no banheiro');
  await cli.pressText('Cancelar pedido', { exact: true, last: true });
  ok(await cli.waitText('O profissional será avisado.'), 'confirmação do app (não do navegador)');
  await cli.page.screenshot({ path: SHOTS + 'dlg-1-confirmar.png' });
  await cli.pressText('Cancelar', { exact: true, last: true });
  ok(await cli.waitText('Encanador: Pedido cancelado pelo cliente') && await cli.waitText('CANCELADO'), 'pedido do encanador cancelado (selo + aviso)');
  const closed = await api(cliS, `/rest/v1/requests?id=eq.${reqEnc}&select=closed_by`);
  ok(closed[0]?.closed_by === cliS.user.id, 'banco: encerrado pelo cliente');
  await cli.page.screenshot({ path: SHOTS + 'b2-1-cancelado.png' });

  console.log('\nProfissional');
  const pro = await device(proS, 'pro');
  await pro.page.goto(`${APP}/inicio`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('1 pedido esperando resposta') && !(await pro.text()).includes('Torneira pingando no banheiro'), 'painel: só o pedido em aberto (o cancelado some)');
  await pro.page.goto(`${APP}/chat/${conv}`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('CANCELADO') && (await pro.text()).split('Recusar pedido').length - 1 === 1, 'chat do profissional: 1 pedido aberto, o outro cancelado');
  await pro.press('Enviar proposta');
  await pro.type('Valor (R$)', '180');
  ok(!(await pro.text()).includes('Para qual pedido?'), 'pedido cancelado não entra na escolha');
  await pro.pressText('Enviar proposta', { exact: true, last: true });
  await sleep(2000);

  // Terceiro pedido (pela API) para o profissional recusar.
  const third = await rpc(cliS, 'create_request', { p_conversation_id: conv, p_service_id: 'encanador', p_description: 'Chuveiro sem água quente', p_when: 'Hoje' });
  ok(!!third.request_id, 'terceiro pedido criado');
  ok(await pro.waitText('Chuveiro sem água quente'), 'chega ao profissional pelo Realtime');
  await pro.pressText('Recusar pedido', { exact: true, last: true });
  await pro.waitText('O cliente será avisado.');
  await pro.pressText('Recusar', { exact: true, last: true });
  ok(await pro.waitText('O profissional não pode atender este pedido'), 'profissional recusa');
  await cli.page.bringToFront();
  ok(await cli.waitText('RECUSADO') && await cli.waitText('Encanador: O profissional não pode atender este pedido'), 'cliente vê "RECUSADO" na hora');

  console.log('\nAceite, conclusão e avaliação com comentário');
  await cli.press('Aceitar proposta');
  ok(await cli.waitText('Serviço combinado · R$ 180,00'), 'cliente aceita a proposta do eletricista');
  const phone = await rpc(proS, 'get_contact_phone', { p_conversation_id: conv });
  ok(phone === '+5511912345678', `profissional recebe o telefone do cliente depois de combinar (${phone})`);
  const [order] = await api(cliS, `/rest/v1/orders?request_id=eq.${reqEle}&select=id`);
  await cli.page.goto(`${APP}/pedido/${order.id}`, { waitUntil: 'networkidle0' });
  await cli.press('Serviço concluído');
  ok(await cli.waitText('Como foi o serviço de Pro?'), 'concluído; pede avaliação');
  await cli.press('5 estrelas');
  await cli.type('Conte como foi (opcional)', 'Pontual e caprichoso, recomendo!');
  await cli.page.screenshot({ path: SHOTS + 'b2-2-avaliar.png' });
  await cli.press('Enviar avaliação');
  ok(await cli.waitText('Obrigado pela avaliação!') && await cli.waitText('“Pontual e caprichoso, recomendo!”'), 'avaliação enviada com o comentário');

  await pro.page.bringToFront();
  await pro.page.goto(`${APP}/pedido/${order.id}`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('Avaliação do cliente') && await pro.waitText('“Pontual e caprichoso, recomendo!”'), 'profissional vê o comentário no pedido');

  await cli.page.bringToFront();
  await cli.page.goto(`${APP}/profissional/${proS.user.id}`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText('Pontual e caprichoso, recomendo!') && await cli.waitText('Cliente · Eletricista'), 'perfil público mostra a avaliação com primeiro nome e serviço');
  await cli.page.screenshot({ path: SHOTS + 'b2-3-perfil.png' });

  console.log('\nDesfavoritar');
  await cli.page.goto(`${APP}/servico/encanador`, { waitUntil: 'networkidle0' });
  await cli.press('Remover dos favoritos');
  await sleep(1000);
  ok((await api(cliS, '/rest/v1/favorites?select=service_id')).length === 0, 'favorito removido do banco');

  ok(errors.length === 0, 'sem erros nem alertas' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
