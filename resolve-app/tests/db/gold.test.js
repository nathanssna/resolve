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

  const as = async (uid, sql, params = []) => {
    await db.query('begin');
    try {
      await db.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`, [uid ?? '', JSON.stringify({ sub: uid, aal: 'aal1' })]);
      const r = await db.query(sql, params); await db.query('commit'); return r;
    } catch (e) { await db.query('rollback'); return { error: e.message, rows: [], rowCount: 0 }; }
  };
  const one = async (uid, sql, params) => { const r = await as(uid, sql, params); if (r.error) throw new Error(r.error); return r.rows[0]; };
  const signup = async (name, role = 'cliente') => (await db.query('insert into auth.users (raw_user_meta_data) values ($1) returning id', [{ full_name: name, role }])).rows[0].id;
  const pro = await signup('Marcos Pereira', 'profissional');
  await as(pro, "insert into public.professional_services values ($1, 'encanador')", [pro]);
  await as(pro, "select public.register_push_token('ExponentPushToken[pro]', 'ios')");

  // Um serviço inteiro com um cliente novo: combinado, feito, confirmado e avaliado.
  let n = 0;
  const job = async (stars = 5, onTime = true) => {
    const cli = await signup(`Cliente ${++n}`);
    const conv = (await one(cli, 'select id from public.open_conversation($1)', [pro])).id;
    const req = (await one(cli, "select request_id from public.create_request($1, 'encanador', 'Torneira', 'Hoje')", [conv])).request_id;
    const prop = (await one(pro, "insert into public.proposals (conversation_id, request_id, amount, scheduled_label, scheduled_at) values ($1, $2, 150, 'x', now() + interval '2 hours') returning id", [conv, req])).id;
    const order = (await one(cli, 'select * from public.accept_proposal($1)', [prop])).id;
    await db.query("update public.orders set scheduled_at = now() - interval '1 hour' where id = $1", [order]);
    await one(pro, 'select * from public.mark_order_done($1)', [order]);
    await one(cli, 'select * from public.confirm_order_done($1, true)', [order]);
    await one(cli, 'select 1 x from public.rate_order($1, $2, null, $3)', [order, stars, onTime]);
    return order;
  };
  const gold = async () => !!(await as(null, 'select gold_at from public.professionals where id = $1', [pro])).rows[0]?.gold_at;
  const progress = async () => (await as(pro, 'select * from public.gold_progress()')).rows[0];
  const calls = async () => (await db.query('select count(*)::int n from net.calls')).rows[0].n;
  const pushesSince = async (id) => (await db.query('select body from net.calls where id > $1', [id])).rows.map((r) => JSON.stringify(r.body));
  const refreshAll = () => db.query('select private.refresh_all_gold()');

  console.log('\nAs etapas');
  await db.query('update public.professionals set lessons_done_at = now() where id = $1', [pro]);
  const p0 = await progress();
  ok(p0 && p0.lessons_done && p0.jobs_done === 0 && p0.jobs_needed === 10 && Number(p0.rating_needed) === 4.7 && p0.reviews_needed === 5, 'progresso: aulas feitas, 0 de 10 serviços, nota 4,7 com 5 avaliações');
  ok(!(await gold()), 'só as aulas: não é Profissional de Ouro');
  const cli0 = await signup('Curioso');
  ok(!!(await as(cli0, 'select * from public.gold_progress()')).error, 'cliente não consulta o progresso');
  for (let i = 0; i < 9; i++) await job();
  ok(!(await gold()), '9 serviços nota 5, no horário: ainda não');
  const c0 = await calls();
  await job();
  ok(await gold(), '10º serviço: vira Profissional de Ouro');
  const got = await pushesSince(c0);
  ok(got.filter((b) => b.includes('Você é Profissional de Ouro')).length === 1, 'e recebe o aviso uma vez');
  const p1 = await progress();
  ok(p1.gold && p1.jobs_done === 10 && Number(p1.rating) === 5 && p1.on_time_yes === 10 && p1.on_time_answers === 10, 'progresso: tudo cumprido');

  console.log('\nSem as aulas, não');
  await db.query('update public.professionals set lessons_done_at = null where id = $1', [pro]);
  const c1 = await calls();
  await refreshAll();
  ok(!(await gold()), 'sem as aulas: perde a marca');
  ok((await pushesSince(c1)).some((b) => b.includes('saiu do seu perfil')), 'e é avisado de que a marca saiu');
  await db.query('update public.professionals set lessons_done_at = now() where id = $1', [pro]);
  await refreshAll();
  ok(await gold(), 'aulas de volta: a marca volta');

  console.log('\nPontualidade');
  await job(5, false);
  ok(await gold(), '10 de 11 no horário (91%): continua');
  await job(5, false);
  ok(!(await gold()), '10 de 12 no horário (83%): perde');
  await db.query('update public.reviews set on_time = true where professional_id = $1', [pro]);
  await refreshAll();
  ok(await gold(), 'pontualidade recuperada: volta');
  const late = (await db.query('select id from public.orders where professional_id = $1 order by created_at limit 1', [pro])).rows[0].id;
  await db.query('update public.orders set canceled_late = true, canceled_by = professional_id where id = $1', [late]);
  await refreshAll();
  ok(!(await gold()), '1 cancelamento em cima da hora em 12 serviços (8%): perde');
  await db.query("update public.orders set created_at = now() - interval '100 days' where id = $1", [late]);
  await refreshAll();
  ok(await gold(), 'passados 90 dias, o cancelamento sai da conta e a marca volta');

  console.log('\nNota');
  await db.query('update public.reviews set rating = 1 where id = (select id from public.reviews where professional_id = $1 order by created_at limit 1)', [pro]);
  await refreshAll();
  ok(!(await gold()), 'média abaixo de 4,7: perde');
  const p2 = await progress();
  ok(Number(p2.rating) < 4.7 && !p2.gold, 'o progresso mostra a nota que falta');

  console.log('\nAvaliação');
  ok((await as(null, 'select on_time from public.reviews')).error || (await as(null, 'select on_time from public.reviews')).rows.length === 0, 'anon não lê as respostas de pontualidade');
  const cli1 = await signup('Sem resposta');
  ok(!(await as(cli1, 'select public.rate_order(gen_random_uuid(), 5)')).error?.includes('function'), 'rate_order antigo (sem pontualidade) continua aceito');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
