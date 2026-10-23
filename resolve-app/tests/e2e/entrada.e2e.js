// Caminho de entrada do profissional: painel "Para começar" → teste aprovado (Elétrica) → identidade → liberado,
// um teste reprovado (Hidráulica) com a espera de 3 dias, e as aulas opcionais: errar as perguntas (espera de 3 dias),
// concluir as cinco e virar Profissional de Ouro, que o cliente vê no perfil. Supabase real, contas temporárias (npm run e2e:users).
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
       delete from private.lesson_attempts where professional_id = '${proId}';
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
  ok((await text()).includes('Você acertou 20 de 20') && (await text()).includes('Falta 1 passo: confirmar sua identidade.'), 'nota e próximo passo');
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

  console.log('\nIdentidade confirmada: liberado, sem precisar das aulas');
  sql(`insert into public.verifications (user_id, document_path, selfie_path) values ('${proId}', '${proId}/a.jpg', '${proId}/b.jpg');`);
  await page.goto(`${APP}/inicio`);
  ok(await waitText('Conferindo sua identidade'), 'topo: conferindo sua identidade');
  ok((await text()).includes('Para começar') && (await text()).includes('2 de 3'), 'Para começar: 2 de 3 passos');
  ok((await text()).includes('Impulso na carreira') && (await text()).includes('10 serviços pela Rezolveaê'), 'Impulso na carreira: as 4 etapas do Profissional de Ouro');
  await shot('6-em-analise');
  sql(`update public.verifications set status = 'approved' where user_id = '${proId}' and status = 'pending';`);
  ok(sql(`select released_at from public.professionals where id = '${proId}'`)[0].released_at, 'liberado no banco');
  ok(JSON.stringify(await visibleToClient()) === JSON.stringify(['eletricista']), 'cliente vê só Elétrica');
  await page.goto(`${APP}/inicio`);
  ok(await waitText('Recebendo pedidos'), 'painel: Recebendo pedidos');
  ok(await waitText('Faça o teste de Hidráulica'), 'Seu perfil lembra o teste que falta');
  ok(await waitText('Impulso na carreira'), 'as etapas do Ouro continuam no fim do painel');
  await shot('7-liberado');

  console.log('\nAulas (opcionais): a primeira pelo app, as outras pela API');
  // Gabarito das aulas, só para o robô (o app nunca recebe isso).
  const lkey = new Map(sql("select question, options[1] as right, options[2] as wrong from private.lesson_questions where active").map((r) => [r.question, r]));
  await tap('Começar as aulas · 23 min');
  ok(await waitText('Por que fazer as aulas?'), 'primeira visita: explica por que fazer as aulas');
  ok((await text()).includes('primeira etapa do Profissional') && (await text()).includes('São 23 minutos, uma vez só'), 'porquê: a etapa do Ouro e o tempo');
  await sleep(800); await shot('8a-porque');
  await tap('Entendi');
  await page.waitForFunction(() => !document.body.innerText.includes('Por que fazer as aulas?'), { timeout: 10000, polling: 200 });
  ok(await waitText('Uma das etapas do'), 'lista das aulas: uma das etapas do Profissional de Ouro');
  ok((await text()).includes('0 de 5 concluídas') && (await text()).includes('faltam 23 min'), 'topo: 0 de 5 concluídas, faltam 23 min');
  ok((await text()).includes('PRÓXIMA AULA · 1 DE 5') && (await text()).includes('Agora · 6 min'), 'aula 1 em destaque e marcada na lista');
  ok((await text()).includes('4 min · abre depois da aula 1'), 'aula 2 fechada até concluir a 1');
  await shot('8-aulas');
  await page.goto(`${APP}/aulas/fotos`);
  ok(await waitText('Esta aula ainda não abriu'), 'aberta pelo link, a aula 2 continua fechada');
  await page.goto(`${APP}/aulas`);
  ok(await waitText('Começar a aula') && !(await text()).includes('Por que fazer as aulas?'), 'na volta, a explicação não abre sozinha');
  await tap('Por quê?');
  ok(await waitText('Por que fazer as aulas?'), '"Por quê?" abre a explicação de novo');
  await tap('Entendi');
  await page.waitForFunction(() => !document.body.innerText.includes('Por que fazer as aulas?'), { timeout: 10000, polling: 200 });
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
  ok((await text()).includes('8 perguntas sobre o que você leu. Para concluir, são 7 acertos.'), 'avisa: 8 perguntas, 7 acertos');
  // Sai no meio e volta: a lista mostra onde parou e a aula reabre no mesmo tópico.
  await page.goto(`${APP}/aulas`);
  ok(await waitText('CONTINUE DE ONDE PAROU'), 'lista: continue de onde parou');
  ok((await text()).includes('Tópico 6 de 6') && (await text()).includes('Agora · tópico 6 de 6'), 'cartão e lista mostram o tópico 6 de 6');
  await shot('8b-aulas-continuar');
  await tap('Continuar');
  ok(await waitText('Ir para as perguntas'), 'reabre no tópico em que parou');

  // Responde as perguntas da aula: `wrong` = quantas errar (as primeiras).
  const answerLesson = async (wrong) => {
    let n = 0;
    for (;;) {
      await page.waitForFunction((k) => document.body.innerText.includes(`PERGUNTA ${k} DE 8`), { timeout: 15000, polling: 200 }, n + 1);
      // A pergunta da tela é a linha do texto que está no gabarito.
      const k = (await text()).split('\n').map((l) => lkey.get(l.trim())).find(Boolean);
      ok(n > 0 || !!k, 'acha a pergunta no gabarito');
      const want = n < wrong ? k?.wrong : k?.right;
      await page.evaluate((w) => [...document.querySelectorAll('[role="radio"]')].find((e) => e.innerText.trim() === w)?.click(), want);
      n++;
      if (n === 1) ok(!/Isso\.|Ainda não\./.test(await text()), 'não diz na hora se acertou');
      if ((await text()).includes('Enviar respostas')) { await tap('Enviar respostas'); break; }
      await tap('Próxima pergunta');
    }
    return n;
  };
  await tap('Ir para as perguntas');
  ok((await answerLesson(2)) === 8, '8 perguntas na aula');
  ok(await waitText('Ainda não foi dessa vez'), 'errou 2: não conclui');
  ok((await text()).includes('Você acertou 6 de 8. Para concluir a aula, são 7.') && (await text()).includes('Releia com calma') && (await text()).includes('a partir de'), 'nota, o que reler e quando responder de novo');
  await shot('10-errou');
  ok(sql(`select count(*)::int as n from public.lesson_progress where professional_id = '${proId}'`)[0].n === 0, 'nada registrado como concluído');
  await page.goto(`${APP}/aulas`);
  ok(await waitText('Perguntas de novo a partir de'), 'lista mostra a espera');
  ok((await text()).includes('Reler a aula'), 'e convida a reler enquanto isso');
  // Passa a espera de 3 dias.
  sql(`update private.lesson_attempts set finished_at = now() - interval '4 days' where professional_id = '${proId}';`);
  await page.goto(`${APP}/aulas/orcamento`);
  ok(await waitText('Ir para as perguntas'), 'depois da espera, pode responder de novo');
  await tap('Ir para as perguntas');
  await answerLesson(0);
  ok(await waitText('Ler a próxima'), 'aula concluída, sugere a próxima');
  ok(!(await page.evaluate(() => localStorage.getItem('resolve:lessons:spot') ?? '')).includes('orcamento'), 'concluída, o ponto salvo é apagado');
  await shot('11-concluida');
  ok(sql(`select count(*)::int as n from public.lesson_progress where professional_id = '${proId}'`)[0].n === 1, 'conclusão registrada no banco');
  const rpc = (fn, body) => fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${proS.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  ok((await rpc('complete_lesson', { p_lesson_id: 'fotos' })).code !== undefined, 'não dá para concluir aula pela API antiga');
  let last;
  for (const id of ['fotos', 'chat', 'data', 'mei']) {
    const a = await rpc('start_lesson_quiz', { p_lesson_id: id });
    const orders = sql(`select orders from private.lesson_attempts where id = '${a.attempt_id}'`)[0].orders;
    last = await rpc('submit_lesson_quiz', { p_attempt_id: a.attempt_id, p_answers: orders.map((o) => o.indexOf(0)) });
  }
  ok(last.done === 5 && last.lessons === 5 && last.gold === false, 'quinta aula: aulas concluídas, mas sem serviços ainda não é Ouro');
  ok(sql(`select lessons_done_at, gold_at from public.professionals where id = '${proId}'`).every((r) => r.lessons_done_at && !r.gold_at), 'aulas registradas, sem a marca');
  await page.goto(`${APP}/aulas`);
  ok(await waitText('Você concluiu as 5 aulas'), 'lista: aulas concluídas, uma das etapas');
  await page.goto(`${APP}/inicio`);
  ok(await waitText('Impulso na carreira') && (await text()).includes('Concluídas') && (await text()).includes('0 de 10'), 'Início: aulas concluídas, 0 de 10 serviços');
  await shot('12-etapas');

  console.log('\nPerfil para o cliente');
  const cli = await (await browser.createBrowserContext()).newPage();
  await cli.setViewport({ width: 390, height: 844 });
  await cli.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), `sb-${REF}-auth-token`, JSON.stringify(cliS));
  cli.on('pageerror', (e) => errors.push(`cliente: ${e.message}`));
  // A marca de Ouro depende de 10 serviços: aqui ela é ligada direto no banco, só para ver o que o cliente vê.
  sql(`update public.professionals set gold_at = now() where id = '${proId}';`);
  await cli.goto(`${APP}/profissional/${proId}`);
  try { await cli.waitForFunction(() => document.body.innerText.includes('Aprovado no teste de conhecimento da Rezolveaê'), { timeout: 20000, polling: 300 }); ok(true, 'serviços: escudo e "Aprovado no teste de conhecimento"'); } catch { ok(false, 'serviços: escudo e "Aprovado no teste de conhecimento"'); }
  const pt = await cli.evaluate(() => document.body.innerText);
  ok(!pt.includes('Aprovado em') && !pt.includes('Encanador'), 'sem o selo antigo no topo, e sem Encanador, que não passou');
  ok(pt.includes('Profissional de Ouro'), 'mostra Profissional de Ouro');
  await cli.screenshot({ path: `${SHOTS}entrada-13-perfil.png` });
  await cli.evaluate(() => [...document.querySelectorAll('[role="button"]')].find((e) => e.innerText.trim() === 'Profissional de Ouro')?.click());
  try { await cli.waitForFunction(() => document.body.innerText.includes('As aulas são opcionais. Ele fez porque quis.'), { timeout: 10000, polling: 200 }); ok(true, 'tocar na marca explica o que ela quer dizer'); } catch { ok(false, 'tocar na marca explica o que ela quer dizer'); }
  await sleep(600); await cli.screenshot({ path: `${SHOTS}entrada-14-ouro.png` });

  ok(errors.length === 0, `sem erros na página${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();

  // Volta ao profissional liberado nos dois serviços, como as outras suítes esperam.
  sql(`update public.professional_services set approved_at = now() where professional_id = '${proId}';
       update public.professionals set verified = true, lessons_done_at = coalesce(lessons_done_at, now()) where id = '${proId}';
       delete from private.quiz_attempts where professional_id = '${proId}';
       delete from private.lesson_attempts where professional_id = '${proId}';
       update public.professionals set gold_at = null where id = '${proId}';`);

  console.log(`\n${pass} ok, ${fail} falhas`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
