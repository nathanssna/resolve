// Histórico do chat em partes: a conversa abre com as 50 mensagens mais recentes e carrega as anteriores. Supabase real, contas temporárias.
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

  // Conversa com pedido, proposta e 58 mensagens (alternando os dois: o limite é 30 por minuto por pessoa).
  const conv = (await rpc(cliS, 'open_conversation', { p_professional_id: proS.user.id })).id;
  const msg = await rpc(cliS, 'create_request', { p_conversation_id: conv, p_service_id: 'encanador', p_description: 'Torneira pingando', p_when: 'Hoje', p_address: { label: 'Casa', line: 'Avenida Paulista, 1000', area: 'Bela Vista', city: 'São Paulo' } });
  const prop = await req(proS, '/rest/v1/proposals', { method: 'POST', body: JSON.stringify({ conversation_id: conv, request_id: msg.request_id, amount: 150, scheduled_label: 'Hoje, à tarde' }) });
  ok(!!msg.request_id && prop.status < 300, 'pedido e proposta criados');
  let sent = 0;
  for (let i = 1; i <= 58; i++) {
    const r = await req(i % 2 ? cliS : proS, '/rest/v1/messages', { method: 'POST', body: JSON.stringify({ conversation_id: conv, body: `Mensagem ${i}.` }) });
    if (r.status < 300) sent++;
  }
  ok(sent === 58, `58 mensagens de texto gravadas (${sent})`);

  console.log('\nAbre com a página mais recente');
  const cli = await device(cliS, 'cliente');
  await cli.page.goto(`${APP}/chat/${conv}`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText('Mensagem 58.'), 'mostra a mensagem mais recente');
  const first = await cli.text();
  ok(!first.includes('Mensagem 1.') && !first.includes('Torneira pingando'), 'as antigas (e o pedido do começo) ainda não aparecem');
  ok(first.includes('Mensagem 9.') && !first.includes('Mensagem 8.'), 'exatamente as 50 mais recentes (9 a 58)');
  ok(first.includes('Carregar mensagens anteriores') && !first.includes('Combine tudo por aqui'), 'botão para carregar as anteriores no topo');
  await cli.page.screenshot({ path: SHOTS + 'historico-1.png' });

  console.log('\nCarregar mensagens anteriores');
  await cli.pressText('Carregar mensagens anteriores');
  ok(await cli.waitText('Torneira pingando'), 'carrega o pedido do começo da conversa');
  const all = await cli.text();
  ok(all.includes('Mensagem 1.') && all.includes('Mensagem 8.'), 'carrega as mensagens anteriores');
  ok(await cli.waitGone('Carregar mensagens anteriores') && all.includes('Combine tudo por aqui'), 'chegou ao começo: some o botão, volta o aviso');
  await cli.page.screenshot({ path: SHOTS + 'historico-2.png' });

  console.log('\nTempo real e lista de conversas');
  await req(proS, '/rest/v1/messages', { method: 'POST', body: JSON.stringify({ conversation_id: conv, body: 'Chego às 14h.' }) });
  ok(await cli.waitText('Chego às 14h.'), 'mensagem nova chega no chat aberto');
  ok((await cli.text()).includes('Mensagem 1.'), 'as anteriores continuam na tela');
  const list = await device(cliS, 'cliente-lista');
  await list.page.goto(`${APP}/mensagens`, { waitUntil: 'networkidle0' });
  ok(await list.waitText('Chego às 14h.'), 'lista de conversas mostra a última mensagem');

  console.log('\nNão lidas além das 50 carregadas');
  // O profissional ainda não abriu a conversa: mais 40 avisos (pelo banco, sem o limite de mensagens por minuto).
  const { execSync } = require('child_process');
  const sql = (q) => JSON.parse(execSync(`npx supabase db query --linked ${JSON.stringify(q)}`, { cwd: require('path').resolve(__dirname, '../..'), encoding: 'utf8' })).rows;
  sql(`insert into public.messages (conversation_id, kind, body) select '${conv}', 'system', 'Aviso ' || i from generate_series(1, 40) i`);
  const expected = sql(`select count(*)::int as n from public.messages m join public.conversations c on c.id = m.conversation_id where c.id = '${conv}' and m.sender_id is distinct from c.professional_id and m.created_at > c.professional_last_read_at`)[0].n;
  const pro = await device(proS, 'profissional');
  await pro.page.goto(`${APP}/mensagens`, { waitUntil: 'networkidle0' });
  // A linha da conversa (um botão) termina com o contador.
  const rowBadge = () => [...document.querySelectorAll('button, [role="button"]')].find((e) => e.innerText.startsWith('Cliente Teste'))?.innerText.split('\n').at(-1);
  await pro.page.waitForFunction((f, n) => new Function('return ' + f)()() === n, { timeout: 15000, polling: 300 }, rowBadge.toString(), String(expected)).catch(() => {});
  const badge = await pro.page.evaluate((f) => new Function('return ' + f)()(), rowBadge.toString());
  ok(expected > 50 && badge === String(expected), `contador mostra todas as ${expected} não lidas, não só as 50 carregadas (mostra ${badge})`);

  ok(errors.length === 0, 'sem erros nem alertas' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
