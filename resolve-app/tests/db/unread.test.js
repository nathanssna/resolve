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
  // 70 mensagens do profissional, um minuto entre cada (direto no banco, sem o limite de 30 por minuto).
  await db.query('alter table public.messages disable trigger messages_rate');
  await db.query("insert into public.messages (conversation_id, sender_id, body, created_at) select $1, $2, 'm' || i, now() - make_interval(mins => 100 - i) from generate_series(1, 70) i", [conv, pro]);
  await db.query('alter table public.messages enable trigger messages_rate');
  // O banco grava a hora do relógio em toda mensagem nova; o teste espalha depois.
  await db.query("update public.messages set created_at = now() - make_interval(mins => 100 - substr(body, 2)::int) where conversation_id = $1", [conv]);
  await db.query("update public.conversations set client_last_read_at = now() - interval '200 minutes' where id = $1", [conv]);
  const cut = (await db.query("select created_at from public.messages where conversation_id = $1 and body = 'm21'", [conv])).rows[0].created_at;
  const before = async (uid, at) => (await one(uid, 'select public.unread_before($1, $2) n', [conv, at])).n;

  console.log('\nNão lidas antes de um ponto');
  ok((await before(ana, cut)) === 20, 'cliente: 20 não lidas antes da 21ª (as 50 seguintes o app já tem)');
  ok((await before(pro, cut)) === 0, 'profissional: as próprias mensagens não contam');
  const notice = (await db.query("insert into public.messages (conversation_id, sender_id, kind, body) values ($1, null, 'system', 'Aviso') returning id", [conv])).rows[0].id;
  await db.query("update public.messages set created_at = now() - interval '95 minutes' where id = $1", [notice]);
  ok((await before(ana, cut)) === 21, 'aviso do sistema conta (como no app)');
  await as(ana, 'select public.mark_conversation_read($1)', [conv]);
  ok((await before(ana, cut)) === 0, 'depois de ler: zero');
  const eva = await signup('Eva Dias');
  ok((await as(eva, 'select public.unread_before($1, now()) n', [conv])).rows[0]?.n === 0, 'quem não participa: zero');
  ok(!!(await as(null, 'select public.unread_before($1, now())', [conv])).error, 'anon não chama');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
