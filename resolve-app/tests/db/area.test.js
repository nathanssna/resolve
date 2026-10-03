// Área de atendimento: coordenadas privadas, raio e professional_distances.
const fs = require('fs'); const { Client } = require('pg');
const APP = require('path').resolve(__dirname, '../../supabase');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ok   ' : '  FALHA', m); };
(async () => {
  const a = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'postgres' }); await a.connect();
  await a.query('drop database if exists ar'); await a.query('create database ar'); await a.end();
  const db = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'ar' }); await db.connect();
  const run = (f) => db.query(fs.readFileSync(f, 'utf8').replace(/create extension if not exists pg_net;/, ''));
  await run(__dirname + '/bootstrap.sql');
  for (const m of fs.readdirSync(`${APP}/migrations`).sort()) await run(`${APP}/migrations/${m}`);
  await run(`${APP}/seed.sql`); await run(`${APP}/seeds/demo_professionals.sql`); await run(`${APP}/seeds/demo_professionals.sql`);
  const as = async (uid, sql, params = []) => {
    await db.query('begin');
    try { await db.query(`set local role ${uid ? 'authenticated' : 'anon'}`); await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']); const r = await db.query(sql, params); await db.query('commit'); return r; }
    catch (e) { await db.query('rollback'); return { error: e.message, rows: [], rowCount: 0 }; }
  };
  const id = async (slug) => (await db.query(`select md5('resolve-demo:${slug}')::uuid id`)).rows[0].id;
  const marcos = await id('marcos'), sergio = await id('sergio');

  console.log('Privacidade');
  ok(/permission denied/.test((await as(null, 'select latitude from public.professionals')).error ?? ''), 'anon não lê a latitude');
  ok(/permission denied/.test((await as(null, 'select * from public.professionals')).error ?? ''), 'nem por select *');
  const pub = (await as(null, 'select base_area, service_radius_km from public.professionals where id = $1', [marcos])).rows[0];
  ok(pub?.base_area === 'Bela Vista, São Paulo' && pub.service_radius_km === 10, 'bairro e raio são públicos');

  console.log('\nDistâncias');
  const near = (await as(null, 'select * from public.professional_distances($1, $2)', [-23.5614, -46.6559])).rows; // Av. Paulista
  ok(near.length === 13, `13 demo com área (seed 2x sem duplicar): ${near.length}`);
  const m = near.find((r) => r.professional_id === marcos);
  ok(m.in_range && m.distance_km === 1, `Marcos (Bela Vista) atende a Paulista, ~1 km: ${JSON.stringify(m)}`);
  ok(near.every((r) => Number.isInteger(r.distance_km)), 'distância em km inteiros (não revela o ponto exato)');
  const campinas = (await as(null, 'select * from public.professional_distances($1, $2)', [-22.9056, -47.0608])).rows;
  ok(campinas.every((r) => !r.in_range) && campinas[0].distance_km > 70, `Campinas: ninguém atende (${campinas[0].distance_km} km)`);
  ok((await as(null, 'select * from public.professional_distances(200, 0)')).rows.length === 0, 'coordenada inválida não devolve nada');

  console.log('\nFicha');
  const pro = (await db.query("insert into auth.users (raw_user_meta_data) values ('{\"full_name\":\"Pro\",\"role\":\"profissional\"}') returning id")).rows[0].id;
  ok(!(await as(pro, "update public.professionals set latitude = -23.55, longitude = -46.63, service_radius_km = 20, base_area = 'Sé, São Paulo' where id = $1", [pro])).error, 'profissional define a área (coordenadas, raio, bairro)');
  ok(!!(await as(pro, 'update public.professionals set service_radius_km = 500 where id = $1', [pro])).error, 'raio acima de 100 km é recusado');
  ok(!!(await as(pro, 'update public.professionals set service_radius_km = 5 where id = $1', [sergio])).error || (await as(pro, 'update public.professionals set service_radius_km = 5 where id = $1', [sergio])).rowCount === 0, 'não muda a área de outro');
  const pd = (await as(null, 'select * from public.professional_distances($1, $2) where professional_id = $3', [-23.70, -46.63, pro])).rows[0];
  ok(pd && pd.in_range && pd.distance_km === 17, `raio de 20 km vale: ${JSON.stringify(pd)}`);
  const noArea = (await db.query("insert into auth.users (raw_user_meta_data) values ('{\"full_name\":\"Sem\",\"role\":\"profissional\"}') returning id")).rows[0].id;
  ok(!(await as(null, 'select * from public.professional_distances(-23.55, -46.63) where professional_id = $1', [noArea])).rows.length, 'sem área definida, fica fora da conta');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message, e.where ?? ''); process.exit(2); });
