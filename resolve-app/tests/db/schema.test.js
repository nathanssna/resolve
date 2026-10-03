const fs = require('fs');
const { Client } = require('pg');

const APP = require('path').resolve(__dirname, '../../supabase');
const migrations = fs.readdirSync(`${APP}/migrations`).sort().map((f) => `${APP}/migrations/${f}`);

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ok   ', msg); } else { fail++; console.log('  FALHA', msg); } };

async function main() {
  const admin = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'postgres' });
  await admin.connect();
  await admin.query('drop database if exists t');
  await admin.query('create database t');
  await admin.end();

  const db = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 't' });
  await db.connect();
  await db.query(fs.readFileSync(__dirname + '/bootstrap.sql', 'utf8'));
  for (const m of migrations) await db.query(fs.readFileSync(m, 'utf8').replace(/create extension if not exists pg_net;/, ''));
  console.log(`${migrations.length} migrations aplicadas`);
  await db.query(fs.readFileSync(`${APP}/seed.sql`, 'utf8'));
  await db.query(fs.readFileSync(`${APP}/seed.sql`, 'utf8'));
  console.log('seed aplicado (2x)');

  // Executa como um usuário (null = anon)
  const as = async (uid, sql, params = []) => {
    await db.query('begin');
    try {
      await db.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
      const r = await db.query(sql, params);
      await db.query('commit');
      return { rows: r.rows, rowCount: r.rowCount };
    } catch (e) {
      await db.query('rollback');
      return { error: e.message };
    }
  };
  const one = async (uid, sql, params) => { const r = await as(uid, sql, params); if (r.error) throw new Error(r.error); return r.rows[0]; };

  // Cadastros (trigger cria profile / professional)
  const signup = async (meta, phone) =>
    (await db.query('insert into auth.users (raw_user_meta_data, phone) values ($1, $2) returning id', [meta, phone])).rows[0].id;
  const cli = await signup({ full_name: 'Ana Cliente', role: 'cliente' }, '+5511900000001');
  const pro = await signup({ full_name: 'Marcos Oliveira', role: 'profissional' }, '+5511900000002');
  const other = await signup({ name: 'Intruso', role: 'admin' }, null);

  console.log('\nCadastro');
  const profs = (await db.query('select id, full_name, role, phone from public.profiles order by full_name')).rows;
  ok(profs.length === 3, 'trigger criou 3 profiles');
  ok(profs.find((p) => p.id === other).role === 'cliente', "role inválido no metadata vira 'cliente'");
  ok(profs.find((p) => p.id === other).full_name === 'Intruso', "usa 'name' quando não há 'full_name'");
  ok((await db.query('select 1 from public.professionals where id = $1', [pro])).rowCount === 1, 'profissional ganhou ficha em professionals');

  console.log('\nPrimeiro acesso (login por código, sem metadados)');
  const otp = await signup(null, null);
  const otp2 = await signup({}, null);
  let me = await one(otp, 'select full_name, role from public.get_my_profile()');
  ok(me.full_name === '' && me.role === 'cliente', 'cadastro por código nasce com nome vazio e cliente');
  ok(!!(await as(null, "select public.complete_onboarding('Ana', 'cliente')")).error, 'anon não chama complete_onboarding');
  ok(!!(await as(otp, "select public.complete_onboarding(' A ', 'cliente')")).error, 'nome curto demais é recusado');
  ok(!!(await as(otp, "select public.complete_onboarding('Ana', null)")).error, 'papel obrigatório');
  ok(!!(await as(otp, "select public.complete_onboarding('Ana', 'admin')")).error, 'papel inválido é recusado');
  me = await one(otp, "select * from public.complete_onboarding('  Joana Prado  ', 'profissional')");
  ok(me.full_name === 'Joana Prado' && me.role === 'profissional', 'salva nome (sem espaços) e papel');
  ok((await db.query('select 1 from public.professionals where id = $1', [otp])).rowCount === 1, 'profissional ganha ficha em professionals');
  ok(!!(await as(otp, "select public.complete_onboarding('Outra', 'cliente')")).error, 'não roda duas vezes (papel não muda depois)');
  me = await one(otp2, "select * from public.complete_onboarding('Bruno', 'cliente')");
  ok(me.role === 'cliente' && (await db.query('select 1 from public.professionals where id = $1', [otp2])).rowCount === 0, 'cliente não ganha ficha de profissional');
  ok((await as(otp2, "update public.profiles set full_name = 'Bruno Lima' where id = $1", [otp2])).rowCount === 1, 'depois disso o nome continua editável por update');

  console.log('\nCatálogo e leitura pública');
  ok((await as(null, 'select * from public.services')).rows.length === 8, 'anon lê os 8 serviços');
  ok((await as(null, 'select id from public.services where is_popular order by sort_order')).rows.map((r) => r.id).join() === 'encanador,informatica,montagem-moveis,limpeza', 'populares do seed');
  ok((await as(null, 'select id, role_title, rating from public.professionals')).rows.length === 2, 'anon lê profissionais (sem as coordenadas)');
  ok((await as(null, 'select full_name from public.profiles')).rows.length === 2, 'anon só vê profiles de profissionais');
  ok(/permission denied/.test((await as(cli, 'select phone from public.profiles where id = $1', [cli])).error ?? ''), 'telefone não é legível por select (nem o próprio)');
  ok((await one(cli, 'select phone from public.get_my_profile()')).phone === '+5511900000001', 'get_my_profile devolve o próprio telefone');
  ok((await as(cli, 'select * from public.services where id = $1', ['limpeza'])).rows[0].includes.length === 4, 'arrays do seed ok');
  ok(!!(await as(cli, "insert into public.services (id, icon, title, short_title) values ('x','x','x','x')")).error, 'cliente não escreve no catálogo');

  console.log('\nFicha do profissional');
  ok(!(await as(pro, "insert into public.professional_services values ($1, 'encanador')", [pro])).error, 'profissional se inclui em encanador');
  ok(!!(await as(cli, "insert into public.professional_services values ($1, 'limpeza')", [pro])).error, 'outro usuário não mexe nos serviços do profissional');
  ok(!(await as(pro, "update public.professionals set bio = 'Encanador há 12 anos' where id = $1", [pro])).error, 'profissional edita a bio');
  ok(!!(await as(pro, 'update public.professionals set verified = true where id = $1', [pro])).error, 'profissional NÃO se marca como verificado');
  ok(!!(await as(pro, 'update public.professionals set rating = 5 where id = $1', [pro])).error, 'profissional NÃO altera a própria nota');
  ok(!!(await as(cli, 'insert into public.professionals (id) values ($1)', [cli])).error, 'cliente não cria ficha de profissional');
  ok(!!(await as(cli, "update public.profiles set role = 'profissional' where id = $1", [cli])).error, 'usuário não muda o próprio papel');
  ok((await as(cli, "update public.profiles set full_name = 'Ana C.' where id = $1", [pro])).rowCount === 0, 'usuário não edita o profile de outro');

  console.log('\nEndereços, favoritos, tokens');
  ok(!(await as(cli, "insert into public.addresses (label, line, area) values ('Casa', 'Rua das Acácias, 120', 'Santa Terezinha')")).error, 'cliente cria endereço');
  ok(!(await as(cli, "insert into public.favorites (service_id) values ('limpeza')")).error, 'cliente favorita serviço');
  ok((await as(pro, 'select * from public.addresses')).rows.length === 0, 'outro usuário não vê o endereço');
  ok((await as(pro, 'select * from public.favorites')).rows.length === 0, 'outro usuário não vê os favoritos');
  ok(!!(await as(cli, "insert into public.addresses (user_id, line) values ($1, 'x')", [pro])).error, 'não cria endereço em nome de outro');
  await one(cli, "select public.register_push_token('tok-1', 'android')");
  ok((await as(cli, 'select * from public.push_tokens')).rows.length === 1, 'cliente registra push token');
  await one(pro, "select public.register_push_token('tok-1', 'android')");
  ok((await as(cli, 'select * from public.push_tokens')).rows.length === 0 && (await as(pro, 'select * from public.push_tokens')).rows.length === 1, 'mesmo aparelho passa para quem logou depois');

  console.log('\nConversa e pedido');
  ok(!!(await as(cli, "insert into public.conversations (client_id, professional_id) values ($1, $2)", [cli, pro])).error, 'conversa não é criada por insert direto');
  ok(!!(await as(cli, 'select public.open_conversation($1)', [cli])).error, 'não abre conversa consigo mesmo');
  ok(!!(await as(cli, 'select public.open_conversation($1)', [other])).error, 'não abre conversa com quem não é profissional');
  ok(!!(await as(null, 'select public.open_conversation($1)', [pro])).error, 'anon não abre conversa');
  const conv = (await one(cli, 'select * from public.open_conversation($1)', [pro])).id;
  ok(!!conv && (await one(cli, 'select * from public.open_conversation($1)', [pro])).id === conv, 'cliente abre conversa (a mesma ao chamar de novo)');
  const addr = { label: 'Casa', line: 'Rua das Acácias, 120', area: 'Santa Terezinha' };
  ok(!!(await as(cli, "select public.create_request($1, 'limpeza', 'Faxina', 'Hoje')", [conv])).error, 'não pede serviço que o profissional não atende');
  ok(!!(await as(cli, "select public.create_request($1, 'encanador', '  ', 'Hoje')", [conv])).error, 'pedido sem descrição é recusado');
  ok(!!(await as(cli, "insert into public.messages (conversation_id, kind, body, request_when) values ($1, 'request', 'x', 'y')", [conv])).error, 'pedido não entra por insert direto');
  const req1 = await one(cli, "select * from public.create_request($1, 'encanador', 'Torneira pingando', 'Sábado, 9h', $2)", [conv, addr]);
  ok(req1?.kind === 'request' && !!req1.request_id, 'cliente envia o pedido (create_request)');
  ok((await as(pro, 'select service_id from public.requests')).rows.map((r) => r.service_id).join() === 'encanador', 'profissional vê o pedido (requests)');
  ok((await as(other, 'select * from public.requests')).rows.length === 0, 'estranho não vê o pedido');
  ok(!!(await as(pro, "select public.create_request($1, 'encanador', 'x', 'y')", [conv])).error, 'profissional não envia pedido');
  ok(!!(await as(pro, "insert into public.messages (conversation_id, body, request_id) values ($1, 'x', $2)", [conv, req1.request_id])).error, 'texto não se passa por mensagem de pedido');
  ok(!(await as(pro, "insert into public.messages (conversation_id, body) values ($1, 'Oi! Consigo te ajudar.')", [conv])).error, 'profissional responde texto');
  ok(!!(await as(cli, "insert into public.messages (conversation_id, kind, body, sender_id) values ($1, 'system', 'Serviço combinado · R$ 1,00', null)", [conv])).error, 'cliente não forja mensagem de sistema');
  ok(!!(await as(cli, "insert into public.messages (conversation_id, body, sender_id) values ($1, 'oi', $2)", [conv, pro])).error, 'cliente não manda mensagem em nome do profissional');
  ok(!!(await as(cli, "insert into public.messages (conversation_id, kind) values ($1, 'text')", [conv])).error, 'mensagem de texto vazia é rejeitada');
  ok(!!(await as(other, "insert into public.messages (conversation_id, body) values ($1, 'oi')", [conv])).error, 'estranho não escreve na conversa');
  ok((await as(other, 'select * from public.conversations')).rows.length === 0, 'estranho não vê a conversa');
  ok((await as(other, 'select * from public.messages')).rows.length === 0, 'estranho não vê as mensagens');
  ok((await as(pro, 'select full_name from public.profiles where id = $1', [cli])).rows.length === 1, 'profissional vê o nome do cliente com quem conversa');
  ok((await as(other, 'select full_name from public.profiles where id = $1', [cli])).rows.length === 0, 'estranho não vê o profile do cliente');

  console.log('\nPropostas');
  ok(!!(await as(cli, "insert into public.proposals (conversation_id, amount, scheduled_label) values ($1, 10, 'Hoje')", [conv])).error, 'cliente não cria proposta');
  const p1 = (await one(pro, "insert into public.proposals (conversation_id, amount, scheduled_label, note) values ($1, 150, 'Sábado, 9h', 'Visita inclusa') returning id, status", [conv]));
  ok(p1.status === 'pending', 'profissional envia proposta (pending)');
  const p2 = (await one(pro, "insert into public.proposals (conversation_id, amount, scheduled_label, status) values ($1, 120, 'Sábado, 9h', 'accepted') returning id, status", [conv]));
  ok(p2.status === 'pending', "status forçado para 'pending' mesmo se enviado 'accepted'");
  ok((await one(cli, 'select status from public.proposals where id = $1', [p1.id])).status === 'superseded', 'proposta anterior vira superseded');
  ok((await as(cli, "select * from public.messages where conversation_id = $1 and kind = 'proposal'", [conv])).rows.length === 2, 'cada proposta virou mensagem no chat');
  ok(!!(await as(cli, "update public.proposals set status = 'accepted' where id = $1", [p2.id])).error, 'cliente não aceita por update direto');
  ok(!!(await as(cli, 'select public.accept_proposal($1)', [p1.id])).error, 'não aceita proposta substituída');
  ok(!!(await as(pro, 'select public.accept_proposal($1)', [p2.id])).error, 'profissional não aceita a própria proposta');
  ok(!!(await as(other, 'select public.accept_proposal($1)', [p2.id])).error, 'estranho não aceita');
  ok(!!(await as(null, 'select public.accept_proposal($1)', [p2.id])).error, 'anon não chama a RPC');
  ok(!!(await as(cli, 'select public.get_contact_phone($1)', [conv])).error === false && (await one(cli, 'select public.get_contact_phone($1) as p', [conv])).p === null, 'telefone escondido antes de combinar');

  // Endereço completo fica privado até o aceite (migration address_after_deal).
  ok(!!(await as(cli, 'insert into public.request_addresses (request_id, address) values ($1, $2)', [req1.request_id, addr])).error, 'endereço privado só entra pela RPC');
  const order = await one(cli, 'select * from public.accept_proposal($1)', [p2.id]);
  ok(order.status === 'combinado' && Number(order.amount) === 120, 'aceitar cria o pedido (combinado, R$ 120)');
  ok(order.address && order.address.line === 'Rua das Acácias, 120', 'pedido recebe o endereço completo no aceite');
  const sys = (await one(cli, "select body from public.messages where conversation_id = $1 and kind = 'system' order by created_at desc limit 1", [conv])).body;
  ok(sys === 'Serviço combinado · R$ 120,00 · Sábado, 9h', `mensagem de sistema: "${sys}"`);
  ok(!!(await as(cli, 'select public.accept_proposal($1)', [p2.id])).error, 'aceitar de novo falha');
  ok(!!(await as(pro, "insert into public.proposals (conversation_id, request_id, amount, scheduled_label) values ($1, $2, 999, 'Hoje')", [conv, req1.request_id])).error, 'nova proposta para pedido já combinado é recusada');
  ok(!!(await as(pro, "insert into public.proposals (conversation_id, amount, scheduled_label) values ($1, 999, 'Hoje')", [conv])).error, 'sem pedido em aberto, proposta é recusada');
  ok((await as(pro, 'select * from public.orders')).rows.length === 1, 'profissional vê o pedido');
  ok((await as(other, 'select * from public.orders')).rows.length === 0, 'estranho não vê o pedido');
  ok((await one(cli, 'select public.get_contact_phone($1) as p', [conv])).p === '+5511900000002', 'cliente vê o telefone do profissional depois de combinar');
  ok((await one(pro, 'select public.get_contact_phone($1) as p', [conv])).p === '+5511900000001', 'profissional vê o telefone do cliente depois de combinar');
  ok((await one(other, 'select public.get_contact_phone($1) as p', [conv])).p === null, 'estranho não vê telefone');

  console.log('\nConcluir e avaliar');
  ok(!!(await as(cli, 'select public.rate_order($1, 5)', [order.id])).error, 'não avalia antes de concluir');
  ok(!!(await as(other, 'select public.complete_order($1)', [order.id])).error, 'estranho não conclui');
  ok((await one(cli, 'select * from public.complete_order($1)', [order.id])).status === 'concluido', 'cliente conclui');
  ok(!!(await as(cli, 'select public.cancel_order($1)', [order.id])).error, 'não cancela depois de concluído');
  ok((await db.query('select jobs_count from public.professionals where id = $1', [pro])).rows[0].jobs_count === 1, 'jobs_count do profissional +1');
  ok(!!(await as(pro, 'select public.rate_order($1, 5)', [order.id])).error, 'profissional não se avalia');
  ok(!!(await as(cli, 'select public.rate_order($1, 6)', [order.id])).error, 'nota fora de 1–5 é rejeitada');
  ok(!(await as(cli, "select public.rate_order($1, 4, 'Muito bom')", [order.id])).error, 'cliente avalia com 4');
  ok(!!(await as(cli, 'select public.rate_order($1, 5)', [order.id])).error, 'não avalia duas vezes');
  let pr = (await db.query('select rating, review_count from public.professionals where id = $1', [pro])).rows[0];
  ok(Number(pr.rating) === 4 && pr.review_count === 1, `nota média atualizada (${pr.rating}, ${pr.review_count})`);
  ok((await as(null, 'select * from public.reviews')).rows.length === 1, 'avaliações são públicas');

  // Segundo pedido na mesma conversa: recusar e cancelar
  const conv2 = (await one(cli, 'select * from public.open_conversation($1)', [pro])).id;
  ok(conv2 === conv, 'segundo pedido ao mesmo profissional usa a mesma conversa');
  await one(cli, "select * from public.create_request($1, 'encanador', 'Pia entupida', 'Amanhã')", [conv2]);
  const p3 = (await one(pro, "insert into public.proposals (conversation_id, amount, scheduled_label) values ($1, 1500.5, 'Amanhã, 14h') returning id", [conv2])).id;
  ok((await one(cli, 'select status from public.decline_proposal($1)', [p3])).status === 'declined', 'cliente recusa proposta');
  ok((await one(cli, "select body from public.messages where conversation_id = $1 and kind = 'system' order by created_at desc limit 1", [conv2])).body === 'Proposta recusada', 'mensagem de recusa');
  const p4 = (await one(pro, "insert into public.proposals (conversation_id, amount, scheduled_label) values ($1, 1500.5, 'Amanhã, 14h') returning id", [conv2])).id;
  const o2 = await one(cli, 'select * from public.accept_proposal($1)', [p4]);
  ok((await one(cli, "select body from public.messages where conversation_id = $1 and kind = 'system' order by created_at desc limit 1", [conv2])).body === 'Serviço combinado · R$ 1.500,50 · Amanhã, 14h', 'formato BRL com milhar');
  ok((await one(pro, 'select * from public.cancel_order($1)', [o2.id])).status === 'cancelado', 'profissional cancela');
  ok((await one(cli, "select body from public.messages where conversation_id = $1 and kind = 'system' order by created_at desc limit 1", [conv2])).body === 'Serviço cancelado pelo profissional', 'mensagem de cancelamento');

  console.log('\nLeitura e realtime');
  await one(pro, 'select public.mark_conversation_read($1)', [conv]);
  const c = (await db.query('select professional_last_read_at > client_last_read_at as lido from public.conversations where id = $1', [conv])).rows[0];
  ok(c.lido, 'mark_conversation_read atualiza só o lado de quem chamou');
  const pub = (await db.query("select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1")).rows.map((r) => r.tablename).join();
  ok(pub === 'conversations,messages,orders,proposals,requests,reviews', `publicação realtime: ${pub}`);
  const rls = (await db.query("select count(*)::int as n from pg_tables where schemaname = 'public' and not rowsecurity")).rows[0].n;
  ok(rls === 0, 'RLS ativo em todas as tabelas de public');
  ok(!!(await as(cli, 'select private.handle_new_user()')).error, 'funções internas não são chamáveis');

  console.log(`\n${pass} ok, ${fail} falhas`);
  await db.end();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('ERRO:', e.message, e.where ?? ''); process.exit(2); });
