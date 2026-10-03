// Migration conversation_per_pair sobre dados no formato antigo (uma conversa por pedido).
const fs = require('fs'); const { Client } = require('pg');
const APP = require('path').resolve(__dirname, '../../supabase');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ok   ' : '  FALHA', m); };
(async () => {
  const a = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'postgres' }); await a.connect();
  await a.query('drop database if exists mg'); await a.query('create database mg'); await a.end();
  const db = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'mg' }); await db.connect();
  const run = (f) => db.query(fs.readFileSync(f, 'utf8').replace(/create extension if not exists pg_net;/, ''));
  await run(__dirname + '/bootstrap.sql');
  const all = fs.readdirSync(`${APP}/migrations`).sort();
  const at = all.findIndex((m) => m.endsWith('_conversation_per_pair.sql'));
  const migs = all.slice(0, at), last = all[at], later = all.slice(at + 1);
  ok(at > 0, `migration: ${last}`);
  for (const m of migs) await run(`${APP}/migrations/${m}`);
  await run(`${APP}/seed.sql`);

  const as = async (uid, sql, params = []) => {
    await db.query('begin');
    try { await db.query('set local role authenticated'); await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]); const r = await db.query(sql, params); await db.query('commit'); return r; }
    catch (e) { await db.query('rollback'); return { error: e.message, rows: [], rowCount: 0 }; }
  };
  const one = async (uid, sql, params) => { const r = await as(uid, sql, params); if (r.error) throw new Error(r.error); return r.rows[0]; };
  const signup = async (name, role, phone = null) => (await db.query('insert into auth.users (raw_user_meta_data, phone) values ($1, $2) returning id', [{ full_name: name, role }, phone])).rows[0].id;
  const cli = await signup('Ana', 'cliente', '+5511900000001'); const pro1 = await signup('Marcos', 'profissional', '+5511900000002');
  const pro2 = await signup('Cláudia', 'profissional'); const other = await signup('Outro', 'cliente');
  await as(pro1, "insert into public.professional_services values ($1, 'encanador'), ($1, 'eletricista')", [pro1]);
  await as(pro2, "insert into public.professional_services values ($1, 'encanador')", [pro2]);
  const addr = { label: 'Casa', line: 'Av. Paulista, 1000', area: 'Bela Vista', city: 'São Paulo' };

  // Formato antigo
  const open = async (uid, pro, svc) => (await one(uid, 'insert into public.conversations (professional_id, service_id) values ($1, $2) returning id', [pro, svc])).id;
  const request = (uid, conv, body, photos = []) => one(uid, "insert into public.messages (conversation_id, kind, body, request_when, request_address, photos) values ($1, 'request', $2, 'Hoje', $3, $4) returning id", [conv, body, addr, photos]);
  const convA = await open(cli, pro1, 'encanador');
  await one(cli, 'insert into public.request_addresses (conversation_id, address) values ($1, $2) returning 1 x', [convA, addr]);
  await one(cli, "insert into storage.objects (bucket_id, name) values ('request-photos', $1) returning 1 x", [`${convA}/a.jpg`]);
  await request(cli, convA, 'Torneira', [`${convA}/a.jpg`]);
  const pA = (await one(pro1, "insert into public.proposals (conversation_id, amount, scheduled_label) values ($1, 120, 'Sábado') returning id", [convA])).id;
  const orderA = (await one(cli, 'select * from public.accept_proposal($1)', [pA])).id;
  await one(cli, 'select 1 x from public.complete_order($1)', [orderA]);
  await one(cli, 'select 1 x from public.rate_order($1, 5)', [orderA]);
  await one(cli, 'select 1 x from public.mark_conversation_read($1)', [convA]);

  const convB = await open(cli, pro1, 'eletricista');
  await one(cli, "insert into storage.objects (bucket_id, name) values ('request-photos', $1) returning 1 x", [`${convB}/b.jpg`]);
  await request(cli, convB, 'Tomada', [`${convB}/b.jpg`]);
  const pB = (await one(pro1, "insert into public.proposals (conversation_id, amount, scheduled_label) values ($1, 90, 'Amanhã') returning id", [convB])).id;
  await one(pro1, "insert into public.messages (conversation_id, body) values ($1, 'Mandei a proposta') returning 1 x", [convB]);

  const convC = await open(cli, pro2, 'encanador'); await request(cli, convC, 'Pia');
  const convD = await open(other, pro1, 'encanador'); await request(other, convD, 'Chuveiro');
  const before = (await db.query('select (select count(*) from public.messages)::int m, (select count(*) from public.proposals)::int p, (select count(*) from public.orders)::int o, (select count(*) from public.reviews)::int r')).rows[0];
  const readA = (await db.query('select client_last_read_at from public.conversations where id = $1', [convA])).rows[0].client_last_read_at;
  const readB = (await db.query('select client_last_read_at from public.conversations where id = $1', [convB])).rows[0].client_last_read_at;

  console.log('\nMigration');
  await run(`${APP}/migrations/${last}`);
  for (const m of later) await run(`${APP}/migrations/${m}`);
  const convs = (await db.query('select id, client_id, professional_id, client_last_read_at from public.conversations order by created_at')).rows;
  ok(convs.length === 3, `3 conversas (eram 4): ${convs.length}`);
  ok(convs.some((c) => c.id === convA) && !convs.some((c) => c.id === convB), 'cliente + Marcos ficou na conversa mais antiga');
  ok(convs.find((c) => c.id === convA).client_last_read_at.getTime() === Math.min(readA, readB), 'lido até: o mais antigo das duas (nada some como lido)');
  const reqs = (await db.query('select id, conversation_id, service_id from public.requests order by created_at')).rows;
  ok(reqs.length === 4 && reqs.filter((r) => r.conversation_id === convA).map((r) => `${r.id === convA ? 'A' : r.id === convB ? 'B' : '?'}:${r.service_id}`).join() === 'A:encanador,B:eletricista', 'os 2 pedidos (encanador e eletricista) dentro da mesma conversa');
  const after = (await db.query('select (select count(*) from public.messages)::int m, (select count(*) from public.proposals)::int p, (select count(*) from public.orders)::int o, (select count(*) from public.reviews)::int r')).rows[0];
  ok(JSON.stringify(after) === JSON.stringify(before), `nada se perdeu: ${JSON.stringify(after)}`);
  ok((await db.query('select count(*)::int n from public.messages where conversation_id = $1', [convA])).rows[0].n === 7, 'mensagens das duas conversas juntas (7)');
  ok((await db.query("select count(*)::int n from public.messages where kind <> 'text' and request_id is null")).rows[0].n === 0, 'pedido, proposta e sistema ganharam request_id');
  const o = (await db.query('select conversation_id, request_id, status from public.orders')).rows[0];
  ok(o.conversation_id === convA && o.request_id === convA && o.status === 'concluido', 'pedido concluído ligado ao pedido certo');
  ok((await db.query('select status, request_id from public.proposals where id = $1', [pB])).rows[0].request_id === convB, 'proposta pendente segue no pedido do eletricista');
  ok((await db.query('select request_id from public.request_addresses')).rows.map((r) => r.request_id).join() === convA, 'endereço privado ligado ao pedido');
  ok((await db.query('select rating, review_count from public.professionals where id = $1', [pro1])).rows[0].review_count === 1, 'avaliação intacta');

  console.log('\nFotos antigas');
  const photos = async (uid) => (await as(uid, "select name from storage.objects where bucket_id = 'request-photos' order by name")).rows.map((r) => r.name);
  ok((await photos(pro1)).length === 2, 'profissional vê as fotos das duas conversas antigas');
  ok((await photos(cli)).length === 2, 'cliente vê as duas');
  ok((await photos(other)).length === 0 && (await photos(pro2)).length === 0, 'outros não veem');

  console.log('\nDepois: fluxo novo na conversa juntada');
  const conv = await one(cli, 'select * from public.open_conversation($1)', [pro1]);
  ok(conv.id === convA, 'open_conversation devolve a conversa existente');
  ok((await one(pro1, 'select public.get_contact_phone($1) p', [convA])).p === '+5511900000001', 'telefone liberado (há serviço concluído)');
  const m3 = await one(cli, "select * from public.create_request($1, 'encanador', 'Chuveiro queimou', 'Hoje', $2)", [convA, addr]);
  ok(m3.kind === 'request' && m3.request_id && !m3.request_address.line, 'novo pedido na mesma conversa (endereço público)');
  const p3 = await one(pro1, "insert into public.proposals (conversation_id, request_id, amount, scheduled_label) values ($1, $2, 150, 'Hoje') returning id, status", [convA, m3.request_id]);
  ok(p3.status === 'pending' && (await db.query('select status from public.proposals where id = $1', [pB])).rows[0].status === 'pending', 'duas propostas pendentes, uma por pedido');
  const o3 = await one(cli, 'select * from public.accept_proposal($1)', [p3.id]);
  ok(o3.request_id === m3.request_id && o3.service_id === 'encanador' && o3.address.line === 'Av. Paulista, 1000', 'aceite cria o serviço do pedido novo, com endereço completo');
  ok((await db.query('select status from public.proposals where id = $1', [pB])).rows[0].status === 'pending', 'a proposta do outro pedido continua pendente');
  ok(!(await as(cli, 'select public.accept_proposal($1)', [pB])).error, 'e pode ser aceita depois (2 serviços na mesma conversa)');
  ok((await db.query('select count(*)::int n from public.orders where conversation_id = $1', [convA])).rows[0].n === 3, '3 serviços na conversa');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message, e.where ?? ''); process.exit(2); });
