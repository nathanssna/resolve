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
  await as(pro, "insert into public.professional_services values ($1, 'encanador'), ($1, 'eletricista')", [pro]);
  await as(pro, "select public.register_push_token('ExponentPushToken[pro]', 'ios')");

  // Dia em Brasília: hoje + n, às `hour` (o começo do período, como o app grava).
  const at = async (days, hour) => (await db.query(`select (((now() at time zone 'America/Sao_Paulo')::date + $1::int) + make_time($2, 0, 0)) at time zone 'America/Sao_Paulo' as t`, [days, hour])).rows[0].t;
  // Serviço combinado (pedido → proposta com data → aceite), feito ontem.
  const deal = async (cli, service, days, hour, { createdToday = false } = {}) => {
    const conv = (await one(cli, 'select id from public.open_conversation($1)', [pro])).id;
    const req = (await one(cli, "select request_id from public.create_request($1, $2, 'Serviço', 'Hoje', $3)", [conv, service, { label: 'Casa', line: 'Rua A, 1', area: 'Bela Vista', city: 'São Paulo' }])).request_id;
    const prop = (await one(pro, "insert into public.proposals (conversation_id, request_id, amount, scheduled_label, scheduled_at) values ($1, $2, 150, 'Sex 17/10, tarde', $3) returning id", [conv, req, await at(days, hour)])).id;
    const order = await one(cli, 'select * from public.accept_proposal($1)', [prop]);
    if (!createdToday) await db.query("update public.orders set created_at = now() - interval '1 day' where id = $1", [order.id]);
    return order.id;
  };
  const remind = async () => (await db.query('select private.send_day_reminders() n')).rows[0].n;
  const calls = async () => (await db.query('select id, body from net.calls order by id')).rows;

  console.log('\nServiço hoje à tarde');
  const ana = await signup('Ana Souza');
  await as(ana, "select public.register_push_token('ExponentPushToken[ana]', 'android')");
  const o1 = await deal(ana, 'encanador', 0, 13);
  ok((await db.query('select scheduled_at is not null as ok from public.orders where id = $1', [o1])).rows[0].ok, 'o aceite leva a data da proposta para o serviço');
  await db.query('delete from net.calls');
  ok((await remind()) === 1, 'um serviço lembrado');
  const [c1] = await calls();
  const msgs = c1?.body ?? [];
  const toAna = msgs.find((m) => m.to === 'ExponentPushToken[ana]');
  const toPro = msgs.find((m) => m.to === 'ExponentPushToken[pro]');
  ok(msgs.length === 2, `um envio com 2 notificações (cliente e profissional): ${msgs.length}`);
  ok(toAna?.title === 'Hoje: Encanador' && toAna?.body === 'Com Marcos, à tarde.', `cliente: "${toAna?.title}" / "${toAna?.body}"`);
  ok(toPro?.title === 'Hoje: Encanador' && toPro?.body === 'Ana, à tarde · Bela Vista.', `profissional: "${toPro?.body}"`);
  ok(toAna?.data?.url === `/pedido/${o1}`, 'tocar abre o serviço');
  const sent = (await db.query('select tokens from private.push_sends where request_id = $1', [c1?.id])).rows[0]?.tokens ?? [];
  ok(sent.join() === msgs.map((m) => m.to).join(), 'envio guardado para a limpeza de tokens, na mesma ordem');
  await db.query('delete from net.calls');
  ok((await remind()) === 0 && (await calls()).length === 0, 'rodar de novo não repete o lembrete');

  console.log('\nQuem não recebe');
  const bia = await signup('Bia Lima');
  await as(bia, "select public.register_push_token('ExponentPushToken[bia]', 'android')");
  await deal(bia, 'encanador', 1, 8);
  const cid = await signup('Cid Rocha');
  await as(cid, "select public.register_push_token('ExponentPushToken[cid]', 'android')");
  await deal(cid, 'encanador', 0, 18, { createdToday: true });
  const dan = await signup('Dan Melo');
  await as(dan, "select public.register_push_token('ExponentPushToken[dan]', 'android')");
  const o4 = await deal(dan, 'encanador', 0, 8);
  ok(!(await as(dan, "select public.cancel_order($1, 'Imprevisto')", [o4])).error, 'cancelado (em cima da hora, com motivo)');
  await db.query('delete from net.calls');
  ok((await remind()) === 0 && (await calls()).length === 0, 'amanhã, combinado hoje e cancelado: nenhum lembrete');

  console.log('\nPreferências e período');
  const eva = await signup('Eva Dias');
  await as(eva, "select public.register_push_token('ExponentPushToken[eva]', 'android')");
  await as(eva, 'insert into public.notification_prefs (updates) values (false)');
  await deal(eva, 'eletricista', 0, 18);
  await db.query('delete from net.calls');
  ok((await remind()) === 1, 'serviço lembrado');
  const m2 = (await calls()).flatMap((c) => c.body);
  ok(m2.length === 1 && m2[0].to === 'ExponentPushToken[pro]', 'cliente com "Pedidos e propostas" desligado não recebe; o profissional sim');
  ok(m2[0]?.title === 'Hoje: Eletricista' && m2[0]?.body === 'Eva, à noite · Bela Vista.', `noite: "${m2[0]?.body}"`);

  console.log('\nMuitos serviços no mesmo dia');
  for (let i = 0; i < 55; i++) {
    const c = await signup(`Cliente ${i}`);
    await as(c, `select public.register_push_token('ExponentPushToken[c${String(i).padStart(2, '0')}]', 'android')`);
    await deal(c, 'encanador', 0, 8);
  }
  await db.query('delete from net.calls');
  ok((await remind()) === 55, '55 serviços lembrados');
  const big = await calls();
  ok(big.length === 2 && big[0].body.length === 100 && big[1].body.length === 10, `110 notificações em envios de até 100 (${big.map((c) => c.body.length)})`);
  ok(big.every((c) => c.body.every((m) => m.title === 'Hoje: Encanador')), 'todas com o título certo');

  console.log('\nAgendamento');
  const job = (await db.query("select schedule, command from cron.job where jobname = 'lembrete-do-dia'")).rows[0];
  ok(job?.schedule === '0 10-14 * * *' && job.command === 'select private.send_day_reminders()', 'job do pg_cron de hora em hora das 7h às 11h (Brasília)');
  ok(!!(await as(ana, 'select private.send_day_reminders()')).error, 'usuário não dispara os lembretes');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
