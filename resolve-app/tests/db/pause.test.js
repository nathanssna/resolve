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
  const signup = async (name, role = 'cliente') => (await db.query('insert into auth.users (raw_user_meta_data) values ($1) returning id', [{ full_name: name, role }])).rows[0].id;
  const cli = await signup('Ana Souza'); const novo = await signup('Bruno Novo'); const pro = await signup('Pro Real', 'profissional'); const other = await signup('Outro Pro', 'profissional');
  await as(pro, "insert into public.professional_services values ($1, 'encanador')", [pro]);
  const open = (uid) => as(uid, 'select id from public.open_conversation($1)', [pro]);
  const request = (uid, conv) => as(uid, "select request_id from public.create_request($1, 'encanador', 'Torneira pingando', 'Hoje')", [conv]);
  const paused = async () => (await db.query('select paused from public.professionals where id = $1', [pro])).rows[0].paused;
  const MSG = 'Este profissional não está recebendo pedidos no momento';

  console.log('\nQuem pausa');
  const conv = (await open(cli)).rows[0].id;
  const r1 = (await request(cli, conv)).rows[0].request_id;
  ok(!(await paused()), 'começa recebendo pedidos');
  ok((await as(other, 'update public.professionals set paused = true where id = $1', [pro])).rowCount === 0 && !(await paused()), 'outro profissional não pausa por ele');
  ok((await as(cli, 'update public.professionals set paused = true where id = $1', [pro])).rowCount === 0 && !(await paused()), 'cliente não pausa o profissional');
  ok(!!(await as(null, 'update public.professionals set paused = true where id = $1', [pro])).error, 'anon não pausa');
  ok((await as(pro, 'update public.professionals set paused = true where id = $1', [pro])).rowCount === 1 && (await paused()), 'o próprio profissional pausa');
  ok((await as(null, 'select paused from public.professionals where id = $1', [pro])).rows[0]?.paused === true, 'qualquer um vê que está pausado (para esconder da lista)');

  console.log('\nPausado');
  const n1 = await open(novo);
  ok(n1.error?.includes(MSG), `cliente novo não abre conversa: ${n1.error}`);
  ok((await db.query('select count(*)::int n from public.conversations where client_id = $1', [novo])).rows[0].n === 0, 'nenhuma conversa vazia fica para trás');
  const again = await open(cli);
  ok(again.rows[0]?.id === conv, 'conversa que já existe continua abrindo');
  const r2 = await request(cli, conv);
  ok(r2.error?.includes(MSG), 'pedido novo numa conversa antiga é recusado');
  ok(!(await as(cli, "insert into public.messages (conversation_id, body) values ($1, 'Ainda vem amanhã?')", [conv])).error, 'mensagens continuam');
  const prop = await as(pro, "insert into public.proposals (conversation_id, request_id, amount, scheduled_label) values ($1, $2, 120, 'Amanhã') returning id", [conv, r1]);
  ok(!prop.error, 'proposta para pedido que já existia continua');
  ok(!(await as(cli, 'select public.accept_proposal($1)', [prop.rows[0]?.id])).error, 'cliente aceita a proposta normalmente');

  console.log('\nDe volta');
  ok((await as(pro, 'update public.professionals set paused = false where id = $1', [pro])).rowCount === 1, 'profissional volta a receber');
  ok(!(await open(novo)).error, 'cliente novo abre conversa');
  ok(!(await request(cli, conv)).error, 'pedido novo volta a entrar');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
