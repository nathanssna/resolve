// Notificações e Ajuda (Perfil): preferências gravadas no banco, perguntas por perfil. Supabase real, contas temporárias.
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

  const checked = (d, name) => d.page.evaluate((n) => document.querySelector(`[role="switch"][aria-label="${n}"]`)?.getAttribute('aria-checked'), name);
  // As preferências carregaram quando o interruptor deixa de estar desabilitado.
  const loaded = (d) => d.page.waitForFunction(() => { const s = document.querySelector('[role="switch"]'); return s && s.getAttribute('aria-disabled') !== 'true'; }, { timeout: 15000, polling: 300 }).then(() => true, () => false);
  const prefs = async () => (await api(cliS, '/rest/v1/notification_prefs?select=messages,updates'))[0];
  const until = async (fn, ms = 8000) => { for (const t = Date.now(); Date.now() - t < ms; await sleep(300)) if (await fn()) return true; return false; };

  console.log('Notificações (cliente)');
  const cli = await device(cliS, 'cliente');
  await cli.page.goto(`${APP}/perfil`, { waitUntil: 'networkidle0' });
  await cli.pressText('Notificações');
  ok(await cli.waitPath(/^\/notificacoes$/) && await cli.waitText('Neste aparelho') && await cli.waitText('Indisponíveis aqui'), 'abre pelo Perfil; no navegador, push indisponível');
  ok(await cli.waitText('Propostas recebidas e andamento dos serviços'), 'descrição do lado do cliente');
  ok(await loaded(cli) && (await checked(cli, 'Mensagens')) === 'true' && (await checked(cli, 'Pedidos e propostas')) === 'true', 'sem nada salvo, tudo ligado');
  await cli.press('Mensagens', 'switch');
  ok(await until(async () => (await prefs())?.messages === false), 'desligar Mensagens grava no banco');
  ok((await prefs())?.updates === true, 'Pedidos e propostas continua ligado');
  await cli.page.screenshot({ path: SHOTS + 'notif-1-cliente.png' });
  await cli.page.reload({ waitUntil: 'networkidle0' });
  ok(await loaded(cli) && (await checked(cli, 'Mensagens')) === 'false', 'continua desligado ao reabrir');
  await cli.press('Pedidos e propostas', 'switch');
  ok(await until(async () => (await prefs())?.updates === false) && (await prefs())?.messages === false, 'o segundo interruptor não mexe no primeiro');
  await cli.press('Mensagens', 'switch');
  await cli.press('Pedidos e propostas', 'switch');
  ok(await until(async () => { const p = await prefs(); return p?.messages === true && p?.updates === true; }), 'religa os dois');

  console.log('\nAjuda (cliente)');
  await cli.page.goto(`${APP}/perfil`, { waitUntil: 'networkidle0' });
  await cli.pressText('Ajuda');
  ok(await cli.waitPath(/^\/ajuda$/) && await cli.waitText('Pedidos e serviços') && await cli.waitText('Conta e segurança'), 'abre pelo Perfil com as seções do cliente');
  ok(!(await cli.text()).includes('Como recebo pedidos?'), 'sem as perguntas do profissional');
  ok(!(await cli.text()).includes('Direto a ele, no valor combinado'), 'respostas começam fechadas');
  await cli.pressText('Como pago o profissional?');
  ok(await cli.waitText('Direto a ele, no valor combinado'), 'tocar na pergunta abre a resposta');
  ok(await cli.waitText('Ainda precisa de ajuda?') && await cli.waitText('Escrever e-mail'), 'contato no fim');
  await cli.page.screenshot({ path: SHOTS + 'notif-2-ajuda.png', fullPage: true });
  await cli.pressText('Como pago o profissional?');
  ok(await cli.waitGone('Direto a ele, no valor combinado'), 'tocar de novo fecha');

  console.log('\nProfissional');
  const pro = await device(proS, 'profissional');
  await pro.page.goto(`${APP}/ajuda`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('Pedidos e propostas') && await pro.waitText('Como recebo pedidos?') && !(await pro.text()).includes('Pedidos e serviços'), 'Ajuda com as perguntas do profissional');
  await pro.page.goto(`${APP}/notificacoes`, { waitUntil: 'networkidle0' });
  ok(await pro.waitText('Pedidos novos e andamento dos serviços'), 'Notificações com a descrição do profissional');
  await pro.page.screenshot({ path: SHOTS + 'notif-3-pro.png' });

  ok(errors.length === 0, 'sem erros nem alertas' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
