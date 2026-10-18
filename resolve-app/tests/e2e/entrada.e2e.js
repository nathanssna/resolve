// Caminho de entrada do profissional: painel "Para começar" → teste aprovado (Elétrica) → identidade → aulas → liberado,
// e um teste reprovado (Hidráulica) com a espera de 3 dias. Supabase real, contas temporárias (npm run e2e:users).
// No fim, o profissional de teste volta ao estado liberado que as outras suítes esperam.
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

const sql = (q) => JSON.parse(execSync(`npx supabase db query --linked ${JSON.stringify(q.replace(/\s+/g, " "))}`, { cwd: require('path').resolve(__dirname, '../..'), encoding: 'utf8' })).rows;

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ok   ' : '  FALHA', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const login = async (email) => (await (await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW }) })).json());

(async () => {
  const cliS = await login('teste+cli@exemplo.invalid');
  const proS = await login('teste+pro@exemplo.invalid');
  const proId = proS.user.id;
  const api = (s, path) => fetch(`${URL_}${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${s.access_token}` } }).then((r) => r.json());
  const visibleToClient = async () => (await api(cliS, `/rest/v1/professional_services?select=service_id&professional_id=eq.${proId}`)).map((r) => r.service_id).sort();

  // Começa do zero: sem teste aprovado, sem identidade, sem aulas.
  sql(`update public.professional_services set approved_at = null where professional_id = '${proId}';
       update public.professionals set verified = false, released_at = null, lessons_done_at = null where id = '${proId}';
       delete from public.lesson_progress where professional_id = '${proId}';
       delete from private.quiz_attempts where professional_id = '${proId}';
       delete from public.verifications where user_id = '${proId}';`);
  // Gabarito, só para o robô escolher (o app nunca recebe isso).
  const key = new Map(sql("select question, options[1] as right, options[2] as wrong from private.quiz_questions where service_id in ('eletricista', 'encanador')").map((r) => [r.question, r]));

  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const errors = [];
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), `sb-${REF}-auth-token`, JSON.stringify(proS));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', async (d) => { errors.push(`caixa do navegador: ${d.message()}`); await d.accept(); });
  const text = () => page.evaluate(() => document.body.innerText);
  const waitText = async (t, ms = 20000) => { try { await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: ms, polling: 300 }, t); return true; } catch { return false; } };
  // Toca no botão/linha que tem `label` (o menor elemento com esse texto, para não pegar o contêiner).
  const tap = async (label, role = 'button') => {
    const find = (l, r) => [...document.querySelectorAll(`[role="${r}"]`)].filter((e) => e.offsetParent !== null && e.innerText.split('\n').some((line) => line.trim() === l || line.trim().startsWith(l)));
    await page.waitForFunction((src, l, r) => new Function('l', 'r', `return (${src})(l, r)`)(l, r).length > 0, { timeout: 15000, polling: 300 }, find.toString(), label, role);
    await page.evaluate((src, l, r) => new Function('l', 'r', `return (${src})(l, r)`)(l, r).sort((a, b) => a.innerText.length - b.innerText.length)[0].click(), find.toString(), label, role);
  };
  const shot = (name) => page.screenshot({ path: `${SHOTS}entrada-${name}.png` });

  // Responde a tela de questões: certa (ou errada) em todas, conferindo a fonte no canto.
  const answerAll = async (mode) => {
    let n = 0, withSource = 0;
    for (;;) {
      await page.waitForFunction(() => /QUESTÃO \d+ DE \d+/.test(document.body.innerText), { timeout: 15000, polling: 300 });
      const t = await text();
      const [, cur, total] = t.match(/QUESTÃO (\d+) DE (\d+)/).map(Number);
      if (t.includes('Fonte: ')) withSource++;
      const q = await page.evaluate(() => document.querySelector('[role="heading"][aria-level="2"], h2')?.innerText ?? '');
      const entry = key.get(q) ?? [...key.values()].find((k) => t.includes(k.question));
      if (!entry) throw new Error(`questão desconhecida na tela ${cur}`);
      if (cur === 4 && mode === 'right') await shot('3-questao');
      await tap(mode === 'right' ? entry.right : entry.wrong, 'radio');
      n++;
      if (cur === total) { await tap('Enviar respostas'); return { n, total, withSource }; }
      await tap('Próxima');
      await page.waitForFunction((c) => document.body.innerText.includes(`QUESTÃO ${c + 1} DE`), { timeout: 10000, polling: 200 }, cur);
    }
  };

  console.log('\nAntes de liberar');
  await page.goto(`${APP}/inicio`);
  ok(await waitText('Para começar'), 'painel mostra "Para começar"');
  const t0 = await text();
  ok(t0.includes('Você ainda não aparece para clientes') && t0.includes('Faltam 3 passos'), 'topo: ainda não aparece, faltam 3 passos');
  ok(t0.includes('Teste de Elétrica') && t0.includes('Teste de Hidráulica') && t0.includes('Confirmar identidade') && t0.includes('Aulas da Rezolveaê') && t0.includes('0 de 5'), 'um teste por serviço da ficha + identidade + aulas');
  ok(t0.includes('Quando você for liberado'), 'Para responder explica que os pedidos chegam depois de liberado');
  await shot('1-painel-antes');
  ok((await visibleToClient()).length === 0, 'cliente não vê nenhum serviço dele');

  console.log('\nTeste de Elétrica (aprovado)');
  await tap('Teste de Elétrica');
  ok(await waitText('Começar teste'), 'tela de regras');
  const rules = await text();
  ok(rules.includes('20 questões de marcar') && rules.includes('Passa com 14 acertos') && rules.includes('3 dias'), 'regras: 20 questões, passa com 14, 3 dias');
  await shot('2-regras');
  await tap('Começar teste');
  const r1 = await answerAll('right');
  ok(r1.total === 20 && r1.n === 20, '20 questões respondidas');
  ok(r1.withSource === 20, 'fonte em todas as questões');
  ok(await waitText('Aprovado em Elétrica'), 'resultado: Aprovado em Elétrica');
  ok((await text()).includes('Você acertou 20 de 20') && (await text()).includes('Faltam 2 passos: confirmar sua identidade e concluir as aulas'), 'nota e próximos passos');
  await shot('4-aprovado');
  ok((await visibleToClient()).length === 0, 'sem identidade, o cliente ainda não vê');
  await tap('Continuar');
  ok(await waitText('Selfie com o documento'), 'leva para a identidade');

  console.log('\nTeste de Hidráulica (reprovado)');
  await page.goto(`${APP}/inicio`);
  ok(await waitText('Aprovado'), 'painel: Elétrica aprovada');
  await tap('Teste de Hidráulica');
  await tap('Começar teste');
  await answerAll('wrong');
  ok(await waitText('Não foi dessa vez'), 'resultado: Não foi dessa vez');
  ok(/Você acertou 0 de 20\. Para passar, são 14\./.test(await text()) && (await text()).includes('a partir de'), 'nota e data para tentar de novo');
  await shot('5-reprovado');
  await page.goto(`${APP}/inicio`);
  ok(await waitText('Tente de novo a partir de'), 'painel mostra a espera de Hidráulica');

  console.log('\nIdentidade confirmada: ainda faltam as aulas');
  sql(`insert into public.verifications (user_id, document_path, selfie_path) values ('${proId}', '${proId}/a.jpg', '${proId}/b.jpg');`);
  await page.goto(`${APP}/inicio`);
  ok(await waitText('Conferindo sua identidade'), 'topo: conferindo sua identidade');
  await shot('6-em-analise');
  sql(`update public.verifications set status = 'approved' where user_id = '${proId}' and status = 'pending';`);
  ok(!sql(`select released_at from public.professionals where id = '${proId}'`)[0].released_at, 'sem as aulas, ainda não liberado');
  ok((await visibleToClient()).length === 0, 'sem as aulas, o cliente ainda não vê');
  await page.goto(`${APP}/inicio`);
  ok(await waitText('Falta 1 passo para receber pedidos'), 'topo: falta 1 passo');

  console.log('\nAulas: a primeira pelo app, as outras pela API');
  await tap('Aulas da Rezolveaê');
  ok(await waitText('Por que as aulas?'), 'primeira visita: explica por que as aulas existem');
  ok((await text()).includes('Pense no último serviço que você fez bem feito') && (await text()).includes('São 23 minutos, uma vez só'), 'porquê: o texto da cena e o tempo');
  await sleep(800); await shot('8a-porque');
  await tap('Entendi');
  await page.waitForFunction(() => !document.body.innerText.includes('Por que as aulas?'), { timeout: 10000, polling: 200 });
  ok(await waitText('Obrigatórias para aparecer aos clientes'), 'lista das aulas diz que são obrigatórias');
  ok((await text()).includes('0 de 5 concluídas') && (await text()).includes('faltam 23 min'), 'topo: 0 de 5 concluídas, faltam 23 min');
  ok((await text()).includes('PRÓXIMA AULA · 1 DE 5') && (await text()).includes('Agora · 6 min'), 'aula 1 em destaque e marcada na lista');
  ok((await text()).includes('4 min · abre depois da aula 1'), 'aula 2 fechada até concluir a 1');
  await shot('8-aulas');
  await page.goto(`${APP}/aulas/fotos`);
  ok(await waitText('Esta aula ainda não abriu'), 'aberta pelo link, a aula 2 continua fechada');
  await page.goto(`${APP}/aulas`);
  ok(await waitText('Começar a aula') && !(await text()).includes('Por que as aulas?'), 'na volta, a explicação não abre sozinha');
  await tap('Por quê?');
  ok(await waitText('Por que as aulas?'), '"Por quê?" abre a explicação de novo');
  await tap('Entendi');
  await page.waitForFunction(() => !document.body.innerText.includes('Por que as aulas?'), { timeout: 10000, polling: 200 });
  await tap('Começar a aula');
  ok(await waitText('AULA 1 DE 5'), 'abre a aula 1 na abertura');
  ok((await text()).includes('6 tópicos') && (await text()).includes('1 de 6'), 'abertura: 6 tópicos, contador 1 de 6');
  await shot('9-abertura');
  // Lê por tópicos: o botão passa para o próximo; no último, vai para as perguntas.
  await tap('Começar a aula');
  let topics = 1;
  for (;;) {
    await page.waitForFunction((n) => document.body.innerText.includes(`${n} de 6`), { timeout: 10000, polling: 200 }, topics + 1);
    topics++;
    if (topics === 2) { ok((await text()).includes('A semana') && !(await text()).includes('A seguir'), 'tópico 2: A semana, sem "A seguir" no rodapé'); await shot('9b-topico'); }
    if ((await text()).includes('Ir para as perguntas')) break;
    await tap('Próximo tópico');
  }
  ok(topics === 6 && (await text()).includes('FIM DA AULA'), 'seis tópicos e o fim da aula no último');
  // Sai no meio e volta: a lista mostra onde parou e a aula reabre no mesmo tópico.
  await page.goto(`${APP}/aulas`);
  ok(await waitText('CONTINUE DE ONDE PAROU'), 'lista: continue de onde parou');
  ok((await text()).includes('Tópico 6 de 6') && (await text()).includes('Agora · tópico 6 de 6'), 'cartão e lista mostram o tópico 6 de 6');
  await shot('8b-aulas-continuar');
  await tap('Continuar');
  ok(await waitText('Ir para as perguntas'), 'reabre no tópico em que parou');
  await tap('Ir para as perguntas');
  // Perguntas: tenta as opções até acertar (errar mostra o porquê e Reler a aula).
  let wrongSeen = false, asked = 0;
  for (;;) {
    await page.waitForFunction(() => document.querySelectorAll('[role="radio"]').length > 0, { timeout: 10000, polling: 200 });
    asked++;
    for (let i = 0; ; i++) {
      await page.evaluate((i) => [...document.querySelectorAll('[role="radio"]')][i].click(), i);
      await page.waitForFunction(() => /Isso\.|Ainda não\./.test(document.body.innerText), { timeout: 5000, polling: 100 });
      if ((await text()).includes('Isso.')) break;
      if (!wrongSeen) { wrongSeen = (await text()).includes('Reler a aula'); await shot('10-errou'); }
      await tap('Tentar de novo');
    }
    if ((await text()).includes('Concluir a aula')) { await tap('Concluir a aula'); break; }
    await tap('Próxima pergunta');
  }
  ok(asked === 4, '4 perguntas na aula');
  ok(wrongSeen, 'errar mostra "Reler a aula"');
  ok(await waitText('Ler a próxima'), 'aula concluída, sugere a próxima');
  ok(!(await page.evaluate(() => localStorage.getItem('resolve:lessons:spot') ?? '')).includes('orcamento'), 'concluída, o ponto salvo é apagado');
  await shot('11-concluida');
  ok(sql(`select count(*)::int as n from public.lesson_progress where professional_id = '${proId}'`)[0].n === 1, 'conclusão registrada no banco');
  const rpc = (id) => fetch(`${URL_}/rest/v1/rpc/complete_lesson`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${proS.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_lesson_id: id }) }).then((r) => r.json());
  let last;
  for (const id of ['fotos', 'chat', 'data', 'mei']) last = await rpc(id);
  ok(last.done === 5 && last.total === 5 && last.released === true, 'quinta aula libera');

  console.log('\nLiberado');
  ok(sql(`select released_at from public.professionals where id = '${proId}'`)[0].released_at, 'liberado no banco');
  ok(JSON.stringify(await visibleToClient()) === JSON.stringify(['eletricista']), 'cliente vê só Elétrica');
  await page.goto(`${APP}/inicio`);
  ok(await waitText('Recebendo pedidos'), 'painel: Recebendo pedidos');
  ok(await waitText('Faça o teste de Hidráulica'), 'Seu perfil lembra o teste que falta');
  await shot('12-liberado');

  console.log('\nPerfil para o cliente');
  const cli = await (await browser.createBrowserContext()).newPage();
  await cli.setViewport({ width: 390, height: 844 });
  await cli.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), `sb-${REF}-auth-token`, JSON.stringify(cliS));
  cli.on('pageerror', (e) => errors.push(`cliente: ${e.message}`));
  await cli.goto(`${APP}/profissional/${proId}`);
  try { await cli.waitForFunction(() => document.body.innerText.includes('Aprovado em Elétrica'), { timeout: 20000, polling: 300 }); ok(true, 'perfil mostra "Aprovado em Elétrica"'); } catch { ok(false, 'perfil mostra "Aprovado em Elétrica"'); }
  const pt = await cli.evaluate(() => document.body.innerText);
  ok(!pt.includes('Aprovado em Hidráulica') && !pt.includes('Encanador'), 'e não mostra Hidráulica, que não passou');
  await cli.screenshot({ path: `${SHOTS}entrada-13-perfil.png` });

  ok(errors.length === 0, `sem erros na página${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();

  // Volta ao profissional liberado nos dois serviços, como as outras suítes esperam.
  sql(`update public.professional_services set approved_at = now() where professional_id = '${proId}';
       update public.professionals set verified = true, lessons_done_at = coalesce(lessons_done_at, now()) where id = '${proId}';
       delete from private.quiz_attempts where professional_id = '${proId}';`);

  console.log(`\n${pass} ok, ${fail} falhas`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
