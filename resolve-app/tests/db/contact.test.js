const fs = require('fs'); const { Client } = require('pg');
const APP = require('path').resolve(__dirname, '../../supabase');
const cases = require('../../src/utils/__tests__/contact-cases.json');
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

  console.log('\nRegras (mesmos exemplos do app, src/utils/__tests__/contact-cases.json)');
  const hide = async (t) => (await db.query('select private.hide_contact($1) v', [t])).rows[0].v;
  for (const [input, expected] of cases.hide) ok((await hide(input)) === expected, `esconde: ${JSON.stringify(input)}`);
  for (const input of cases.keep) ok((await hide(input)) === input, `mantém: ${JSON.stringify(input)}`);
  ok(!!(await as(null, "select private.hide_contact('x')")).error, 'anon não chama a função');

  const pro = await signup('Marcos Pereira', 'profissional');
  await as(pro, "insert into public.professional_services values ($1, 'encanador')", [pro]);
  const ana = await signup('Ana Souza');
  const conv = (await one(ana, 'select id from public.open_conversation($1)', [pro])).id;
  const say = async (uid, body) => (await one(uid, 'insert into public.messages (conversation_id, body) values ($1, $2) returning body', [conv, body])).body;

  console.log('\nAntes de combinar');
  ok((await say(ana, 'me chama no 11 98765-4321')) === 'me chama no [contato oculto]', 'cliente: telefone escondido');
  ok((await say(pro, 'meu insta é @marcos.reparos')) === 'meu insta é [contato oculto]', 'profissional: @perfil escondido');
  ok((await say(ana, 'Fica bom amanhã às 14:30?')) === 'Fica bom amanhã às 14:30?', 'mensagem comum não muda');
  const req = (await one(ana, "select request_id from public.create_request($1, 'encanador', 'Torneira pingando, liga 98765-4321', 'Amanhã, tarde')", [conv])).request_id;
  const desc = (await db.query("select body from public.messages where request_id = $1 and kind = 'request'", [req])).rows[0].body;
  ok(desc === 'Torneira pingando, liga [contato oculto]', 'descrição do pedido: telefone escondido');
  const prop = (await one(pro, "insert into public.proposals (conversation_id, request_id, amount, scheduled_label, scheduled_at, note) values ($1, $2, 150, 'x', now() + interval '1 day', 'qualquer coisa joao@gmail.com') returning id, note", [conv, req]));
  ok(prop.note === 'qualquer coisa [contato oculto]', 'observação da proposta: e-mail escondido');
  const long = await say(ana, '1234-5678 e '.repeat(330));
  ok(long.length === 4000 && long.startsWith('[contato oculto]'), 'texto que cresce ao esconder é cortado em 4000 caracteres');

  console.log('\nDepois de combinar');
  await one(ana, 'select * from public.accept_proposal($1)', [prop.id]);
  ok((await say(ana, 'me chama no 11 98765-4321')) === 'me chama no 11 98765-4321', 'telefone aparece');
  ok((await say(pro, 'meu insta é @marcos.reparos')) === 'meu insta é @marcos.reparos', '@perfil aparece');
  await db.query("update public.orders set status = 'concluido' where conversation_id = $1", [conv]);
  ok((await say(ana, 'wa.me/5511987654321')) === 'wa.me/5511987654321', 'com serviço concluído, continua liberado');

  console.log('\nOutra conversa do mesmo profissional não herda a liberação');
  const bia = await signup('Bia Lima');
  const conv2 = (await one(bia, 'select id from public.open_conversation($1)', [pro])).id;
  ok((await one(pro, 'insert into public.messages (conversation_id, body) values ($1, $2) returning body', [conv2, 'liga 98765-4321'])).body === 'liga [contato oculto]', 'escondido na conversa sem serviço');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
