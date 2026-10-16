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

  const pros = [];
  for (const n of ['Marcos Pereira', 'Rita Alves', 'João Lima', 'Caio Reis']) {
    const id = await signup(n, 'profissional');
    await as(id, "insert into public.professional_services values ($1, 'encanador')", [id]);
    pros.push(id);
  }
  const ana = await signup('Ana Souza');
  // Serviço concluído entre a cliente e o profissional.
  const job = async (cli, pro) => {
    const conv = (await one(cli, 'select id from public.open_conversation($1)', [pro])).id;
    const req = (await one(cli, "select request_id from public.create_request($1, 'encanador', 'Torneira', 'Hoje')", [conv])).request_id;
    const prop = (await one(pro, "insert into public.proposals (conversation_id, request_id, amount, scheduled_label) values ($1, $2, 150, 'x') returning id", [conv, req])).id;
    const order = (await one(cli, 'select * from public.accept_proposal($1)', [prop])).id;
    return order;
  };
  const conclude = (id) => db.query("update public.orders set status = 'concluido', completed_at = now() where id = $1", [id]);
  const rate = (uid, order, n) => as(uid, 'select * from public.rate_client($1, $2)', [order, n]);
  const mine = (uid) => one(uid, 'select * from public.my_client_rating()');
  const record = (uid, client) => one(uid, 'select rating, ratings from public.client_track_record($1)', [client]);

  console.log('\nQuem avalia e quando');
  const o1 = await job(ana, pros[0]);
  ok((await rate(pros[0], o1, 5)).error?.includes('Só dá para avaliar um serviço concluído'), 'serviço combinado: ainda não');
  await conclude(o1);
  ok((await rate(ana, o1, 5)).error?.includes('Pedido não encontrado'), 'a cliente não avalia a si mesma');
  ok((await rate(pros[1], o1, 5)).error?.includes('Pedido não encontrado'), 'outro profissional não avalia');
  ok((await rate(pros[0], o1, 6)).error?.includes('A nota deve ser de 1 a 5'), 'nota fora de 1 a 5: recusada');
  ok(!(await rate(pros[0], o1, 5)).error, 'o profissional do serviço avalia');
  ok((await rate(pros[0], o1, 4)).error?.includes('já foi avaliado'), 'só uma vez por serviço');
  ok(!!(await as(pros[0], "insert into public.client_reviews (order_id, client_id, professional_id, rating) values ($1, $2, $3, 1)", [o1, ana, pros[0]])).error, 'sem gravar direto na tabela');
  const upd = await as(pros[0], 'update public.client_reviews set rating = 1');
  ok((!!upd.error || upd.rowCount === 0) && (await db.query('select rating from public.client_reviews where order_id = $1', [o1])).rows[0].rating === 5, 'sem alterar a nota');

  console.log('\nQuem vê');
  ok((await as(ana, 'select * from public.client_reviews')).rowCount === 0, 'a cliente não lê as notas individuais');
  ok((await as(pros[1], 'select * from public.client_reviews')).rowCount === 0, 'outro profissional não lê a nota dada');
  ok((await as(pros[0], 'select rating from public.client_reviews')).rows[0]?.rating === 5, 'quem deu a nota lê a própria');
  ok((await as(null, 'select * from public.my_client_rating()')).error, 'anon não chama');

  console.log('\nMédia só com 3 avaliações');
  let m = await mine(ana);
  ok(m.rating === null && m.reviews === 1, 'com 1 avaliação: sem média (só a contagem)');
  const o2 = await job(ana, pros[1]); await conclude(o2); await rate(pros[1], o2, 4);
  ok((await mine(ana)).rating === null, 'com 2: ainda sem média');
  const r2 = await record(pros[1], ana);
  ok(r2.rating === null && r2.ratings === 2, 'profissional também não vê média com 2');
  const o3 = await job(ana, pros[2]); await conclude(o3); await rate(pros[2], o3, 4);
  m = await mine(ana);
  ok(m.rating === '4.3' && m.reviews === 3, `com 3: média 4,3 (${m.rating})`);
  ok((await record(pros[0], ana)).rating === '4.3', 'profissional que atendeu vê a média');
  ok(!(await as(pros[3], 'select * from public.client_track_record($1)', [ana])).rowCount, 'profissional sem conversa com ela não vê nada');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
