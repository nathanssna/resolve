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
  const ana = await signup('Ana Souza');
  const conv = (await one(ana, 'select id from public.open_conversation($1)', [pro])).id;
  const request = (uid, when = 'Amanhã, tarde') => as(uid, "select request_id from public.create_request($1, 'encanador', 'Torneira pingando', $2)", [conv, when]);
  const propose = (req, amount, at) => as(pro, `insert into public.proposals (conversation_id, request_id, amount, scheduled_label, scheduled_at) values ($1, $2, $3, 'x', ${at}) returning id`, [conv, req, amount]);
  const lastNote = async () => (await db.query("select body from public.messages where conversation_id = $1 and kind = 'system' order by created_at desc, id desc limit 1", [conv])).rows[0]?.body;

  console.log('\nProposta');
  const r1 = (await one(ana, "select request_id from public.create_request($1, 'encanador', 'Torneira pingando', 'Amanhã, tarde')", [conv])).request_id;
  ok((await propose(r1, 50001, "now() + interval '1 day'")).error?.includes('O valor máximo de uma proposta é R$ 50.000,00'), 'valor acima de R$ 50.000: recusado');
  ok((await propose(r1, 150, "now() - interval '5 hours'")).error?.includes('Escolha um dia e um período que ainda não passaram'), 'período que já terminou: recusado');
  ok((await propose(r1, 150, "now() + interval '91 days'")).error?.includes('Escolha uma data nos próximos 90 dias'), 'mais de 90 dias: recusado');
  ok(!(await propose(r1, 150, "now() - interval '2 hours'")).error, 'período em andamento (começou há 2 h): aceito');
  ok(!(await propose(r1, 50000, "now() + interval '89 days'")).error, 'R$ 50.000 em 89 dias: aceito');
  ok(!(await propose(r1, 90, 'null')).error, 'sem data (como o robô de demonstração): aceito');

  console.log('\nProposta vence');
  const pending = (await db.query("select id from public.proposals where request_id = $1 and status = 'pending'", [r1])).rows[0].id;
  await db.query("update public.proposals set scheduled_at = now() - interval '5 hours' where id = $1", [pending]);
  ok((await db.query('select private.expire_stale() n')).rows[0].n === 1, 'o job vence a proposta pendente cuja data passou');
  ok((await db.query('select status from public.proposals where id = $1', [pending])).rows[0].status === 'expired', 'status "expired"');
  ok((await lastNote()) === 'Proposta vencida: a data passou sem resposta. O profissional pode enviar outra.', 'aviso no chat');
  ok(!(await propose(r1, 160, "now() + interval '1 day'")).error, 'o profissional manda outra proposta para o mesmo pedido');
  ok(!!(await as(ana, 'select public.accept_proposal($1)', [pending])).error, 'proposta vencida não pode ser aceita');

  console.log('\nPedido sem resposta');
  const bia = await signup('Bia Lima');
  const conv2 = (await one(bia, 'select id from public.open_conversation($1)', [pro])).id;
  const old = (await one(bia, "select request_id from public.create_request($1, 'encanador', 'Chuveiro', 'Amanhã, tarde')", [conv2])).request_id;
  const urgent = (await one(bia, "select request_id from public.create_request($1, 'encanador', 'Vazamento', 'O quanto antes')", [conv2])).request_id;
  // Outra cliente: o profissional respondeu no chat, sem proposta.
  const eva = await signup('Eva Dias');
  const conv5 = (await one(eva, 'select id from public.open_conversation($1)', [pro])).id;
  const answered = (await one(eva, "select request_id from public.create_request($1, 'encanador', 'Ralo', 'Amanhã, tarde')", [conv5])).request_id;
  await as(pro, "insert into public.messages (conversation_id, body) values ($1, 'Posso ver amanhã')", [conv5]);
  const age = (id, interval) => db.query(`update public.requests set created_at = now() - interval '${interval}' where id = $1`, [id]);
  await age(old, '2 days'); await age(urgent, '23 hours');
  ok((await db.query('select private.expire_stale() n')).rows[0].n === 0, 'pedido de 2 dias e urgente de 23 h: ainda abertos');
  await age(old, '73 hours'); await age(urgent, '25 hours'); await age(answered, '4 days');
  const closed = (await db.query('select private.expire_stale() n')).rows[0].n;
  const state = async (id) => (await db.query('select closed_at is not null as closed, closed_by from public.requests where id = $1', [id])).rows[0];
  ok(closed === 2 && (await state(old)).closed && (await state(urgent)).closed, `pedidos antigos sem resposta fecham (${closed})`);
  ok(!(await state(answered)).closed, 'pedido em que o profissional respondeu no chat continua aberto');
  ok((await state(old)).closed_by === null, 'fechado pelo sistema (sem closed_by)');
  ok((await db.query("select count(*)::int n from public.messages where conversation_id = $1 and body like 'Pedido encerrado: o profissional não respondeu a tempo%'", [conv2])).rows[0].n === 2, 'aviso no chat para cada pedido');

  console.log('\nLimite de pedidos');
  const cid = await signup('Cid Rocha');
  const conv3 = (await one(cid, 'select id from public.open_conversation($1)', [pro])).id;
  const req3 = () => as(cid, "select request_id from public.create_request($1, 'encanador', 'Pedido de teste', 'Amanhã, tarde')", [conv3]);
  for (let i = 0; i < 5; i++) await req3();
  const sixth = await req3();
  ok(sixth.error?.includes('Você tem 5 pedidos em aberto'), `sexto pedido em aberto: recusado (${sixth.error})`);
  const ids = (await db.query('select id from public.requests where conversation_id = $1', [conv3])).rows.map((r) => r.id);
  for (const id of ids) await as(cid, 'select public.close_request($1)', [id]);
  for (let i = 0; i < 5; i++) await req3();
  for (const id of (await db.query('select id from public.requests where conversation_id = $1 and closed_at is null', [conv3])).rows.map((r) => r.id)) await as(cid, 'select public.close_request($1)', [id]);
  const eleventh = await req3();
  ok(eleventh.error?.includes('Você já fez 10 pedidos hoje'), `décimo primeiro em 24 h: recusado (${eleventh.error})`);
  await db.query("update public.requests set created_at = now() - interval '25 hours' where conversation_id = $1", [conv3]);
  for (const id of (await db.query('select id from public.requests where conversation_id = $1 and closed_at is null', [conv3])).rows.map((r) => r.id)) await as(cid, 'select public.close_request($1)', [id]);
  ok(!(await req3()).error, 'no dia seguinte, pode pedir de novo');

  console.log('\nLimite de mensagens');
  const dan = await signup('Dan Melo');
  const conv4 = (await one(dan, 'select id from public.open_conversation($1)', [pro])).id;
  await one(dan, "select request_id from public.create_request($1, 'encanador', 'Torneira', 'Amanhã, tarde')", [conv4]);
  let sent = 0, blocked = null;
  for (let i = 0; i < 31; i++) {
    const r = await as(dan, 'insert into public.messages (conversation_id, body) values ($1, $2)', [conv4, `oi ${i}`]);
    if (r.error) { blocked = r.error; break; }
    sent++;
  }
  ok(sent === 30 && blocked?.includes('Muitas mensagens seguidas'), `30 mensagens por minuto passam; a 31ª não (${sent})`);
  ok(!(await as(pro, "insert into public.messages (conversation_id, body) values ($1, 'Oi Dan')", [conv4])).error, 'o limite é por pessoa: o outro lado continua');
  await db.query("update public.messages set created_at = now() - interval '2 minutes' where sender_id = $1", [dan]);
  ok(!(await as(dan, "insert into public.messages (conversation_id, body) values ($1, 'voltei')", [conv4])).error, 'passado um minuto, volta a mandar');

  console.log('\nE-mail descartável');
  const disposable = async (email) => (await as(null, 'select public.is_disposable_email($1) d', [email])).rows[0]?.d;
  ok((await disposable('fulano@mailinator.com')) === true && (await disposable('X@YopMail.com ')) === true, 'mailinator e yopmail (maiúsculas, espaço) são descartáveis');
  ok((await disposable('a@sub.guerrillamail.com')) === true, 'subdomínio também');
  ok((await disposable('ana@gmail.com')) === false && (await disposable('ana@notmailinator.com')) === false, 'gmail e domínio parecido não são');
  const blockedSignup = await db.query("insert into auth.users (email) values ('bot@mailinator.com')").then(() => null, (e) => e.message);
  ok(blockedSignup?.includes('E-mail temporário não é aceito'), 'conta com e-mail descartável não é criada');
  const okSignup = await db.query("insert into auth.users (email, raw_user_meta_data) values ('ana@gmail.com', '{}') returning id").then((r) => r.rows[0].id, (e) => e.message);
  ok(typeof okSignup === 'string' && okSignup.length === 36, 'e-mail comum cria a conta');

  console.log('\nAgendamento');
  const job = (await db.query("select schedule from cron.job where jobname = 'vencimentos'")).rows[0];
  ok(job?.schedule === '15 * * * *', 'job de vencimentos de hora em hora');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
