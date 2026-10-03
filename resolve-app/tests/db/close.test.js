// close_request, get_professional_reviews, telefone e favoritos.
const fs = require('fs'); const { Client } = require('pg');
const APP = require('path').resolve(__dirname, '../../supabase');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ok   ' : '  FALHA', m); };
(async () => {
  const a = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'postgres' }); await a.connect();
  await a.query('drop database if exists cl'); await a.query('create database cl'); await a.end();
  const db = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'cl' }); await db.connect();
  db.on('notice', (n) => { if (n.severity === 'WARNING') console.log('    (warning:', n.message + ')'); });
  const run = (f) => db.query(fs.readFileSync(f, 'utf8').replace(/create extension if not exists pg_net;/, ''));
  await run(__dirname + '/bootstrap.sql');
  for (const m of fs.readdirSync(`${APP}/migrations`).sort()) await run(`${APP}/migrations/${m}`);
  await run(`${APP}/seed.sql`); await run(`${APP}/seeds/demo_professionals.sql`); await run(`${APP}/seeds/demo_bot.sql`);
  const as = async (uid, sql, params = []) => {
    await db.query('begin');
    try { await db.query(`set local role ${uid ? 'authenticated' : 'anon'}`); await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']); const r = await db.query(sql, params); await db.query('commit'); return r; }
    catch (e) { await db.query('rollback'); return { error: e.message, rows: [], rowCount: 0 }; }
  };
  const one = async (uid, sql, params) => { const r = await as(uid, sql, params); if (r.error) throw new Error(r.error); return r.rows[0]; };
  const signup = async (name, role) => (await db.query('insert into auth.users (raw_user_meta_data) values ($1) returning id', [{ full_name: name, role }])).rows[0].id;
  const cli = await signup('Ana Souza', 'cliente'); const pro = await signup('Pro Real', 'profissional'); const other = await signup('Outro', 'cliente');
  await as(pro, "insert into public.professional_services values ($1, 'encanador'), ($1, 'eletricista')", [pro]);
  const conv = (await one(cli, 'select * from public.open_conversation($1)', [pro])).id;
  const req = async (svc, body) => (await one(cli, 'select * from public.create_request($1, $2, $3, $4)', [conv, svc, body, 'Hoje'])).request_id;
  const lastSystem = async () => (await one(cli, "select body, request_id from public.messages where conversation_id = $1 and kind = 'system' order by created_at desc limit 1", [conv]));

  console.log('Cliente cancela pedido');
  const r1 = await req('encanador', 'Torneira');
  const p1 = (await one(pro, 'insert into public.proposals (conversation_id, request_id, amount, scheduled_label) values ($1, $2, 100, $3) returning id', [conv, r1, 'Hoje'])).id;
  ok(!!(await as(other, 'select public.close_request($1)', [r1])).error, 'estranho não encerra');
  ok(!!(await as(null, 'select public.close_request($1)', [r1])).error, 'anon não encerra');
  const c1 = await one(cli, 'select * from public.close_request($1)', [r1]);
  ok(!!c1.closed_at && c1.closed_by === cli, 'cliente cancela o pedido');
  ok((await one(cli, 'select status from public.proposals where id = $1', [p1])).status === 'declined', 'proposta pendente cai junto');
  const s1 = await lastSystem();
  ok(s1.body === 'Pedido cancelado pelo cliente' && s1.request_id === r1, 'aviso no chat, ligado ao pedido');
  ok(!!(await as(cli, 'select public.accept_proposal($1)', [p1])).error, 'não aceita proposta de pedido cancelado');
  ok(!!(await as(pro, 'insert into public.proposals (conversation_id, request_id, amount, scheduled_label) values ($1, $2, 90, $3)', [conv, r1, 'Hoje'])).error, 'pedido cancelado não recebe proposta');
  ok(!!(await as(cli, 'select public.close_request($1)', [r1])).error, 'não encerra duas vezes');

  console.log('\nProfissional recusa pedido');
  const r2 = await req('eletricista', 'Tomada');
  const c2 = await one(pro, 'select * from public.close_request($1)', [r2]);
  ok(c2.closed_by === pro && (await lastSystem()).body === 'O profissional não pode atender este pedido', 'profissional recusa, com aviso');
  ok(!!(await as(pro, 'insert into public.proposals (conversation_id, amount, scheduled_label) values ($1, 90, $2)', [conv, 'Hoje'])).error, 'sem pedido em aberto, proposta sem request_id é recusada');

  console.log('\nCom serviço combinado');
  const r3 = await req('encanador', 'Chuveiro');
  const p3 = (await one(pro, 'insert into public.proposals (conversation_id, request_id, amount, scheduled_label) values ($1, $2, 150, $3) returning id', [conv, r3, 'Hoje'])).id;
  const o3 = await one(cli, 'select * from public.accept_proposal($1)', [p3]);
  ok(/serviço combinado/.test((await as(cli, 'select public.close_request($1)', [r3])).error ?? ''), 'pedido combinado não se encerra (cancela-se o serviço)');
  ok((await as(cli, 'select closed_at from public.requests where id = $1', [r1])).rows[0].closed_at !== null && (await as(pro, 'select closed_by from public.requests where id = $1', [r1])).rows[0].closed_by === cli, 'os dois lados leem quem encerrou');

  console.log('\nAvaliações no perfil');
  await one(cli, 'select 1 x from public.complete_order($1)', [o3.id]);
  await one(cli, "select 1 x from public.rate_order($1, 4, '  Rápido e caprichoso  ')", [o3.id]);
  const revs = (await as(null, 'select * from public.get_professional_reviews($1)', [pro])).rows;
  ok(revs.length === 1 && revs[0].rating === 4 && revs[0].comment === 'Rápido e caprichoso' && revs[0].client_first_name === 'Ana' && revs[0].service_id === 'encanador', `anon lê: ${JSON.stringify(revs[0] && { ...revs[0], id: undefined, created_at: undefined })}`);
  ok(!('client_id' in revs[0]), 'sem id do cliente');
  ok((await as(null, 'select full_name from public.profiles where id = $1', [cli])).rows.length === 0, 'profile do cliente segue fechado');
  ok((await as(null, 'select * from public.get_professional_reviews($1, 1000)', [pro])).rows.length === 1, 'limite alto não quebra');

  console.log('\nTelefone e favoritos');
  ok((await as(cli, "update public.profiles set phone = '+5511912345678' where id = $1", [cli])).rowCount === 1, 'cliente salva o telefone');
  ok((await one(cli, 'select phone from public.get_my_profile()')).phone === '+5511912345678', 'get_my_profile devolve o telefone');
  ok((await one(pro, 'select public.get_contact_phone($1) p', [conv])).p === '+5511912345678', 'profissional vê o telefone (serviço concluído)');
  ok(!(await as(cli, "insert into public.favorites (service_id) values ('limpeza')")).error && (await as(cli, 'select service_id from public.favorites')).rows.length === 1, 'favorita');
  ok((await as(cli, "delete from public.favorites where service_id = 'limpeza'")).rowCount === 1, 'desfavorita');

  console.log('\nRobô de demonstração');
  const marcos = (await db.query("select md5('resolve-demo:marcos')::uuid id")).rows[0].id;
  const dconv = (await one(cli, 'select * from public.open_conversation($1)', [marcos])).id;
  const dr = (await one(cli, "select * from public.create_request($1, 'encanador', 'Ralo', 'Hoje')", [dconv])).request_id;
  await one(cli, 'select 1 x from public.close_request($1)', [dr]);
  const dm = (await as(cli, 'select body from public.messages where conversation_id = $1 order by created_at desc limit 1', [dconv])).rows[0].body;
  ok(dm === 'Tudo bem! Se precisar, é só chamar por aqui.', `robô responde ao cancelamento: ${dm}`);
  await one(cli, "insert into public.messages (conversation_id, body) values ($1, 'faz por 50?') returning 1 x", [dconv]);
  const dm2 = (await as(cli, 'select body from public.messages where conversation_id = $1 order by created_at desc limit 1', [dconv])).rows[0].body;
  ok(dm2 === 'Combinado! Qualquer coisa é só chamar por aqui.', 'valor no texto não reabre pedido cancelado');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message, e.where ?? ''); process.exit(2); });
