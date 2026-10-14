// Painel de moderação: entrada só para administrador, segundo fator (TOTP), selo, denúncia, suspensão. Supabase real, contas temporárias.
const fs = require('fs'); const { execSync } = require('child_process');
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

const sql = (q) => JSON.parse(execSync(`npx supabase db query --linked ${JSON.stringify(q)}`, { cwd: require('path').resolve(__dirname, '../..'), encoding: 'utf8' })).rows;

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
  // Código do app autenticador (RFC 6238), a partir da chave mostrada na tela.
  const totp = (secret) => {
    const b32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += b32.indexOf(c).toString(2).padStart(5, '0');
    const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
    const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
    const h = require('crypto').createHmac('sha1', key).update(counter).digest();
    const o = h[h.length - 1] & 15;
    return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
  };
  const pressRow = (d, text) => d.page.evaluate((t) => [...document.querySelectorAll('[role="button"]')].find((e) => e.innerText.includes(t))?.click(), text);

  // Dados: a cliente de teste vira administradora; o profissional pede o selo e é denunciado.
  sql(`insert into private.admins (user_id) select id from auth.users where email = 'teste+cli@exemplo.invalid'`);
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360f8cf00000301010018dd8db00000000049454e44ae426082', 'hex');
  for (const f of ['d.png', 's.png']) await req(proS, `/storage/v1/object/verification/${proId}/${f}`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: png });
  await req(proS, '/rest/v1/verifications', { method: 'POST', body: JSON.stringify({ document_path: `${proId}/d.png`, selfie_path: `${proId}/s.png` }) });
  const otherS = await login('teste+cli@exemplo.invalid');
  const conv = (await rpc(otherS, 'open_conversation', { p_professional_id: proId })).id;
  await rpc(otherS, 'create_request', { p_conversation_id: conv, p_service_id: 'encanador', p_description: 'Torneira pingando', p_when: 'O quanto antes', p_address: { label: 'Casa', line: 'Avenida Paulista, 1000', area: 'Bela Vista', city: 'São Paulo' } });
  await req(proS, '/rest/v1/messages', { method: 'POST', body: JSON.stringify({ conversation_id: conv, body: 'Me passa seu Pix que eu já resolvo' }) });
  await req(otherS, '/rest/v1/reports', { method: 'POST', body: JSON.stringify({ reported_id: proId, conversation_id: conv, reason: 'pagamento', details: 'Pediu Pix adiantado' }) });

  console.log('Quem não é administrador');
  const pro = await device(proS, 'profissional');
  await pro.page.goto(`${APP}/admin`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('Acesso restrito'), '/admin: acesso restrito');
  await pro.page.goto(`${APP}/perfil`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('Conta e privacidade') && !(await pro.text()).includes('Painel de moderação'), 'Perfil sem a entrada do painel');

  console.log('\nPrimeira entrada (cadastra o autenticador)');
  const adm = await device(cliS, 'administradora');
  await adm.page.goto(`${APP}/perfil`, { waitUntil: 'networkidle0' });
  ok(await adm.waitText('Painel de moderação'), 'Perfil mostra "Painel de moderação"');
  await pressRow(adm, 'Painel de moderação');
  ok(await adm.waitText('Proteja o painel') && await adm.waitText('Ou digite esta chave no app'), 'pede para cadastrar o app autenticador');
  const secret = await adm.page.evaluate(() => document.querySelector('[aria-label^="Chave: "]')?.getAttribute('aria-label')?.slice(7));
  ok(/^[A-Z2-7]{16,}$/.test(secret ?? ''), 'mostra a chave');
  await adm.page.screenshot({ path: SHOTS + 'admin-1-mfa.png' });
  await adm.type('Código de 6 dígitos', '000000');
  await adm.pressText('Confirmar');
  ok(await adm.waitText('Código incorreto'), 'código errado: não entra');
  await adm.page.evaluate(() => { const i = document.querySelector('input[aria-label="Código de 6 dígitos"]'); i.focus(); });
  for (let i = 0; i < 6; i++) await adm.page.keyboard.press('Backspace');
  const code1 = totp(secret);
  await adm.type('Código de 6 dígitos', code1);
  await adm.pressText('Confirmar');
  ok(await adm.waitText('Para resolver') && await adm.waitText('cadastros novos') && await adm.waitText('coisas para resolver'), 'com o código certo, abre o painel');
  ok(await adm.waitText('Pediu pagamento fora do combinado') && await adm.waitText('Pro Teste pediu o selo'), 'a denúncia e o pedido de selo estão na fila');
  const queueText = await adm.text();
  ok(queueText.indexOf('Pediu pagamento fora do combinado') < queueText.indexOf('Pro Teste pediu o selo'), 'denúncias antes dos selos');
  await adm.page.screenshot({ path: SHOTS + 'admin-2-painel.png', fullPage: true });

  console.log('\nSelo Verificado');
  await pressRow(adm, 'Pro Teste pediu o selo');
  ok(await adm.waitText('Confira antes de aprovar') && await adm.waitText('Aprovar selo'), 'abre a revisão do selo');
  ok(await adm.page.waitForFunction(() => [...document.querySelectorAll('img')].some((i) => i.src.includes('/object/sign/verification/')), { timeout: 15000 }).then(() => true, () => false), 'fotos abertas por link assinado');
  await adm.page.screenshot({ path: SHOTS + 'admin-3-selo.png' });
  await adm.pressText('Aprovar selo');
  await adm.pressText('Aprovar');
  ok(await adm.waitText('Selo aprovado'), 'aprovado');
  ok((await api(proS, `/rest/v1/professionals?id=eq.${proId}&select=verified`))[0]?.verified === true, 'selo ligado no banco');
  ok(await adm.waitText('Para resolver'), 'sem outro pedido, volta ao painel');

  // Daqui em diante, navegação dentro do app: recarregar a página traria de volta a sessão do teste sem o segundo fator.
  console.log('\nDenúncia');
  await pressRow(adm, 'Pediu pagamento fora do combinado');
  ok(await adm.waitText('Cliente Teste denunciou') && await adm.waitText('Pediu Pix adiantado'), 'denúncia com quem e o detalhe');
  ok(await adm.waitText('Me passa seu Pix que eu já resolvo'), 'trecho da conversa');
  ok(sql(`select count(*)::int as n from private.admin_log l join auth.users u on u.id = l.admin_id where u.email = 'teste+cli@exemplo.invalid' and l.action = 'ver_conversa'`)[0].n >= 1, 'leitura registrada');
  await adm.page.screenshot({ path: SHOTS + 'admin-4-denuncia.png', fullPage: true });
  await adm.pressText('Resolver denúncia');
  await adm.pressText('Avisei a pessoa');
  ok(await adm.waitText('Denúncia resolvida') && await adm.waitText('Tudo em dia'), 'resolvida; o painel fica em dia');

  console.log('\nSuspender e reativar');
  await adm.type('Buscar pessoa', 'teste+pro');
  ok(await adm.waitText('Faz-tudo · teste+pro@exemplo.invalid'), 'busca por e-mail no painel');
  await pressRow(adm, 'teste+pro@exemplo.invalid');
  ok(await adm.waitText('Histórico') && await adm.waitText('avisei a pessoa'), 'ficha com a denúncia e a decisão');
  await adm.pressText('Suspender conta');
  await adm.pressText('7 dias');
  await adm.pressText('Suspender');
  ok(await adm.waitText('Conta suspensa.') && await adm.waitText('SUSPENSA ATÉ'), 'suspensa por 7 dias');
  const blocked = await req(proS, '/rest/v1/messages', { method: 'POST', body: JSON.stringify({ conversation_id: conv, body: 'oi' }) });
  ok(blocked.status >= 400, `suspenso não manda mensagem (HTTP ${blocked.status})`);
  await adm.page.screenshot({ path: SHOTS + 'admin-5-pessoa.png', fullPage: true });
  await adm.pressText('Reativar conta');
  await adm.pressText('Reativar');
  ok(await adm.waitText('Conta reativada.'), 'reativada');

  console.log('\nNova sessão (já cadastrado: só o código)');
  const fresh = await login('teste+cli@exemplo.invalid');
  const adm2 = await device(fresh, 'administradora-2');
  await adm2.page.goto(`${APP}/admin`, { waitUntil: 'networkidle0' });
  ok(await adm2.waitText('Código do app autenticador'), 'pede só o código');
  ok((await api(fresh, '/rest/v1/rpc/admin_overview', { method: 'POST', body: '{"p_days": 7}' })).message === 'Confirme o código do app autenticador', 'o banco recusa ler sem o segundo fator');
  await adm2.type('Código de 6 dígitos', totp(secret));
  await adm2.pressText('Entrar no painel');
  ok(await adm2.waitText('Para resolver'), 'entra com o código');

  ok(errors.length === 0, 'sem erros nem alertas' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
