// Limites e validações: e-mail descartável, folha de proposta (valor e períodos passados), proposta vencida. Supabase real, contas temporárias.
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

  console.log('E-mail descartável (login)');
  const anon = await device(null, 'visitante');
  await anon.page.goto(`${APP}/entrar`, { waitUntil: 'networkidle0' });
  await anon.type('Seu e-mail', 'robo@mailinator.com');
  await anon.pressText('Receber código');
  ok(await anon.waitText('Use um e-mail permanente: não aceitamos e-mails temporários.'), 'avisa antes de mandar o código');
  ok(await anon.page.evaluate(() => location.pathname) === '/entrar', 'não segue para a tela do código');
  await anon.page.screenshot({ path: SHOTS + 'limites-1-email.png' });

  console.log('\nFolha de proposta');
  const conv = (await rpc(cliS, 'open_conversation', { p_professional_id: proId })).id;
  const msg = await rpc(cliS, 'create_request', { p_conversation_id: conv, p_service_id: 'encanador', p_description: 'Torneira pingando', p_when: 'O quanto antes', p_address: { label: 'Casa', line: 'Avenida Paulista, 1000', area: 'Bela Vista', city: 'São Paulo' } });
  const pro = await device(proS, 'profissional');
  await pro.page.goto(`${APP}/chat/${conv}`, { waitUntil: 'networkidle0' });
  await pro.pressText('Enviar proposta');
  ok(await pro.waitText('Quando') && await pro.waitText('Manhã'), 'abre a folha com dias e períodos');
  // Períodos de hoje que já terminaram ficam apagados (não dá para tocar), conforme a hora agora.
  const shown = await pro.page.evaluate(() => {
    const chips = [...document.querySelectorAll('[role="button"]')].filter((e) => ['Manhã', 'Tarde', 'Noite'].some((p) => e.innerText.includes(p)));
    return chips.map((c) => ({ label: c.innerText.split('\n').find((l) => ['Manhã', 'Tarde', 'Noite'].includes(l)), off: getComputedStyle(c.parentElement).pointerEvents === 'none', on: c.getAttribute('aria-selected') === 'true' }));
  });
  const sel = shown.find((s) => s.on);
  ok(!!sel && !sel.off, `o período escolhido nunca é um que já terminou (${JSON.stringify(shown)})`);
  await pro.type('Valor (R$)', '60000');
  ok(await pro.waitText('O valor máximo de uma proposta é R$ 50.000,00.'), 'acima de R$ 50.000: avisa');
  const sendDisabled = await pro.page.evaluate(() => [...document.querySelectorAll('[role="button"]')].filter((e) => e.innerText.trim() === 'Enviar proposta').at(-1)?.getAttribute('aria-disabled'));
  ok(sendDisabled === 'true', 'e não deixa enviar');
  await pro.page.screenshot({ path: SHOTS + 'limites-2-proposta.png' });

  console.log('\nProposta vencida');
  const prop = await (await req(proS, '/rest/v1/proposals', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ conversation_id: conv, request_id: msg.request_id, amount: 150, scheduled_label: 'Amanhã, tarde', scheduled_at: new Date(Date.now() + 86400e3).toISOString() }) })).json();
  ok(!!prop[0]?.id, 'proposta enviada');
  sql(`update public.proposals set scheduled_at = now() - interval '5 hours' where id = '${prop[0].id}'`);
  sql('select private.expire_stale()');
  const cli = await device(cliS, 'cliente');
  await cli.page.goto(`${APP}/chat/${conv}`, { waitUntil: 'networkidle0' });
  ok(await cli.waitText('VENCIDA') && await cli.waitText('Proposta vencida: a data passou sem resposta.'), 'cliente vê a proposta "VENCIDA" e o aviso');
  ok(!(await cli.text()).includes('Aceitar proposta'), 'sem o botão de aceitar');
  await cli.page.screenshot({ path: SHOTS + 'limites-3-vencida.png' });

  ok(errors.length === 0, 'sem erros nem alertas' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
