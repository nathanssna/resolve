const fs = require('fs'); const { Client } = require('pg');
const APP = require('path').resolve(__dirname, '../../supabase');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ok   ' : '  FALHA', m); };
(async () => {
  const a = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'postgres' }); await a.connect();
  await a.query('drop database if exists e'); await a.query('create database e'); await a.end();
  const db = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'e' }); await db.connect();
  const run = (f) => db.query(fs.readFileSync(f, 'utf8').replace(/create extension if not exists pg_net;/, ''));
  await run(__dirname + '/bootstrap.sql');
  for (const m of fs.readdirSync(`${APP}/migrations`).sort()) await run(`${APP}/migrations/${m}`);
  await run(`${APP}/seed.sql`);
  await run(`${APP}/quiz.sql`);
  // Esta suíte testa a regra de verdade.
  await db.query("set rezolveae.skip_qualification = 'off'");

  const as = async (uid, sql, params = []) => {
    await db.query('begin');
    try {
      await db.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
      const r = await db.query(sql, params); await db.query('commit'); return r;
    } catch (e) { await db.query('rollback'); return { error: e.message, rows: [], rowCount: 0 }; }
  };
  const signup = async (name, role = 'cliente') => (await db.query('insert into auth.users (raw_user_meta_data) values ($1) returning id', [{ full_name: name, role }])).rows[0].id;
  const cli = await signup('Ana Souza'); const pro = await signup('Carlos Souza', 'profissional'); const other = await signup('Outro Pro', 'profissional');
  await as(pro, "insert into public.professional_services (professional_id, service_id) values ($1, 'eletricista'), ($1, 'encanador')", [pro]);

  const start = (uid, svc) => as(uid, 'select public.start_quiz($1) as p', [svc]);
  const submit = (uid, id, answers) => as(uid, 'select public.submit_quiz($1, $2) as r', [id, answers]);
  const orders = async (id) => (await db.query('select orders from private.quiz_attempts where id = $1', [id])).rows[0].orders;
  const right = async (id) => (await orders(id)).map((o) => o.indexOf(0));
  const wrong = async (id) => (await orders(id)).map((o) => o.findIndex((x) => x !== 0));
  const status = async (uid, svc) => (await as(uid, 'select * from public.quiz_status()')).rows.find((r) => r.service_id === svc);
  const visible = async (uid, svc) => (await as(uid, 'select 1 from public.professional_services where professional_id = $1 and service_id = $2', [pro, svc])).rowCount === 1;

  console.log('\nAs questões não vazam');
  ok(!!(await as(cli, 'select * from private.quiz_questions')).error, 'cliente não lê o banco de questões');
  ok(!!(await as(pro, 'select * from private.quiz_questions')).error, 'profissional não lê o banco de questões');
  ok(!!(await as(pro, 'select * from private.quiz_attempts')).error, 'nem as tentativas com o gabarito');
  ok((await as(null, "select draw, pass from public.quiz_tests where service_id = 'eletricista'")).rows[0]?.pass === 14, 'as regras do teste são públicas (20 questões, passa com 14)');
  ok((await db.query('select count(*)::int n from public.quiz_tests')).rows[0].n === 10, 'os 10 serviços têm teste');

  console.log('\nSem teste e sem identidade, não aparece');
  ok(!(await visible(cli, 'eletricista')), 'cliente não vê o serviço de quem não passou');
  ok(await visible(pro, 'eletricista'), 'o profissional vê os próprios serviços');
  const conv0 = await as(cli, 'select id from public.open_conversation($1)', [pro]);
  ok(conv0.error?.includes('ainda não está liberado'), `cliente não abre conversa: ${conv0.error}`);
  const s0 = await status(pro, 'eletricista');
  ok(s0 && s0.available && s0.draw === 20 && !s0.approved_at && !s0.retry_at, 'situação: teste disponível, ainda não feito');
  ok((await as(cli, 'select * from public.quiz_status()')).rows.length === 0, 'cliente não tem testes');
  ok(!!(await as(null, 'select * from public.quiz_status()')).error, 'anon não consulta');

  console.log('\nComeçar o teste');
  ok((await start(pro, 'pintor')).error?.includes('ficha'), 'não faz teste de serviço fora da ficha');
  const t1 = await start(pro, 'eletricista'); const p1 = t1.rows[0]?.p;
  ok(p1 && p1.questions.length === 20 && p1.total === 20 && p1.pass === 14, 'sorteia 20 questões');
  ok(p1.questions.every((x) => x.options.length === 4 && x.source && x.question), 'cada questão com 4 alternativas e a fonte');
  const raw = JSON.stringify(p1);
  ok(!raw.includes('"why"') && !raw.includes('"orders"') && !raw.includes('"topic"'), 'nada indica a resposta certa');
  const ids = (await db.query('select question_ids from private.quiz_attempts where id = $1', [p1.attempt_id])).rows[0].question_ids;
  ok(new Set(ids).size === 20, 'sem questão repetida');
  const topics = (await db.query('select count(distinct topic)::int n from private.quiz_questions where id = any($1)', [ids])).rows[0].n;
  const allTopics = (await db.query("select count(distinct topic)::int n from private.quiz_questions where service_id = 'eletricista' and active")).rows[0].n;
  ok(topics === allTopics, `espalha pelos assuntos (${topics} de ${allTopics})`);
  ok((await start(pro, 'eletricista')).rows[0]?.p.attempt_id === p1.attempt_id, 'saiu e voltou: mesma tentativa, mesmas questões');
  ok((await status(pro, 'eletricista')).open_attempt === p1.attempt_id, 'situação mostra o teste em andamento');

  console.log('\nResponder');
  ok(!!(await submit(other, p1.attempt_id, await right(p1.attempt_id))).error, 'outro profissional não responde por ele');
  ok((await submit(pro, p1.attempt_id, [0, 1, 2])).error?.includes('todas'), 'precisa responder todas');
  const r1 = (await submit(pro, p1.attempt_id, await wrong(p1.attempt_id))).rows[0]?.r;
  ok(r1 && r1.score === 0 && r1.passed === false && r1.retry_at, 'tudo errado: reprova');
  ok((await submit(pro, p1.attempt_id, await right(p1.attempt_id))).error?.includes('encerrado'), 'não responde de novo o mesmo teste');
  const again = await start(pro, 'eletricista');
  ok(again.error?.includes('a partir de'), `espera para tentar de novo: ${again.error}`);
  const s1 = await status(pro, 'eletricista');
  ok(s1.last_score === 0 && s1.retry_at && !s1.open_attempt, 'situação mostra a nota e quando pode tentar');

  console.log('\nTentar de novo e passar');
  await db.query("update private.quiz_attempts set finished_at = now() - interval '4 days' where id = $1", [p1.attempt_id]);
  const p2 = (await start(pro, 'eletricista')).rows[0]?.p;
  ok(p2 && p2.attempt_id !== p1.attempt_id, 'depois de 3 dias, nova tentativa');
  const ans = await right(p2.attempt_id); ans[0] = (ans[0] + 1) % 4; ans[1] = (ans[1] + 1) % 4;
  const r2 = (await submit(pro, p2.attempt_id, ans)).rows[0]?.r;
  ok(r2 && r2.score === 18 && r2.passed && !r2.retry_at, `18 de 20: passa (${r2?.score})`);
  ok(r2.released === false, 'ainda não liberado: falta a identidade');
  ok(!!(await status(pro, 'eletricista')).approved_at, 'serviço aprovado');
  ok((await start(pro, 'eletricista')).error?.includes('já passou'), 'não refaz teste aprovado');
  ok(!(await visible(cli, 'eletricista')), 'sem identidade confirmada, o cliente ainda não vê');

  console.log('\nIdentidade confirmada: liberado');
  const v = await as(pro, 'insert into public.verifications (document_path, selfie_path) values ($1, $2) returning id', [`${pro}/a.jpg`, `${pro}/b.jpg`]);
  await db.query("insert into public.push_tokens (user_id, token, platform) values ($1, 'ExponentPushToken[carlos]', 'android')", [pro]);
  const calls0 = (await db.query('select count(*)::int n from net.calls')).rows[0].n;
  await db.query("update public.verifications set status = 'approved' where id = $1", [v.rows[0].id]);
  const before = (await db.query('select verified, released_at from public.professionals where id = $1', [pro])).rows[0];
  ok(before.verified && before.released_at, 'identidade + teste = liberado, sem precisar das aulas');
  const pushes = (await db.query('select body from net.calls where id > $1', [calls0])).rows.map((r) => JSON.stringify(r.body));
  ok(pushes.length === 1 && pushes[0].includes('Pronto, você foi liberado') && pushes[0].includes('Eletricista'), 'um aviso só: "Pronto, você foi liberado"');
  ok(await visible(cli, 'eletricista'), 'cliente vê Elétrica');
  ok(!(await visible(cli, 'encanador')), 'mas não vê Encanador, que ainda não passou');
  ok((await as(cli, 'select lessons_done_at from public.professionals where id = $1', [pro])).rows[0]?.lessons_done_at === null, 'ainda não fez as aulas');

  console.log('\nAulas (opcionais): perguntas no servidor e Profissional de Ouro');
  const startL = (uid, id) => as(uid, 'select public.start_lesson_quiz($1) as p', [id]);
  const submitL = (uid, id, answers) => as(uid, 'select public.submit_lesson_quiz($1, $2) as r', [id, answers]);
  const lorders = async (id) => (await db.query('select orders from private.lesson_attempts where id = $1', [id])).rows[0].orders;
  const lright = async (id) => (await lorders(id)).map((o) => o.indexOf(0));
  const lwrong = async (id) => (await lorders(id)).map((o) => o.findIndex((x) => x !== 0));
  ok(!!(await as(pro, 'select public.complete_lesson($1)', ['orcamento'])).error, 'complete_lesson não existe mais: o app não conclui aula sozinho');
  ok(!!(await as(pro, 'select * from private.lesson_questions')).error, 'profissional não lê o gabarito das aulas');
  ok(!!(await startL(cli, 'orcamento')).error, 'cliente não faz aula');
  ok(!!(await startL(pro, 'inventada')).error, 'aula que não existe é recusada');
  ok(!!(await as(pro, "insert into public.lesson_progress (professional_id, lesson_id) values ($1, 'fotos')", [pro])).error, 'não dá para marcar aula direto na tabela');
  const a1 = (await startL(pro, 'orcamento')).rows[0]?.p;
  ok(a1 && a1.questions.length === 8 && a1.pass === 7, '8 perguntas, passa com 7');
  ok(!JSON.stringify(a1).includes('"why"') && !JSON.stringify(a1).includes('"orders"'), 'nada indica a resposta certa');
  ok((await startL(pro, 'orcamento')).rows[0]?.p.attempt_id === a1.attempt_id, 'saiu e voltou: as mesmas perguntas');
  ok((await submitL(pro, a1.attempt_id, [0, 1])).error?.includes('todas'), 'precisa responder todas');
  const six = await lright(a1.attempt_id); six[0] = (six[0] + 1) % 4; six[5] = (six[5] + 1) % 4;
  const f1 = (await submitL(pro, a1.attempt_id, six)).rows[0]?.r;
  ok(f1 && f1.score === 6 && !f1.passed && f1.retry_at, '6 de 8: não conclui');
  ok(JSON.stringify(f1.wrong) === '[0,5]', `diz quais errou (${JSON.stringify(f1.wrong)}), sem dar a resposta`);
  const wait = (await db.query('select extract(epoch from $1::timestamptz - finished_at) / 86400 as d from private.lesson_attempts where id = $2', [f1.retry_at, a1.attempt_id])).rows[0].d;
  ok(Math.round(wait) === 3, `espera 3 dias (${Math.round(wait)})`);
  ok((await startL(pro, 'orcamento')).error?.includes('a partir de'), 'antes de 3 dias não responde de novo');
  const st = (await as(pro, 'select * from public.lesson_status()')).rows.find((r) => r.lesson_id === 'orcamento');
  ok(st && !st.completed_at && st.retry_at, 'situação mostra até quando espera');
  ok((await as(other, 'select * from public.lesson_progress')).rows.length === 0, 'outro profissional não vê o progresso dele');
  ok(!!(await submitL(other, a1.attempt_id, six)).error, 'nem responde por ele');
  await db.query("update private.lesson_attempts set finished_at = now() - interval '4 days' where id = $1", [a1.attempt_id]);
  const a2 = (await startL(pro, 'orcamento')).rows[0]?.p;
  ok(a2 && a2.attempt_id !== a1.attempt_id, 'depois de 3 dias, responde de novo');
  const seven = await lright(a2.attempt_id); seven[3] = (seven[3] + 1) % 4;
  const r7 = (await submitL(pro, a2.attempt_id, seven)).rows[0]?.r;
  ok(r7 && r7.passed && r7.score === 7 && r7.done === 1 && r7.lessons === 5 && !r7.gold, '7 de 8: aula concluída (1 de 5)');
  ok((await startL(pro, 'orcamento')).error?.includes('já concluiu'), 'aula concluída não se responde de novo');
  for (const id of ['fotos', 'chat', 'data']) {
    const a = (await startL(pro, id)).rows[0].p;
    await submitL(pro, a.attempt_id, await lright(a.attempt_id));
  }
  const calls1 = (await db.query('select count(*)::int n from net.calls')).rows[0].n;
  const a5 = (await startL(pro, 'mei')).rows[0].p;
  const l5 = (await submitL(pro, a5.attempt_id, await lright(a5.attempt_id))).rows[0]?.r;
  ok(l5 && l5.passed && l5.done === 5 && l5.gold === false, 'quinta aula: aulas concluídas, mas só isso não dá o Ouro');
  const g = (await as(cli, 'select lessons_done_at, gold_at from public.professionals where id = $1', [pro])).rows[0];
  ok(g && g.lessons_done_at && !g.gold_at, 'aulas registradas (empurrão na lista), sem a marca');
  ok((await db.query('select count(*)::int n from net.calls where id > $1', [calls1])).rows[0].n === 0, 'sem aviso de Ouro');
  const o1 = (await startL(other, 'orcamento')).rows[0].p;
  ok(!(await submitL(other, o1.attempt_id, await lwrong(o1.attempt_id))).rows[0]?.r.passed, 'tudo errado não conclui');
  const conv = await as(cli, 'select id from public.open_conversation($1)', [pro]);
  ok(!conv.error, 'cliente abre conversa');
  const cid = conv.rows[0]?.id;
  ok(!(await as(cli, "select request_id from public.create_request($1, 'eletricista', 'Tomada sem energia', 'Hoje')", [cid])).error, 'pede orçamento de Elétrica');
  const rq = await as(cli, "select request_id from public.create_request($1, 'encanador', 'Torneira pingando', 'Hoje')", [cid]);
  ok(rq.error?.includes('não atende'), `não pede Encanador antes de ele passar: ${rq.error}`);

  console.log('\nRegras de proteção');
  const p3 = (await start(pro, 'encanador')).rows[0]?.p;
  await db.query("update private.quiz_attempts set deadline_at = now() - interval '5 minutes' where id = $1", [p3.attempt_id]);
  const r3 = (await submit(pro, p3.attempt_id, await right(p3.attempt_id))).rows[0]?.r;
  ok(r3 && r3.passed === false && r3.late === true, 'resposta depois do tempo não aprova, mesmo certa');
  await as(pro, "delete from public.professional_services where professional_id = $1 and service_id = 'eletricista'", [pro]);
  await as(pro, "insert into public.professional_services (professional_id, service_id) values ($1, 'eletricista')", [pro]);
  ok(await visible(cli, 'eletricista'), 'tirou e pôs o serviço de volta: a aprovação continua');
  await as(pro, "insert into public.professional_services (professional_id, service_id, approved_at) values ($1, 'pintor', now())", [pro]);
  ok(!(await visible(cli, 'pintor')), 'não dá para se aprovar sozinho pela ficha');
  ok((await as(pro, "update public.professional_services set approved_at = now() where professional_id = $1 and service_id = 'encanador'", [pro])).rowCount === 0 || !(await visible(cli, 'encanador')), 'nem editando o serviço');

  console.log('\nTentativa abandonada');
  await db.query("update private.quiz_attempts set finished_at = now() - interval '4 days' where id = $1", [p3.attempt_id]);
  const p4 = (await start(pro, 'encanador')).rows[0]?.p;
  await db.query("update private.quiz_attempts set deadline_at = now() - interval '5 minutes' where id = $1", [p4.attempt_id]);
  const s4 = await status(pro, 'encanador');
  ok(!s4.open_attempt && s4.retry_at, 'passou do tempo sem responder: conta como reprovado');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
