const fs = require('fs'); const { Client } = require('pg');
const APP = require('path').resolve(__dirname, '../../supabase');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ok   ' : '  FALHA', m); };
(async () => {
  const a = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'postgres' }); await a.connect();
  await a.query('drop database if exists ad'); await a.query('create database ad'); await a.end();
  const db = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'ad' }); await db.connect();
  const run = (f) => db.query(fs.readFileSync(f, 'utf8').replace(/create extension if not exists pg_net;/, ''));
  await run(__dirname + '/bootstrap.sql');
  for (const m of fs.readdirSync(`${APP}/migrations`).sort()) await run(`${APP}/migrations/${m}`);
  await run(`${APP}/seed.sql`);
  const as = async (uid, sql, params = []) => {
    await db.query('begin');
    try { await db.query('set local role authenticated'); await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]); const r = await db.query(sql, params); await db.query('commit'); return r; }
    catch (e) { await db.query('rollback'); return { error: e.message, rows: [], rowCount: 0 }; }
  };
  const signup = async (meta) => (await db.query('insert into auth.users (raw_user_meta_data) values ($1) returning id', [meta])).rows[0].id;
  const cli = await signup({ full_name: 'Ana', role: 'cliente' }); const pro = await signup({ full_name: 'Pro', role: 'profissional' }); const other = await signup({ full_name: 'Outro', role: 'cliente' });
  await as(pro, "insert into public.professional_services values ($1, 'encanador')", [pro]);
  const full = { label: 'Casa', line: 'Av. Paulista, 1000', complement: 'Apto 12', area: 'Bela Vista', city: 'São Paulo', state: 'SP', postal_code: '01310-100' };
  const conv = (await as(cli, 'select id from public.open_conversation($1)', [pro])).rows[0].id;

  console.log('Endereço do pedido');
  const r1 = await as(cli, "select * from public.create_request($1, 'encanador', 'Vazamento', 'Hoje', $2)", [conv, full]);
  ok(!r1.error, 'cliente cria o pedido com o endereço completo');
  const rid = r1.rows[0].request_id;
  ok(!!(await as(other, 'insert into public.request_addresses (request_id, address) values ($1, $2)', [rid, full])).error, 'outro usuário não grava endereço');
  ok(!!(await as(pro, 'insert into public.request_addresses (request_id, address) values ($1, $2)', [rid, full])).error, 'profissional não grava');
  ok(!!(await as(cli, "select public.create_request($1, 'encanador', 'x', 'Hoje', '[1]')", [conv])).error, 'endereço que não é objeto é recusado');
  const msg = (await as(pro, "select request_address from public.messages where conversation_id = $1 and kind = 'request'", [conv])).rows[0].request_address;
  ok(msg && !msg.line && !msg.complement && !msg.postal_code && msg.area === 'Bela Vista' && msg.city === 'São Paulo' && msg.label === 'Casa', `mensagem guarda só a parte pública: ${JSON.stringify(msg)}`);

  console.log('\nAntes de combinar');
  ok((await as(pro, 'select * from public.request_addresses')).rows.length === 0, 'profissional NÃO lê o endereço completo');
  ok((await as(other, 'select * from public.request_addresses')).rows.length === 0, 'estranho não lê');
  ok((await as(cli, 'select address from public.request_addresses')).rows[0]?.address.line === 'Av. Paulista, 1000', 'cliente lê o próprio endereço completo');

  console.log('\nDepois de combinar');
  const pid = (await as(pro, "insert into public.proposals (conversation_id, request_id, amount, scheduled_label) values ($1, $2, 150, 'Hoje') returning id", [conv, rid])).rows[0].id;
  await as(cli, 'select public.accept_proposal($1)', [pid]);
  const oaddr = (await as(pro, 'select address from public.orders where request_id = $1', [rid])).rows[0]?.address;
  ok(oaddr?.line === 'Av. Paulista, 1000' && oaddr.complement === 'Apto 12', 'profissional vê o endereço completo no pedido');
  ok((await as(pro, 'select * from public.request_addresses')).rows.length === 0, 'mesmo depois, a tabela privada continua fechada para ele');

  console.log('\nSegundo pedido na mesma conversa');
  const r2 = (await as(cli, "select * from public.create_request($1, 'encanador', 'Chuveiro', 'Amanhã', $2)", [conv, { ...full, line: 'Rua Augusta, 50', complement: null, area: 'Consolação' }])).rows[0];
  const parts = (await as(pro, "select request_id, request_address from public.messages where conversation_id = $1 and kind = 'request' order by created_at", [conv])).rows;
  ok(parts.length === 2 && !parts[1].request_address.line && parts[1].request_address.area === 'Consolação', 'o novo pedido também chega só com o bairro');
  const pid2 = (await as(pro, "insert into public.proposals (conversation_id, request_id, amount, scheduled_label) values ($1, $2, 90, 'Amanhã') returning id", [conv, r2.request_id])).rows[0].id;
  await as(cli, 'select public.accept_proposal($1)', [pid2]);
  const o2 = (await as(pro, 'select address from public.orders where request_id = $1', [r2.request_id])).rows[0]?.address;
  ok(o2?.line === 'Rua Augusta, 50', 'cada serviço recebe o endereço do próprio pedido');

  console.log('\nPedido sem endereço privado');
  const r3 = (await as(cli, "select * from public.create_request($1, 'encanador', 'Teste', 'Hoje', null)", [conv])).rows[0];
  const pid3 = (await as(pro, "insert into public.proposals (conversation_id, request_id, amount, scheduled_label) values ($1, $2, 90, 'Hoje') returning id", [conv, r3.request_id])).rows[0].id;
  const acc = await as(cli, 'select public.accept_proposal($1)', [pid3]);
  ok(!acc.error && (await as(cli, 'select address from public.orders where request_id = $1', [r3.request_id])).rows[0]?.address === null, 'sem endereço, o aceite não quebra');
  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
