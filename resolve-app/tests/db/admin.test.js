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

  // `aal`: 'aal2' simula a sessão com o código do app autenticador.
  const as = async (uid, sql, params = [], aal = 'aal1') => {
    await db.query('begin');
    try {
      await db.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`, [uid ?? '', JSON.stringify({ sub: uid, aal })]);
      const r = await db.query(sql, params); await db.query('commit'); return r;
    } catch (e) { await db.query('rollback'); return { error: e.message, rows: [], rowCount: 0 }; }
  };
  const adm = (sql, params = []) => as(admin, sql, params, 'aal2');
  const one = async (uid, sql, params) => { const r = await as(uid, sql, params); if (r.error) throw new Error(r.error); return r.rows[0]; };
  const signup = async (name, role = 'cliente', email = null) => (await db.query('insert into auth.users (raw_user_meta_data, email) values ($1, $2) returning id', [{ full_name: name, role }, email])).rows[0].id;
  const admin = await signup('Equipe Resolve', 'cliente', 'rezolveae@gmail.com');
  await db.query('insert into private.admins (user_id) values ($1)', [admin]);
  const pro = await signup('Marcos Pereira', 'profissional', 'marcos@exemplo.com');
  await as(pro, "insert into public.professional_services values ($1, 'encanador')", [pro]);
  await as(pro, "select public.register_push_token('ExponentPushToken[pro]', 'ios')");
  const ana = await signup('Ana Souza', 'cliente', 'ana@exemplo.com');
  const bia = await signup('Bia Lima', 'cliente', 'bia@exemplo.com');
  const conv = (await one(ana, 'select id from public.open_conversation($1)', [pro])).id;
  const req = (await one(ana, "select request_id from public.create_request($1, 'encanador', 'Torneira pingando', 'Amanhã, tarde')", [conv])).request_id;
  await as(pro, "insert into public.messages (conversation_id, body) values ($1, 'Me passa seu Pix que eu já resolvo')", [conv]);
  const prop = (await one(pro, "insert into public.proposals (conversation_id, request_id, amount, scheduled_label, scheduled_at) values ($1, $2, 180, 'x', now() + interval '1 day') returning id", [conv, req])).id;
  await as(ana, 'select public.accept_proposal($1)', [prop]);
  const report = (await one(ana, "insert into public.reports (reported_id, conversation_id, reason, details) values ($1, $2, 'pagamento', 'Pediu Pix adiantado') returning id", [pro, conv])).id;

  console.log('\nQuem entra');
  ok((await as(admin, 'select public.am_i_admin() a')).rows[0].a === true, 'am_i_admin: sim para o administrador');
  ok((await as(ana, 'select public.am_i_admin() a')).rows[0].a === false, 'am_i_admin: não para os outros');
  ok((await as(ana, 'select public.admin_overview(7)', [], 'aal2')).error?.includes('Acesso restrito'), 'quem não é administrador: acesso restrito (mesmo com segundo fator)');
  ok((await as(admin, 'select public.admin_overview(7)')).error?.includes('Confirme o código do app autenticador'), 'administrador sem o segundo fator: pede o código');
  ok(!!(await as(null, 'select public.admin_overview(7)')).error, 'anon não chama');
  ok(!!(await as(ana, 'insert into private.admins (user_id) values ($1)', [ana], 'aal2')).error, 'ninguém vira administrador pelo app');

  console.log('\nLeitura');
  const ov = (await adm('select public.admin_overview(30) o')).rows[0]?.o;
  ok(ov && ov.clients_new === 3 && ov.pros_new >= 1 && ov.requests === 1 && ov.orders_combined === 1 && ov.reports_open === 1, `visão geral: ${JSON.stringify(ov && { clientes: ov.clients_new, pros: ov.pros_new, pedidos: ov.requests, combinados: ov.orders_combined, denuncias: ov.reports_open })}`);
  const today = (await adm('select public.admin_overview(1) o')).rows[0]?.o;
  ok(today && new Date(today.since) <= new Date() && today.requests === 1, 'período "hoje" começa à 0h');
  const people = (await adm("select * from public.admin_people('', 'todos', 50)")).rows;
  ok(people.length >= 4 && people.some((p) => p.email === 'ana@exemplo.com'), 'lista de pessoas com e-mail');
  ok((await adm("select * from public.admin_people('marcos', 'todos', 50)")).rows.map((p) => p.name).join() === 'Marcos Pereira', 'busca por nome');
  ok((await adm("select * from public.admin_people('bia@', 'todos', 50)")).rows.map((p) => p.name).join() === 'Bia Lima', 'busca por e-mail');
  ok((await adm("select * from public.admin_people('', 'profissionais', 50)")).rows.every((p) => p.role === 'profissional'), 'filtro de profissionais');
  const person = (await adm('select public.admin_person($1) p', [pro])).rows[0]?.p;
  ok(person?.email === 'marcos@exemplo.com' && person.pro?.verified === false && person.stats.reports_received === 1 && person.stats.orders === 1 && person.orders_recent.length === 1, 'ficha da pessoa com números, denúncias e serviços');
  ok(person?.orders_recent[0]?.other === 'Ana Souza' && person.reports[0]?.reason === 'pagamento', 'ficha mostra com quem foi o serviço e o motivo da denúncia');
  const orders = (await adm("select * from public.admin_orders('combinado', 50)")).rows;
  ok(orders.length === 1 && orders[0].client_name === 'Ana Souza' && orders[0].pro_name === 'Marcos Pereira' && Number(orders[0].amount) === 180, 'serviços combinados');
  const reports = (await adm('select * from public.admin_reports(true, 50)')).rows;
  ok(reports.length === 1 && reports[0].reported_name === 'Marcos Pereira' && reports[0].reported_total === '1', 'denúncias abertas');
  await db.query('delete from private.admin_log');
  const chat = (await adm('select * from public.admin_report_conversation($1)', [report])).rows;
  ok(chat.some((m) => m.body === 'Me passa seu Pix que eu já resolvo' && m.from_reported), 'administrador lê a conversa da denúncia');
  ok((await db.query("select count(*)::int n from private.admin_log where action = 'ver_conversa'")).rows[0].n === 1, 'a leitura da conversa fica registrada');
  ok(!!(await as(ana, 'select * from public.admin_report_conversation($1)', [report], 'aal2')).error, 'outro usuário não lê');

  console.log('\nPainel v2');
  ok((await adm('select public.admin_overview(30) o')).rows[0]?.o?.requests_converted === 1, 'pedidos que viraram serviço');
  const found = (await adm("select * from public.admin_people('marcos', 'todos', 5)")).rows[0];
  ok(found?.reports_received === '1' && 'role_title' in found && 'avatar_url' in found, 'busca traz denúncias recebidas e profissão');
  await db.query('delete from private.admin_log');
  const rep = (await adm('select public.admin_report($1) r', [report])).rows[0]?.r;
  ok(rep?.reporter?.name === 'Ana Souza' && rep.reported?.name === 'Marcos Pereira' && rep.reported_total === 1 && rep.previous === null, 'denúncia: quem denunciou quem, sem denúncia anterior');
  ok(rep?.messages.some((m) => m.body === 'Me passa seu Pix que eu já resolvo' && m.from_reported) && rep.messages_total >= 2, 'denúncia: trecho da conversa até a denúncia');
  ok((await db.query("select count(*)::int n from private.admin_log where action = 'ver_conversa'")).rows[0].n === 1, 'abrir a denúncia registra a leitura da conversa');
  ok(!!(await as(ana, 'select public.admin_report($1)', [report], 'aal2')).error, 'outro usuário não abre a denúncia');
  const second = (await one(bia, "insert into public.reports (reported_id, reason, details) values ($1, 'golpe', 'Sumiu com o dinheiro') returning id", [pro])).id;
  const rep2 = (await adm('select public.admin_report($1) r', [second])).rows[0]?.r;
  ok(rep2?.reported_total === 2 && rep2.previous?.reason === 'pagamento' && rep2.conversation_id === null && rep2.messages.length === 0, 'segunda denúncia mostra a anterior; sem conversa, sem trecho');
  await db.query('delete from public.reports where id = $1', [second]);

  console.log('\nVerificações');
  await as(pro, "insert into storage.objects (bucket_id, name) values ('verification', $1), ('verification', $2)", [`${pro}/d.jpg`, `${pro}/s.jpg`]);
  const ver = (await one(pro, 'insert into public.verifications (document_path, selfie_path) values ($1, $2) returning id', [`${pro}/d.jpg`, `${pro}/s.jpg`])).id;
  const pending = (await adm('select * from public.admin_verifications()')).rows;
  ok(pending.length === 1 && pending[0].email === 'marcos@exemplo.com' && pending[0].rejected_before === '0' && 'role_title' in pending[0], 'verificações pendentes, com a profissão');
  ok((await adm("select name from storage.objects where bucket_id = 'verification'")).rows.length === 2, 'administrador com segundo fator vê as fotos');
  ok((await as(admin, "select name from storage.objects where bucket_id = 'verification'")).rows.length === 0, 'sem o segundo fator, não vê');
  ok((await as(ana, "select name from storage.objects where bucket_id = 'verification'", [], 'aal2')).rows.length === 0, 'outro usuário não vê');
  ok((await adm('select public.admin_review_verification($1, false, null)', [ver])).error?.includes('Escreva o motivo da recusa'), 'recusar exige motivo');
  await db.query('delete from net.calls');
  ok(!(await adm('select public.admin_review_verification($1, true, null)', [ver])).error, 'aprovar');
  ok((await db.query('select verified from public.professionals where id = $1', [pro])).rows[0].verified === true, 'selo ligado');
  ok((await db.query('select body from net.calls')).rows.flatMap((r) => r.body).some((m) => m.title === 'Identidade confirmada'), 'profissional avisado');
  ok((await adm('select public.admin_review_verification($1, true, null)', [ver])).error?.includes('já foi analisada'), 'não analisa duas vezes');

  console.log('\nDenúncia resolvida');
  ok(!(await adm("select public.admin_resolve_report($1, 'Avisei o profissional')", [report])).error, 'resolver');
  const resolved = (await adm('select * from public.admin_reports(false, 50)')).rows[0];
  ok(resolved?.resolution === 'Avisei o profissional' && !!resolved.resolved_at, 'aparece em resolvidas, com a decisão');
  ok((await adm("select public.admin_resolve_report($1, 'de novo')", [report])).error?.includes('já foi resolvida'), 'não resolve duas vezes');

  const after = (await adm('select public.admin_person($1) p', [pro])).rows[0]?.p;
  ok(after?.reports[0]?.reporter === 'Ana Souza' && after.reports[0].resolution === 'Avisei o profissional', 'ficha: denúncia com quem denunciou e a decisão');
  ok('canceled_by_self' in (after?.orders_recent[0] ?? {}) && 'completed_at' in (after?.orders_recent[0] ?? {}), 'ficha: serviços com conclusão e quem cancelou');

  console.log('\nSuspensão');
  ok((await adm('select public.admin_suspend($1, null, null)', [admin])).error?.includes('própria conta'), 'não suspende a si mesmo');
  await db.query('delete from net.calls');
  const until = (await adm("select public.admin_suspend($1, 7, 'Pedido de Pix fora do combinado') u", [pro])).rows[0]?.u;
  ok(!!until, 'suspende o profissional por 7 dias');
  const proRow = (await db.query('select paused, paused_until from public.professionals where id = $1', [pro])).rows[0];
  ok(proRow.paused && proRow.paused_until?.getTime() === until?.getTime(), 'profissional fica pausado (fora das listas) até a data');
  ok((await db.query('select body from net.calls')).rows.flatMap((r) => r.body).some((m) => m.title === 'Sua conta foi suspensa'), 'avisado por push');
  const bconv = await as(bia, 'select id from public.open_conversation($1)', [pro]);
  ok(!!bconv.error, 'ninguém abre conversa nova com ele');
  ok((await as(pro, "insert into public.messages (conversation_id, body) values ($1, 'oi')", [conv])).error?.includes('Sua conta está suspensa até'), 'ele não manda mensagem');
  ok((await as(pro, 'update public.professionals set paused = false where id = $1', [pro])).error?.includes('pausada'), 'nem volta a receber pedidos sozinho');
  const mp = (await as(pro, 'select until, suspended from public.my_pause()')).rows[0];
  ok(mp?.suspended === true, 'my_pause diz que é suspensão da moderação');
  ok(!(await as(ana, 'select public.cancel_order(id, $2) from public.orders where conversation_id = $1', [conv, 'Profissional suspenso'])).error, 'o cliente ainda cancela o serviço com ele');
  await adm('select public.admin_suspend($1, null, null)', [ana]);
  ok((await as(ana, "select public.create_request($1, 'encanador', 'Outro pedido', 'Amanhã, tarde')", [conv])).error?.includes('Sua conta está suspensa.'), 'cliente suspensa sem prazo não faz pedido');
  ok((await adm("select * from public.admin_people('', 'suspensos', 50)")).rows.length === 2, 'filtro de suspensos');
  ok(!(await adm('select public.admin_unsuspend($1)', [pro])).error, 'reativar o profissional');
  const back = (await db.query('select p.suspended_until, pr.paused from public.profiles p join public.professionals pr on pr.id = p.id where p.id = $1', [pro])).rows[0];
  ok(back.suspended_until === null && back.paused === false, 'volta a aparecer e a agir');
  ok(!(await as(pro, "insert into public.messages (conversation_id, body) values ($1, 'voltei')", [conv])).error, 'manda mensagem de novo');
  ok((await adm('select public.admin_unsuspend($1)', [pro])).error?.includes('não está suspensa'), 'reativar quem não está suspenso: avisa');

  console.log('\nRegistro');
  const log = (await db.query('select action from private.admin_log order by id')).rows.map((r) => r.action);
  ok(['ver_conversa', 'aprovar_selo', 'resolver_denuncia', 'suspender', 'reativar'].every((a) => log.includes(a)), `ações registradas: ${[...new Set(log)].join(', ')}`);
  ok(!!(await as(admin, 'select * from private.admin_log', [], 'aal2')).error, 'o registro não é legível pelo app');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
