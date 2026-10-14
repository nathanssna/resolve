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
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
      const r = await db.query(sql, params); await db.query('commit'); return r;
    } catch (e) { await db.query('rollback'); return { error: e.message, rows: [], rowCount: 0 }; }
  };
  const one = async (uid, sql, params) => { const r = await as(uid, sql, params); if (r.error) throw new Error(r.error); return r.rows[0]; };
  const signup = async (name, role = 'cliente') => (await db.query('insert into auth.users (raw_user_meta_data) values ($1) returning id', [{ full_name: name, role }])).rows[0].id;
  const pro = await signup('Marcos Pereira', 'profissional');
  await as(pro, "insert into public.professional_services values ($1, 'encanador')", [pro]);
  // Serviço combinado com início daqui a `hours` horas (null = proposta antiga, sem data).
  const deal = async (cli, hours) => {
    const conv = (await one(cli, 'select id from public.open_conversation($1)', [pro])).id;
    const req = (await one(cli, "select request_id from public.create_request($1, 'encanador', 'Torneira', 'Hoje')", [conv])).request_id;
    const prop = (await one(pro, `insert into public.proposals (conversation_id, request_id, amount, scheduled_label, scheduled_at)
      values ($1, $2, 150, 'Sex 17/10, tarde', ${hours === null ? 'null' : `now() + make_interval(hours => ${hours})`}) returning id`, [conv, req])).id;
    const order = await one(cli, 'select * from public.accept_proposal($1)', [prop]);
    return { order: order.id, conv };
  };
  const cancel = (uid, order, reason) => as(uid, 'select canceled_late, cancel_reason from public.cancel_order($1, $2)', [order, reason ?? null]);
  const lastNote = async (conv) => (await db.query("select body from public.messages where conversation_id = $1 and kind = 'system' order by created_at desc, id desc limit 1", [conv])).rows[0]?.body;

  console.log('\nCliente cancela');
  const ana = await signup('Ana Souza');
  let d = await deal(ana, 30);
  let r = await cancel(ana, d.order);
  ok(!r.error && r.rows[0]?.canceled_late === false, 'faltando 30 h: cancela sem motivo, sem consequência');
  ok((await lastNote(d.conv)) === 'Serviço cancelado pelo cliente', `aviso no chat: "${await lastNote(d.conv)}"`);
  d = await deal(ana, 5);
  r = await cancel(ana, d.order);
  ok(r.error?.includes('Conte o motivo do cancelamento'), 'faltando 5 h sem motivo: recusado');
  r = await cancel(ana, d.order, '   ');
  ok(r.error?.includes('Conte o motivo'), 'motivo só com espaços: recusado');
  r = await cancel(ana, d.order, 'Imprevisto no trabalho');
  ok(!r.error && r.rows[0]?.canceled_late === true && r.rows[0]?.cancel_reason === 'Imprevisto no trabalho', 'com motivo: cancelado e marcado em cima da hora');
  ok((await lastNote(d.conv)) === 'Serviço cancelado em cima da hora pelo cliente: Imprevisto no trabalho', 'aviso no chat com o motivo');
  d = await deal(ana, -30);
  r = await cancel(ana, d.order);
  ok(!r.error && r.rows[0]?.canceled_late === false, 'serviço de ontem: cancelar não conta (o dia já passou)');
  d = await deal(ana, null);
  r = await cancel(ana, d.order);
  ok(!r.error && r.rows[0]?.canceled_late === false, 'proposta antiga, sem data: nunca conta');
  d = await deal(ana, 30);
  r = await cancel(ana, d.order, 'Mudei de ideia');
  ok((await lastNote(d.conv)) === 'Serviço cancelado pelo cliente: Mudei de ideia', 'no prazo, motivo opcional também vai para o chat');

  console.log('\nHistórico do cliente (para o profissional)');
  await db.query("update public.orders set status = 'concluido', completed_at = now() where id = (select o.id from public.orders o where o.client_id = $1 and o.status = 'cancelado' limit 1)", [ana]);
  const rec = (await as(pro, 'select * from public.client_track_record($1)', [ana])).rows[0];
  ok(rec?.done === 1 && rec?.late_cancels === 1, `profissional que conversa com ela vê: ${JSON.stringify(rec)}`);
  const stranger = await signup('Outro Pro', 'profissional');
  ok((await as(stranger, 'select * from public.client_track_record($1)', [ana])).rows.length === 0, 'profissional sem conversa com ela não vê nada');
  ok((await as(ana, 'select * from public.client_track_record($1)', [ana])).rows.length === 0, 'a própria cliente não consulta pela função');
  ok(!!(await as(null, 'select * from public.client_track_record($1)', [ana])).error, 'anon não consulta');

  console.log('\nProfissional cancela em cima da hora');
  const bia = await signup('Bia Lima');
  for (let i = 1; i <= 2; i++) {
    d = await deal(bia, 3);
    await cancel(pro, d.order, `Imprevisto ${i}`);
  }
  ok((await as(pro, 'select public.my_pause_until() t')).rows[0]?.t === null, 'dois em 30 dias: ainda recebe pedidos');
  ok((await lastNote(d.conv)) === 'Serviço cancelado em cima da hora pelo profissional: Imprevisto 2', 'aviso do profissional no chat');
  d = await deal(bia, 3);
  await cancel(pro, d.order, 'Imprevisto 3');
  const paused = (await db.query('select paused, paused_until from public.professionals where id = $1', [pro])).rows[0];
  const days = (Date.parse(paused.paused_until) - Date.now()) / 86400000;
  ok(paused.paused && days > 6.9 && days < 7.1, `terceiro em 30 dias: pausado por 7 dias (${days.toFixed(2)})`);
  ok(!!(await as(pro, 'select public.my_pause_until() t')).rows[0]?.t, 'o profissional vê até quando');
  const unpause = await as(pro, 'update public.professionals set paused = false where id = $1', [pro]);
  ok(unpause.error?.includes('Sua conta está pausada até'), `não consegue voltar antes: ${unpause.error}`);
  ok(!!(await as(pro, 'update public.professionals set paused_until = null where id = $1', [pro])).error, 'nem apagar a data da pausa');
  ok((await as(bia, 'select * from public.open_conversation($1)', [pro])).error === undefined, 'conversa que já existe continua abrindo');
  ok(!!(await as(bia, "select public.create_request(id, 'encanador', 'Outro', 'Hoje') from public.conversations where client_id = $1", [bia])).error, 'pausado: não recebe pedido novo');

  console.log('\nFim da pausa');
  ok((await db.query('select private.end_suspensions() n')).rows[0].n === 0, 'antes da hora, o job não mexe');
  await db.query("update public.professionals set paused_until = now() - interval '1 minute' where id = $1", [pro]);
  ok((await db.query('select private.end_suspensions() n')).rows[0].n === 1, 'passados os 7 dias, o job encerra a pausa');
  const after = (await db.query('select paused, paused_until from public.professionals where id = $1', [pro])).rows[0];
  ok(!after.paused && after.paused_until === null, 'volta a receber pedidos');
  ok(!(await as(pro, 'update public.professionals set paused = true where id = $1', [pro])).error && !(await as(pro, 'update public.professionals set paused = false where id = $1', [pro])).error, 'pausa manual volta a funcionar normalmente');
  const job = (await db.query("select schedule from cron.job where jobname = 'fim-da-pausa'")).rows[0];
  ok(job?.schedule === '0 * * * *', 'job de hora em hora');

  console.log('\nTaxa no perfil público');
  const rel = (await as(null, 'select * from public.professional_reliability($1)', [pro])).rows[0];
  ok(rel?.orders_90d === 8 && rel?.late_cancels_90d === 3, `qualquer um vê os números agregados: ${JSON.stringify(rel)}`);

  console.log('\nOutros');
  ok(!!(await as(bia, 'select public.cancel_order($1)', [d.order])).error, 'serviço já cancelado não cancela de novo');
  ok(!!(await as(stranger, 'select public.cancel_order($1, $2)', [d.order, 'x'])).error, 'estranho não cancela');
  const cid = await signup('Cid Rocha');
  d = await deal(cid, 30);
  ok(!(await as(cid, 'select public.cancel_order($1)', [d.order])).error, 'chamada antiga, só com o id, continua funcionando');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
