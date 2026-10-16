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
  const at = async (days, hour) => (await db.query(`select (((now() at time zone 'America/Sao_Paulo')::date + $1::int) + make_time($2, 0, 0)) at time zone 'America/Sao_Paulo' as t`, [days, hour])).rows[0].t;
  const deal = async (cli, days, hour) => {
    const conv = (await one(cli, 'select id from public.open_conversation($1)', [pro])).id;
    const req = (await one(cli, "select request_id from public.create_request($1, 'encanador', 'Torneira', 'Hoje')", [conv])).request_id;
    const prop = (await one(pro, "insert into public.proposals (conversation_id, request_id, amount, scheduled_label, scheduled_at) values ($1, $2, 150, 'x', now() + interval '1 day') returning id", [conv, req])).id;
    const order = await one(cli, 'select * from public.accept_proposal($1)', [prop]);
    await db.query('update public.orders set scheduled_at = $2 where id = $1', [order.id, await at(days, hour)]);
    return { order: order.id, conv };
  };
  const confirm = (uid, id) => as(uid, 'select * from public.confirm_service_day($1)', [id]);
  const row = async (id) => (await db.query('select * from public.orders where id = $1', [id])).rows[0];
  const notes = async (conv) => (await db.query("select body from public.messages where conversation_id = $1 and kind = 'system' and body like '%confirmou%' order by created_at, id", [conv])).rows.map((r) => r.body);

  console.log('\nNo dia do serviço');
  const ana = await signup('Ana Souza');
  const sa = await deal(ana, 0, 13);
  ok(!(await confirm(ana, sa.order)).error, 'cliente confirma');
  ok(!!(await row(sa.order)).client_confirmed_at && !(await row(sa.order)).pro_confirmed_at, 'grava só a confirmação do cliente');
  ok(!(await confirm(pro, sa.order)).error, 'profissional confirma');
  ok(!!(await row(sa.order)).pro_confirmed_at, 'grava a do profissional');
  ok((await notes(sa.conv)).join(' | ') === 'Ana confirmou: hoje à tarde. | Marcos confirmou: hoje à tarde.', `aviso no chat: ${(await notes(sa.conv)).join(' | ')}`);
  ok(!(await confirm(ana, sa.order)).error && (await notes(sa.conv)).length === 2, 'confirmar de novo não repete o aviso');

  console.log('\nQuando não dá');
  const bia = await signup('Bia Lima');
  const b = await deal(bia, 1, 8);
  ok((await confirm(bia, b.order)).error?.includes('Dá para confirmar só no dia do serviço'), 'amanhã: ainda não');
  ok((await confirm(ana, b.order)).error?.includes('Pedido não encontrado'), 'quem não participa: não');
  ok((await confirm(null, b.order)).error, 'sem login: não');
  const c = await deal(bia, 0, 18);
  await as(bia, "select public.cancel_order($1, 'Imprevisto')", [c.order]);
  ok((await confirm(pro, c.order)).error?.includes('não está mais combinado'), 'cancelado: não');
  const direct = await as(bia, 'update public.orders set client_confirmed_at = now() where id = $1 returning id', [b.order]);
  ok((!!direct.error || direct.rowCount === 0) && !(await row(b.order)).client_confirmed_at, 'sem gravar direto na tabela');

  console.log('\nRemarcado: zera');
  const d = await deal(ana, 0, 8);
  await confirm(ana, d.order); await confirm(pro, d.order);
  await db.query('update public.orders set scheduled_at = scheduled_at + interval \'1 day\' where id = $1', [d.order]);
  const after = await row(d.order);
  ok(!after.client_confirmed_at && !after.pro_confirmed_at, 'data nova: as duas confirmações voltam a zero');
  await db.query('update public.orders set amount = 200 where id = $1', [d.order]);
  await db.query('update public.orders set scheduled_at = scheduled_at - interval \'1 day\' where id = $1', [d.order]);
  await confirm(pro, d.order);
  await db.query('update public.orders set amount = 210 where id = $1', [d.order]);
  ok(!!(await row(d.order)).pro_confirmed_at, 'outra mudança no serviço não zera');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
