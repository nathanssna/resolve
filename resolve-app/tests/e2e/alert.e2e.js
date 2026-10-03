// Mensagem só alerta o painel com pedido aberto ou serviço combinado.
const fs = require('fs'); const puppeteer = require('puppeteer-core');
const env = Object.fromEntries(fs.readFileSync(require('path').resolve(__dirname, '../../.env'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const U = env.EXPO_PUBLIC_SUPABASE_URL, K = env.EXPO_PUBLIC_SUPABASE_ANON_KEY, REF = new URL(U).hostname.split('.')[0];
const PW = fs.readFileSync(__dirname + '/.e2e_pw', 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ok   ' : '  FALHA', m); };
const login = async (e) => (await (await fetch(`${U}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: K, 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: PW }) })).json());
(async () => {
  const cli = await login('teste+cli@exemplo.invalid'); const pro = await login('teste+pro@exemplo.invalid');
  const call = (s, path, body) => fetch(`${U}${path}`, { method: 'POST', headers: { apikey: K, Authorization: `Bearer ${s.access_token}`, 'content-type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(body) }).then((r) => r.text()).then((t) => (t ? JSON.parse(t) : null));
  const rpc = (s, fn, a) => call(s, `/rest/v1/rpc/${fn}`, a);
  const conv = (await rpc(cli, 'open_conversation', { p_professional_id: pro.user.id })).id;
  const deal = async (d) => {
    const r = await rpc(cli, 'create_request', { p_conversation_id: conv, p_service_id: 'encanador', p_description: d, p_when: 'Hoje' });
    const p = (await call(pro, '/rest/v1/proposals', { conversation_id: conv, request_id: r.request_id, amount: 100, scheduled_label: 'Hoje, 15h' }))[0].id;
    return rpc(cli, 'accept_proposal', { p_proposal_id: p });
  };
  const o1 = await deal('Torneira');
  await rpc(cli, 'complete_order', { p_order_id: o1.id });
  await rpc(pro, 'mark_conversation_read', { p_conversation_id: conv });
  await call(cli, '/rest/v1/messages', { conversation_id: conv, body: 'Obrigado!' });

  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
  await p.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), `sb-${REF}-auth-token`, JSON.stringify(pro));
  const wait = (t, ms = 15000) => p.waitForFunction((t) => document.body.innerText.includes(t), { timeout: ms, polling: 300 }, t).then(() => true, () => false);
  await p.goto('http://localhost:8099/inicio', { waitUntil: 'networkidle0' });
  ok(await wait('Tudo em dia') && !(await p.evaluate(() => document.body.innerText)).includes('Precisa de você'), '"Obrigado!" depois de concluído: painel calmo');
  ok(await p.evaluate(() => [...document.querySelectorAll('[role="tab"], a, [role="link"], [role="button"]')].some((e) => /Mensagens/.test(e.innerText) && /1/.test(e.innerText))), 'mas a aba Mensagens mostra 1 não lida');

  await deal('Chuveiro');
  await rpc(pro, 'mark_conversation_read', { p_conversation_id: conv });
  await call(cli, '/rest/v1/messages', { conversation_id: conv, body: 'Consegue vir às 14h?' });
  ok(await wait('1 mensagem sem resposta') && await wait('Consegue vir às 14h?'), 'com serviço combinado: alerta na hora (Realtime)');
  fs.mkdirSync(__dirname + '/shots', { recursive: true });
  await p.screenshot({ path: __dirname + '/shots/alert-msg.png' });
  await b.close();
  console.log(`\n${pass} ok, ${fail} falhas`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
