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
  ok(before.verified && !before.released_at, 'identidade + teste ainda não liberam: faltam as aulas');
  ok(!(await visible(cli, 'eletricista')), 'sem as aulas, o cliente não vê');

  console.log('\nAulas');
  ok(!!(await as(cli, "select public.complete_lesson('orcamento')")).error, 'cliente não faz aula');
  ok(!!(await as(pro, "select public.complete_lesson('inventada')")).error, 'aula que não existe é recusada');
  ok(!!(await as(pro, "insert into public.lesson_progress (professional_id, lesson_id) values ($1, 'fotos')", [pro])).error, 'não dá para marcar aula direto na tabela');
  const l1 = (await as(pro, "select public.complete_lesson('orcamento') as r")).rows[0]?.r;
  ok(l1 && l1.done === 1 && l1.total === 5 && !l1.released, '1 de 5');
  ok((await as(pro, "select public.complete_lesson('orcamento') as r")).rows[0]?.r.done === 1, 'repetir a mesma aula não conta duas vezes');
  ok((await as(other, 'select * from public.lesson_progress')).rows.length === 0, 'outro profissional não vê o progresso dele');
  for (const id of ['fotos', 'chat', 'data']) await as(pro, 'select public.complete_lesson($1)', [id]);
  const l5 = (await as(pro, "select public.complete_lesson('mei') as r")).rows[0]?.r;
  ok(l5 && l5.done === 5 && l5.released === true, 'quinta aula: liberado');
  const pros = (await db.query('select verified, released_at, lessons_done_at from public.professionals where id = $1', [pro])).rows[0];
  ok(pros.verified && pros.released_at && pros.lessons_done_at, 'identidade + teste + aulas = liberado');
  const pushes = (await db.query('select body from net.calls where id > $1', [calls0])).rows.map((r) => JSON.stringify(r.body));
  ok(pushes.length === 2 && pushes[0].includes('Falta pouco'), 'identidade aprovada sem as aulas: "Falta pouco"');
  ok(pushes.filter((b) => b.includes('Pronto, você foi liberado') && b.includes('Eletricista')).length === 1, 'e um aviso só de "Pronto, você foi liberado"');
  ok(await visible(cli, 'eletricista'), 'cliente vê Elétrica');
  ok(!(await visible(cli, 'encanador')), 'mas não vê Encanador, que ainda não passou');
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
