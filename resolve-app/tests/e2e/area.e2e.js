// Área de atendimento: lista por distância (endereço do cliente) e ficha do profissional. Supabase real.
const fs = require('fs'); const { execSync } = require('child_process'); const puppeteer = require('puppeteer-core');
const env = Object.fromEntries(fs.readFileSync(require('path').resolve(__dirname, '../../.env'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const U = env.EXPO_PUBLIC_SUPABASE_URL, K = env.EXPO_PUBLIC_SUPABASE_ANON_KEY, REF = new URL(U).hostname.split('.')[0];
const PW = fs.readFileSync(__dirname + '/.e2e_pw', 'utf8');
const SHOTS = __dirname + '/shots/';
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ok   ' : '  FALHA', m); };
const sql = (q) => JSON.parse(execSync(`npx supabase db query --linked ${JSON.stringify(q)}`, { cwd: require('path').resolve(__dirname, '../..'), encoding: 'utf8' })).rows;
const login = async (e) => (await (await fetch(`${U}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: K, 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: PW }) })).json());
const setCli = (lat, lng, area) => sql(`update public.addresses set latitude = ${lat}, longitude = ${lng}, area = '${area}' where user_id = (select id from auth.users where email = 'teste+cli@exemplo.invalid') returning id`);
(async () => {
  const cli = await login('teste+cli@exemplo.invalid'); const pro = await login('teste+pro@exemplo.invalid');
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const errors = [];
  const dev = async (s, tag) => {
    const ctx = await b.createBrowserContext(); await ctx.overridePermissions('http://localhost:8099', ['geolocation']);
    const p = await ctx.newPage(); await p.setViewport({ width: 390, height: 844 });
    p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`)); p.on('dialog', async (d) => { errors.push(`${tag} caixa: ${d.message()}`); await d.accept(); });
    await p.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), `sb-${REF}-auth-token`, JSON.stringify(s));
    const text = () => p.evaluate(() => document.body.innerText);
    const wait = (t, ms = 15000) => p.waitForFunction((t) => document.body.innerText.includes(t), { timeout: ms, polling: 300 }, t).then(() => true, () => false);
    const press = async (label) => { await p.waitForFunction((l) => [...document.querySelectorAll('[role="button"]')].some((e) => e.innerText.trim() === l), { timeout: 10000, polling: 300 }, label); const el = await p.evaluateHandle((l) => [...document.querySelectorAll('[role="button"]')].filter((e) => e.innerText.trim() === l).at(-1), label); await el.asElement().focus(); await p.keyboard.press('Enter'); };
    return { p, text, wait, press };
  };

  console.log('Cliente na Av. Paulista');
  setCli(-23.5614, -46.6559, 'Bela Vista');
  const c = await dev(cli, 'cliente');
  await c.p.goto('http://localhost:8099/profissionais/encanador', { waitUntil: 'networkidle0' });
  ok(await c.wait('2 atendem Bela Vista'), 'subtítulo: "2 atendem Bela Vista" (Marcos e Paulo)');
  ok(await c.wait('Marcos Oliveira') && await c.wait('Paulo Santos') && await c.wait('1 km'), 'demo do bairro aparece, com a distância');
  ok(await c.wait('Área não informada') && (await c.text()).indexOf('Pro Teste') > (await c.text()).indexOf('Área não informada'), 'Pro Teste (sem área) no fim, separado');
  ok((await c.text()).includes('Mais próximos'), 'filtro "Mais próximos" volta');
  await c.p.screenshot({ path: SHOTS + 'area-1-lista.png' });
  await c.press('Mais próximos');
  await new Promise((r) => setTimeout(r, 500));
  const order = await c.text();
  ok(order.indexOf('Marcos Oliveira') < order.indexOf('Paulo Santos'), 'mais próximos: Marcos (1 km) antes de Paulo');
  await c.p.goto(`http://localhost:8099/profissional/${sql("select md5('resolve-demo:marcos')::uuid id")[0].id}`, { waitUntil: 'networkidle0' });
  ok(await c.wait('Atende Bela Vista e até 10 km'), 'perfil público: "Atende Bela Vista e até 10 km"');

  console.log('\nCliente em Campinas');
  setCli(-22.9056, -47.0608, 'Centro');
  await c.p.goto('http://localhost:8099/profissionais/encanador', { waitUntil: 'networkidle0' });
  ok(await c.wait('Ninguém atende Centro ainda') && await c.wait('Pro Teste'), 'ninguém no raio; mostra só quem não informou a área');
  ok(!(await c.text()).includes('Marcos Oliveira'), 'demo de São Paulo não aparece');

  console.log('\nProfissional define a área');
  const pp = await dev(pro, 'pro');
  await pp.p.setGeolocation({ latitude: -23.55052, longitude: -46.63331 });
  await pp.p.goto('http://localhost:8099/profissional/ficha', { waitUntil: 'networkidle0' });
  await pp.press('Continuar'); await pp.press('Continuar');
  ok(await pp.wait('Onde você atende') && await pp.wait('Usar minha localização atual'), 'passo Atendimento pergunta onde atende');
  ok(await pp.wait('Sem área, você aparece no fim da lista'), 'avisa o que acontece sem área');
  await pp.press('20 km');
  await pp.press('Usar minha localização atual');
  ok(await pp.wait('Você aparece para clientes até 20 km de onde você está'), 'localização pega; mostra o raio');
  await pp.p.screenshot({ path: SHOTS + 'area-2-ficha.png' });
  await pp.press('Salvar ficha');
  await new Promise((r) => setTimeout(r, 2500));
  const row = sql("select latitude, longitude, service_radius_km from public.professionals where id = (select id from auth.users where email = 'teste+pro@exemplo.invalid')")[0];
  ok(row.latitude === -23.551 && row.longitude === -46.633 && row.service_radius_km === 20, `salvo com ~100 m de precisão: ${JSON.stringify(row)}`);
  setCli(-23.5614, -46.6559, 'Bela Vista');
  await c.p.bringToFront();
  await c.p.goto('http://localhost:8099/profissionais/encanador', { waitUntil: 'networkidle0' });
  await c.wait('3 atendem Bela Vista');
  const t = await c.text(); const cut = t.includes('Área não informada') ? t.indexOf('Área não informada') : t.length;
  ok(t.includes('3 atendem Bela Vista') && t.indexOf('Pro Teste') < cut && t.includes('3 km'), 'agora o Pro Teste atende a Paulista (3 no raio, a 3 km)');

  ok(errors.length === 0, 'sem erros' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await b.close(); console.log(`\n${pass} ok, ${fail} falhas`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
