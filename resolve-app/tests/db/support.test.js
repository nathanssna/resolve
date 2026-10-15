// Canal oficial do Resolve: conversa de cada pessoa com a equipe.
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

  const as = async (uid, sql, params = [], aal = 'aal1') => {
    await db.query('begin');
    try {
      await db.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`, [uid ?? '', JSON.stringify({ sub: uid, aal })]);
      const r = await db.query(sql, params); await db.query('commit'); return r;
    } catch (e) { await db.query('rollback'); return { error: e.message, rows: [], rowCount: 0 }; }
  };
  const signup = async (name, role = 'cliente') => (await db.query('insert into auth.users (raw_user_meta_data) values ($1) returning id', [{ full_name: name, role }])).rows[0].id;
  const admin = await signup('Equipe Resolve');
  await db.query('insert into private.admins (user_id) values ($1)', [admin]);
  await as(admin, "select public.register_push_token('ExponentPushToken[adm]', 'ios')");
  const adm = (sql, params = []) => as(admin, sql, params, 'aal2');
  const ana = await signup('Ana Souza');
  await as(ana, "select public.register_push_token('ExponentPushToken[ana]', 'ios')");
  const pro = await signup('Marcos Pereira', 'profissional');
  const pushes = async () => (await db.query('select count(*)::int n from private.push_sends')).rows[0].n;

  console.log('\nA pessoa escreve');
  ok((await as(null, "select public.send_support_message('oi')")).error !== undefined, 'sem login: não escreve');
  ok((await as(ana, "select public.send_support_message('   ')")).error?.includes('Escreva uma mensagem'), 'mensagem vazia: recusada');
  const p0 = await pushes();
  ok(!(await as(ana, "select public.send_support_message('Preciso de ajuda com um pedido')")).error, 'cliente escreve para a Rezolveaê');
  ok((await pushes()) === p0 + 1, 'a equipe recebe push');
  const t = (await db.query('select * from public.support_threads where user_id = $1', [ana])).rows[0];
  ok(!!t && t.waiting_team, 'conversa criada, esperando a equipe');
  ok((await as(ana, 'select * from public.support_messages')).rows.length === 1, 'a pessoa lê a própria conversa');
  ok((await as(pro, 'select * from public.support_messages')).rows.length === 0, 'outra pessoa não lê');
  ok((await as(ana, "insert into public.support_messages (user_id, from_team, body) values ($1, true, 'Sou a Rezolveaê')", [ana])).error !== undefined, 'ninguém escreve direto na tabela (nem como equipe)');
  ok((await as(ana, "update public.support_threads set waiting_team = false where user_id = $1", [ana])).rowCount === 0, 'a pessoa não mexe na conversa');

  console.log('\nA equipe');
  ok((await as(admin, 'select * from public.admin_support_threads()')).error !== undefined, 'sem o segundo fator: não lê');
  ok((await as(pro, "select public.admin_send_support($1, 'oi')", [ana])).error !== undefined, 'quem não é da equipe não escreve como Resolve');
  const list = (await adm('select * from public.admin_support_threads(true)')).rows;
  ok(list.length === 1 && list[0].name === 'Ana Souza' && Number(list[0].unread) === 1, 'lista: Ana esperando, 1 não lida');
  const conv = (await adm('select public.admin_support_messages($1) v', [ana])).rows[0].v;
  ok(conv.person.name === 'Ana Souza' && conv.messages.length === 1, 'abre a conversa');
  ok((await db.query("select count(*)::int n from private.admin_log where action = 'ver_atendimento'")).rows[0].n === 1, 'a leitura fica registrada');
  ok(Number((await adm('select * from public.admin_support_threads()')).rows[0].unread) === 0, 'aberta: lida pela equipe');
  const p1 = await pushes();
  ok(!(await adm("select public.admin_send_support($1, 'Olá, Ana! Vamos ver isso.')", [ana])).error, 'equipe responde');
  ok((await pushes()) === p1 + 1, 'a pessoa recebe push');
  ok(!(await db.query('select waiting_team from public.support_threads where user_id = $1', [ana])).rows[0].waiting_team, 'respondida: sai de "esperando"');
  ok((await adm('select * from public.admin_support_threads(true)')).rows.length === 0, 'fila de espera vazia');
  const msgs = (await as(ana, 'select from_team, body from public.support_messages order by created_at')).rows;
  ok(msgs.length === 2 && msgs[1].from_team === true, 'a pessoa vê a resposta como da equipe');
  ok((await db.query("select count(*)::int n from private.admin_log where action = 'mensagem_oficial'")).rows[0].n === 1, 'o envio fica registrado');

  console.log('\nEquipe começa a conversa');
  await as(pro, "insert into public.notification_prefs (user_id, messages) values ($1, false)", [pro]);
  await as(pro, "select public.register_push_token('ExponentPushToken[pro]', 'ios')");
  const p2 = await pushes();
  ok(!(await adm("select public.admin_send_support($1, 'Seu selo foi aprovado.')", [pro])).error, 'equipe escreve para quem nunca escreveu');
  ok((await pushes()) === p2, 'quem desligou Mensagens não recebe push');
  ok((await as(pro, 'select * from public.support_threads')).rows.length === 1, 'a conversa aparece para a pessoa');
  ok(!(await as(pro, 'select public.mark_support_read()')).error, 'pessoa marca como lida');

  console.log('\nFoto do canal');
  await db.query("update public.profiles set avatar_url = 'https://exemplo/logo.jpg' where id = $1", [admin]);
  ok((await as(ana, 'select public.support_team_avatar() u')).rows[0].u === 'https://exemplo/logo.jpg', 'o app lê a foto da conta da equipe');
  ok((await as(null, 'select public.support_team_avatar() u')).error !== undefined, 'sem login: não');

  console.log('\nLimite');
  for (let i = 0; i < 19; i++) await as(ana, "select public.send_support_message('mais uma')");
  ok((await as(ana, "select public.send_support_message('vigésima segunda')")).error?.includes('Muitas mensagens'), '20 em 10 minutos: espera');

  console.log(`\n${pass} ok, ${fail} falhas`);
  await db.end();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
