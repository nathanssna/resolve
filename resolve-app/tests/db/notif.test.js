const fs = require('fs'); const { Client } = require('pg');
const APP = require('path').resolve(__dirname, '../../supabase');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ok   ' : '  FALHA', m); };
(async () => {
  const a = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'postgres' }); await a.connect();
  await a.query('drop database if exists e'); await a.query('create database e'); await a.end();
  const db = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'e' }); await db.connect();
  db.on('notice', (n) => { if (n.severity === 'WARNING' && !n.message.includes('wal_level')) console.log('    (warning:', n.message + ')'); });
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
    } catch (e) { await db.query('rollback'); return { error: e.message, rows: [] }; }
  };
  const signup = async (name, role = 'cliente') => (await db.query('insert into auth.users (raw_user_meta_data) values ($1) returning id', [{ full_name: name, role }])).rows[0].id;
  const cli = await signup('Ana Souza'); const pro = await signup('Pro Real', 'profissional'); const other = await signup('Intruso');
  await as(pro, "insert into public.professional_services values ($1, 'encanador')", [pro]);
  const conv = (await as(cli, 'select id from public.open_conversation($1)', [pro])).rows[0].id;
  const calls = async () => (await db.query('select id, url, body from net.calls order by id')).rows;
  const say = (uid, text) => as(uid, 'insert into public.messages (conversation_id, body) values ($1, $2)', [conv, text]);
  const tokens = async () => (await db.query('select token from public.push_tokens order by token')).rows.map((r) => r.token);
  const clean = () => db.query('select private.clean_push_tokens()');
  // Tokens registrados "ontem" (sem o trigger, que poria now() no updated_at).
  const ageTokens = () => db.query("alter table public.push_tokens disable trigger push_tokens_updated_at; update public.push_tokens set updated_at = now() - interval '1 day'; alter table public.push_tokens enable trigger push_tokens_updated_at");
  const respond = (id, content) => db.query('insert into net._http_response (id, status_code, content) values ($1, 200, $2)', [id, typeof content === 'string' ? content : JSON.stringify(content)]);

  console.log('\nPreferências (RLS)');
  ok(!(await as(cli, 'insert into public.notification_prefs (messages) values (false)')).error, 'o dono cria as próprias preferências');
  ok((await as(cli, 'select messages, updates from public.notification_prefs')).rows.map((r) => `${r.messages}/${r.updates}`).join() === 'false/true', 'o dono lê (padrão: pedidos e propostas ligado)');
  ok((await as(other, 'select * from public.notification_prefs')).rows.length === 0, 'outro usuário não lê');
  ok((await as(other, 'update public.notification_prefs set messages = true')).rowCount === 0, 'outro usuário não altera');
  ok(!!(await as(other, 'insert into public.notification_prefs (user_id) values ($1)', [cli])).error, 'outro usuário não cria em nome do dono');
  ok(!!(await as(null, 'select * from public.notification_prefs')).error, 'anon não lê');
  await as(cli, 'update public.notification_prefs set messages = true');

  console.log('\nPush respeita as preferências');
  await as(pro, "select public.register_push_token('ExponentPushToken[pro]', 'ios')");
  await as(cli, "select public.register_push_token('ExponentPushToken[cli]', 'android')");
  await db.query('delete from net.calls');
  await say(pro, 'Oi, tudo bem?');
  ok((await calls()).length === 1, 'sem preferências salvas, mensagem gera push');
  await as(cli, 'update public.notification_prefs set messages = false');
  await db.query('delete from net.calls');
  await say(pro, 'Consigo ir amanhã');
  ok((await calls()).length === 0, 'mensagens desligadas: texto não gera push');
  const r1 = (await as(cli, "select request_id as id from public.create_request($1, 'encanador', 'Torneira pingando', 'Amanhã, manhã')", [conv])).rows[0].id;
  await db.query('delete from net.calls');
  await as(pro, "insert into public.proposals (conversation_id, request_id, amount, scheduled_label) values ($1, $2, 120, 'Amanhã, manhã')", [conv, r1]);
  const c1 = (await calls()).flatMap((c) => c.body);
  ok(c1.length === 1 && c1[0].body === 'Proposta: R$ 120,00 · Amanhã, manhã', 'mensagens desligadas: proposta ainda chega');
  await as(cli, 'update public.notification_prefs set updates = false');
  const r2 = (await as(cli, "select request_id as id from public.create_request($1, 'encanador', 'Chuveiro', 'Sábado')", [conv])).rows[0];
  await as(cli, 'select public.close_request($1)', [r1]);
  await db.query('delete from net.calls');
  const p2 = await as(pro, "insert into public.proposals (conversation_id, request_id, amount, scheduled_label) values ($1, $2, 90, 'Sábado')", [conv, r2.id]);
  ok(!p2.error && (await calls()).length === 0, `pedidos e propostas desligados: proposta gravada, sem push ${p2.error ?? ''}`);
  await as(cli, 'delete from public.notification_prefs');
  await db.query('delete from net.calls');
  await say(cli, 'Pode ser sábado');
  ok((await calls()).flatMap((c) => c.body).map((m) => m.to).join() === 'ExponentPushToken[pro]', 'as preferências do cliente não mudam o push do profissional');

  console.log('\nLimpeza de tokens: tickets');
  await as(cli, "select public.register_push_token('ExponentPushToken[cli-velho]', 'android')");
  await ageTokens();
  await db.query('delete from net.calls; delete from private.push_sends');
  await say(pro, 'Chego às 9h');
  const [send] = await calls();
  const sent = (await db.query('select tokens from private.push_sends where request_id = $1', [send.id])).rows[0]?.tokens ?? [];
  ok(sent.join() === 'ExponentPushToken[cli-velho],ExponentPushToken[cli]', 'o envio fica guardado com os tokens na ordem das mensagens');
  ok(send.body.map((m) => m.to).join() === sent.join(), 'mesma ordem no corpo enviado à Expo');
  await clean();
  ok((await tokens()).length === 3, 'sem resposta da Expo ainda: nada muda');
  await respond(send.id, { data: [
    { status: 'error', message: 'not a registered push notification recipient', details: { error: 'DeviceNotRegistered' } },
    { status: 'ok', id: 'ticket-cli' },
  ] });
  await clean();
  ok((await tokens()).join() === 'ExponentPushToken[cli],ExponentPushToken[pro]', 'ticket DeviceNotRegistered: o token velho sai, os outros ficam');
  ok((await db.query('select count(*)::int n from private.push_sends')).rows[0].n === 0, 'envio conferido sai da fila');
  ok((await db.query("select token from private.push_tickets where ticket_id = 'ticket-cli'")).rows[0]?.token === 'ExponentPushToken[cli]', 'ticket ok fica esperando o recibo');

  console.log('\nLimpeza de tokens: recibos');
  await db.query('delete from net.calls');
  await clean();
  ok((await calls()).length === 0, 'ticket com menos de 15 minutos: ainda não pede o recibo');
  await db.query("update private.push_tickets set created_at = now() - interval '20 minutes'");
  await ageTokens();
  await clean();
  const [rc] = await calls();
  ok(rc?.url === 'https://exp.host/--/api/v2/push/getReceipts' && rc.body.ids.join() === 'ticket-cli', 'depois de 15 minutos, pede o recibo à Expo');
  await db.query('delete from net.calls');
  await clean();
  ok((await calls()).length === 0, 'não pede o mesmo recibo duas vezes');
  await respond(rc.id, '<html>502 Bad Gateway</html>');
  await clean();
  const retry = (await calls())[0];
  ok(retry?.body.ids.join() === 'ticket-cli', 'resposta que não é JSON: pede o recibo de novo');
  await respond(retry.id, { data: { 'ticket-cli': { status: 'error', message: 'unregistered', details: { error: 'DeviceNotRegistered' } } } });
  await clean();
  ok((await tokens()).join() === 'ExponentPushToken[pro]', 'recibo DeviceNotRegistered: o token sai');
  ok((await db.query('select count(*)::int n from private.push_tickets')).rows[0].n === 0, 'ticket conferido sai da fila');

  console.log('\nLimpeza de tokens: aparelho que voltou');
  await ageTokens();
  await db.query('delete from net.calls');
  await say(cli, 'Combinado');
  const [s2] = await calls();
  await as(pro, "select public.register_push_token('ExponentPushToken[pro]', 'ios')");
  await respond(s2.id, { data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] });
  await clean();
  ok((await tokens()).join() === 'ExponentPushToken[pro]', 'token registrado de novo depois do envio não é apagado');
  await db.query('delete from net.calls');
  await say(cli, 'Até amanhã');
  const [s3] = await calls();
  await respond(s3.id, { data: [{ status: 'error', details: { error: 'MessageRateExceeded' } }] });
  await clean();
  ok((await tokens()).join() === 'ExponentPushToken[pro]', 'outros erros não apagam o token');

  console.log('\nAgendamento');
  const job = (await db.query("select schedule, command from cron.job where jobname = 'limpar-tokens-push'")).rows[0];
  ok(job?.schedule === '*/10 * * * *' && job.command === 'select private.clean_push_tokens()', 'job do pg_cron a cada 10 minutos');
  ok(!!(await as(cli, 'select private.clean_push_tokens()')).error, 'usuário não roda a limpeza');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
