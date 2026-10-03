// delete_my_account, blocks, reports.
const fs = require('fs'); const { Client } = require('pg');
const APP = require('path').resolve(__dirname, '../../supabase');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ok   ' : '  FALHA', m); };
(async () => {
  const a = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'postgres' }); await a.connect();
  await a.query('drop database if exists ac'); await a.query('create database ac'); await a.end();
  const db = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'ac' }); await db.connect();
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
  const signup = async (name, role, phone = null) => (await db.query('insert into auth.users (raw_user_meta_data, phone) values ($1, $2) returning id', [{ full_name: name, role }, phone])).rows[0].id;
  const n = async (sql, p = []) => Number((await db.query(sql, p)).rows[0].n);
  const cli = await signup('Ana Souza', 'cliente', '+5511900000001'); const pro = await signup('Pro Real', 'profissional', '+5511900000002'); const other = await signup('Outro', 'cliente');
  await as(pro, "insert into public.professional_services values ($1, 'encanador'), ($1, 'eletricista')", [pro]);
  const conv = (await one(cli, 'select * from public.open_conversation($1)', [pro])).id;
  const req = async (svc, uid = cli, c = conv) => (await one(uid, 'select * from public.create_request($1, $2, $3, $4, $5)', [c, svc, 'Algo', 'Hoje', { label: 'Casa', line: 'Rua A, 1', area: 'Centro' }])).request_id;

  console.log('Bloquear');
  ok(!!(await as(cli, 'insert into public.blocks (blocker_id, blocked_id) values ($1, $2)', [pro, cli])).error, 'não bloqueia em nome de outro');
  ok(!!(await as(cli, 'insert into public.blocks (blocked_id) values ($1)', [cli])).error, 'não bloqueia a si mesmo');
  ok(!(await as(cli, 'insert into public.blocks (blocked_id) values ($1)', [pro])).error, 'cliente bloqueia o profissional');
  ok((await as(pro, 'select * from public.blocks')).rows.length === 0, 'o bloqueado não vê o bloqueio');
  ok(/Não é possível falar/.test((await as(cli, 'select public.create_request($1, $2, $3, $4)', [conv, 'encanador', 'x', 'Hoje'])).error ?? ''), 'pedido bloqueado');
  ok(!!(await as(pro, "insert into public.messages (conversation_id, body) values ($1, 'oi')", [conv])).error, 'o bloqueado não manda mensagem');
  ok(!!(await as(cli, "insert into public.messages (conversation_id, body) values ($1, 'oi')", [conv])).error, 'quem bloqueou também não (desbloqueia antes)');
  ok((await as(cli, 'delete from public.blocks where blocked_id = $1', [pro])).rowCount === 1, 'desbloqueia');
  const r1 = await req('encanador');
  ok(!!r1, 'depois de desbloquear, pede de novo');
  await as(pro, 'insert into public.blocks (blocked_id) values ($1)', [cli]);
  ok(/Não é possível falar/.test((await as(pro, 'insert into public.proposals (conversation_id, request_id, amount, scheduled_label) values ($1, $2, 10, $3)', [conv, r1, 'Hoje'])).error ?? ''), 'proposta bloqueada (profissional bloqueou)');
  const other2 = await signup('Outro2', 'cliente');
  await as(pro, 'insert into public.blocks (blocked_id) values ($1)', [other2]);
  ok(/Não é possível falar/.test((await as(other2, 'select public.open_conversation($1)', [pro])).error ?? ''), 'quem foi bloqueado não abre conversa nova');
  await as(pro, 'delete from public.blocks where blocked_id = $1', [cli]);

  console.log('\nDenunciar');
  ok(!(await as(cli, "insert into public.reports (reported_id, conversation_id, reason, details) values ($1, $2, 'golpe', 'Pediu Pix adiantado')", [pro, conv])).error, 'cliente denuncia o profissional');
  ok(!!(await as(cli, "insert into public.reports (reporter_id, reported_id, reason) values ($1, $2, 'golpe')", [other, pro])).error, 'não denuncia em nome de outro');
  ok(!!(await as(cli, "insert into public.reports (reported_id, reason) values ($1, 'qualquer')", [pro])).error, 'motivo fora da lista é recusado');
  ok(!!(await as(other, "insert into public.reports (reported_id, conversation_id, reason) values ($1, $2, 'golpe')", [pro, conv])).error, 'não cita conversa de que não participa');
  ok((await as(pro, 'select * from public.reports')).rows.length === 0, 'o denunciado não vê a denúncia');
  ok((await as(cli, 'select * from public.reports')).rows.length === 1, 'quem denunciou vê a própria');
  ok(!!(await as(cli, 'update public.reports set resolved_at = now()')).error || (await as(cli, 'update public.reports set resolved_at = now()')).rowCount === 0, 'usuário não marca como resolvida');

  console.log('\nExcluir conta (cliente)');
  // serviço em andamento + pedido aberto + serviço concluído e avaliado
  const p1 = (await one(pro, 'insert into public.proposals (conversation_id, request_id, amount, scheduled_label) values ($1, $2, 100, $3) returning id', [conv, r1, 'Hoje'])).id;
  const o1 = await one(cli, 'select * from public.accept_proposal($1)', [p1]);
  await one(cli, 'select 1 x from public.complete_order($1)', [o1.id]);
  await one(cli, "select 1 x from public.rate_order($1, 5, 'Ótimo')", [o1.id]);
  const r2 = await req('eletricista');
  const p2 = (await one(pro, 'insert into public.proposals (conversation_id, request_id, amount, scheduled_label) values ($1, $2, 200, $3) returning id', [conv, r2, 'Amanhã'])).id;
  const o2 = await one(cli, 'select * from public.accept_proposal($1)', [p2]);
  const r3 = await req('encanador');
  await as(cli, "insert into public.addresses (label, line, area) values ('Casa', 'Rua A, 1', 'Centro')");
  await as(cli, "insert into public.favorites (service_id) values ('limpeza')");
  await as(cli, "select public.register_push_token('tok-cli', 'android')");
  await as(cli, 'insert into public.blocks (blocked_id) values ($1)', [other]);
  ok(!!(await as(null, 'select public.delete_my_account()')).error, 'anon não chama');
  ok(!(await as(cli, 'select public.delete_my_account()')).error, 'cliente exclui a conta');
  ok(await n('select count(*) n from auth.users where id = $1', [cli]) === 0, 'login apagado');
  const prof = (await db.query('select full_name, avatar_url, phone, deleted_at from public.profiles where id = $1', [cli])).rows[0];
  ok(prof && prof.full_name === 'Conta excluída' && !prof.phone && !prof.avatar_url && prof.deleted_at, 'profile anonimizado ("Conta excluída", sem telefone)');
  ok(await n('select count(*) n from public.addresses where user_id = $1', [cli]) === 0 && await n('select count(*) n from public.favorites where user_id = $1', [cli]) === 0 && await n('select count(*) n from public.push_tokens where user_id = $1', [cli]) === 0 && await n('select count(*) n from public.blocks where blocker_id = $1', [cli]) === 0, 'endereços, favoritos, tokens e bloqueios apagados');
  ok(await n('select count(*) n from public.request_addresses') === 0, 'endereços privados dos pedidos apagados');
  ok((await one(pro, 'select status from public.orders where id = $1', [o2.id])).status === 'cancelado', 'serviço em andamento foi cancelado');
  ok((await one(pro, 'select closed_by from public.requests where id = $1', [r3])).closed_by === cli, 'pedido aberto foi encerrado');
  const sys = (await as(pro, "select body from public.messages where conversation_id = $1 and kind = 'system' order by created_at desc limit 2", [conv])).rows.map((r) => r.body).sort().join(' | ');
  ok(sys === 'Pedido encerrado: a conta foi excluída | Serviço cancelado: a conta foi excluída', `profissional é avisado: ${sys}`);
  ok((await as(pro, 'select * from public.conversations')).rows.length === 1 && (await one(pro, 'select status from public.orders where id = $1', [o1.id])).status === 'concluido', 'profissional mantém a conversa e o serviço concluído');
  ok((await as(pro, 'select full_name, deleted_at from public.profiles where id = $1', [cli])).rows[0]?.full_name === 'Conta excluída', 'e vê "Conta excluída"');
  const revs = (await as(null, 'select * from public.get_professional_reviews($1)', [pro])).rows;
  ok(revs.length === 1 && revs[0].comment === 'Ótimo' && revs[0].client_first_name === null, 'avaliação fica no perfil, sem nome');
  ok(Number((await db.query('select rating from public.professionals where id = $1', [pro])).rows[0].rating) === 5, 'nota do profissional intacta');
  ok(!!(await as(pro, "insert into public.messages (conversation_id, body) values ($1, 'oi?')", [conv])).error === false, 'profissional ainda pode escrever (o app desabilita)');

  console.log('\nExcluir conta (profissional)');
  const cli2 = await signup('Bia', 'cliente');
  const conv2 = (await one(cli2, 'select * from public.open_conversation($1)', [pro])).id;
  await req('encanador', cli2, conv2);
  ok(!(await as(pro, 'select public.delete_my_account()')).error, 'profissional exclui a conta');
  ok(await n('select count(*) n from public.professional_services where professional_id = $1', [pro]) === 0, 'sai do catálogo (sem serviços)');
  const pf = (await db.query('select bio, role_title, verified from public.professionals where id = $1', [pro])).rows[0];
  ok(pf && pf.bio === '' && pf.role_title === '' && !pf.verified, 'ficha limpa');
  ok((await as(cli2, 'select * from public.conversations')).rows.length === 1 && (await as(cli2, "select body from public.messages where conversation_id = $1 and kind = 'system'", [conv2])).rows[0]?.body === 'Pedido encerrado: a conta foi excluída', 'cliente mantém a conversa, com aviso');

  console.log('\nLimpeza pelo painel continua em cascata');
  const x = await signup('X', 'cliente');
  const marcos = (await db.query("select md5('resolve-demo:marcos')::uuid id")).rows[0].id;
  await one(x, 'select * from public.open_conversation($1)', [marcos]);
  await db.query('delete from auth.users where id = $1', [x]);
  ok(await n('select count(*) n from public.profiles where id = $1', [x]) === 0 && await n('select count(*) n from public.conversations where client_id = $1', [x]) === 0, 'apagar no painel remove profile e conversas (como antes)');
  await run(`${APP}/demo_cleanup.sql`);
  ok(await n("select count(*) n from public.professionals p join public.profiles pr on pr.id = p.id where pr.full_name = 'Marcos Oliveira'") === 0, 'demo_cleanup.sql continua apagando os demo');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message, e.where ?? ''); process.exit(2); });
