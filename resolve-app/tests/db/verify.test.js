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
  const signup = async (name, role = 'cliente') => (await db.query('insert into auth.users (raw_user_meta_data) values ($1) returning id', [{ full_name: name, role }])).rows[0].id;
  const pro = await signup('Marcos Pereira', 'profissional');
  const other = await signup('Outro Pro', 'profissional');
  const cli = await signup('Ana Souza');
  await as(pro, "select public.register_push_token('ExponentPushToken[pro]', 'ios')");
  const send = (uid, doc, selfie) => as(uid, 'insert into public.verifications (document_path, selfie_path) values ($1, $2) returning id, status', [doc, selfie]);
  const verified = async () => (await db.query('select verified from public.professionals where id = $1', [pro])).rows[0].verified;
  const put = (uid, name) => as(uid, "insert into storage.objects (bucket_id, name) values ('verification', $1)", [name]);

  console.log('\nFotos (storage)');
  const bucket = (await db.query("select public, file_size_limit from storage.buckets where id = 'verification'")).rows[0];
  ok(bucket && !bucket.public && Number(bucket.file_size_limit) === 5242880, 'bucket privado, até 5 MB');
  ok(!(await put(pro, `${pro}/doc.jpg`)).error && !(await put(pro, `${pro}/selfie.jpg`)).error, 'o profissional envia na própria pasta');
  ok(!!(await put(pro, `${other}/x.jpg`)).error, 'não envia na pasta de outro');
  ok(!!(await put(null, `${pro}/y.jpg`)).error, 'anon não envia');
  ok((await as(other, "select name from storage.objects where bucket_id = 'verification'")).rows.length === 0, 'outro usuário não vê as fotos');
  ok((await as(null, "select name from storage.objects where bucket_id = 'verification'")).rows.length === 0, 'anon não vê');
  ok((await as(pro, "select name from storage.objects where bucket_id = 'verification'")).rows.length === 2, 'o dono vê as próprias');

  console.log('\nEnviar para análise');
  const v1 = await send(pro, `${pro}/doc.jpg`, `${pro}/selfie.jpg`);
  ok(!v1.error && v1.rows[0]?.status === 'pending', 'profissional envia: em análise');
  ok(!!(await send(pro, `${pro}/doc2.jpg`, `${pro}/selfie2.jpg`)).error, 'uma análise por vez');
  ok(!!(await send(other, `${pro}/doc.jpg`, `${other}/selfie.jpg`)).error, 'não envia fotos da pasta de outro');
  ok(!!(await send(cli, `${cli}/doc.jpg`, `${cli}/selfie.jpg`)).error, 'cliente não pede selo');
  ok(!!(await as(pro, "insert into public.verifications (document_path, selfie_path, status) values ($1, $2, 'approved')", [`${pro}/a.jpg`, `${pro}/b.jpg`])).error, 'não dá para já mandar aprovado');
  ok(!!(await as(pro, "update public.verifications set status = 'approved'")).error && !(await verified()), 'não se aprova sozinho');
  ok((await as(other, 'select * from public.verifications')).rows.length === 0 && (await as(cli, 'select * from public.verifications')).rows.length === 0, 'ninguém mais vê a verificação');

  console.log('\nRecusada (no painel)');
  await db.query('delete from net.calls');
  await db.query("update public.verifications set status = 'rejected', reason = 'A foto do documento ficou ilegível.' where id = $1", [v1.rows[0].id]);
  const rej = (await as(pro, 'select status, reason, reviewed_at from public.verifications where id = $1', [v1.rows[0].id])).rows[0];
  ok(rej?.status === 'rejected' && rej.reason === 'A foto do documento ficou ilegível.' && !!rej.reviewed_at, 'o profissional vê a recusa e o motivo');
  ok(!(await verified()), 'sem selo');
  const c1 = (await db.query('select body from net.calls')).rows.flatMap((r) => r.body);
  ok(c1.length === 1 && c1[0].title === 'Não deu para confirmar sua identidade' && c1[0].body === 'A foto do documento ficou ilegível.' && c1[0].data.url === '/verificacao', 'push com o motivo');

  console.log('\nAprovada (no painel)');
  const v2 = await send(pro, `${pro}/doc3.jpg`, `${pro}/selfie3.jpg`);
  ok(!v2.error, 'depois da recusa, envia de novo');
  await db.query('delete from net.calls');
  await db.query("update public.verifications set status = 'approved' where id = $1", [v2.rows[0].id]);
  ok(await verified(), 'aprovar liga o selo Verificado');
  const c2 = (await db.query('select body from net.calls')).rows.flatMap((r) => r.body);
  ok(c2.length === 1 && c2[0].title === 'Identidade confirmada', 'push "Identidade confirmada"');
  ok((await db.query('select count(*)::int n from private.push_sends')).rows[0].n === 2, 'envios guardados para a limpeza de tokens');

  console.log('\nApagar as fotos depois da análise');
  ok((await as(pro, 'update public.verifications set files_deleted_at = now() where id = $1', [v1.rows[0].id])).rowCount === 1, 'o app marca as fotos como apagadas');
  ok(!!(await as(pro, 'update public.verifications set document_path = $2 where id = $1', [v1.rows[0].id, `${pro}/z.jpg`])).error, 'mas não troca outros campos');
  ok((await as(pro, "delete from storage.objects where bucket_id = 'verification' and name = $1", [`${pro}/doc.jpg`])).rowCount === 1, 'o dono apaga a foto');
  ok((await as(other, "delete from storage.objects where bucket_id = 'verification' and name = $1", [`${pro}/selfie.jpg`])).rowCount === 0, 'outro não apaga');

  console.log('\nConta excluída');
  ok(!(await as(pro, 'select public.delete_my_account()')).error, 'profissional exclui a conta');
  ok((await db.query('select count(*)::int n from public.verifications where user_id = $1', [pro])).rows[0].n === 0, 'os registros da verificação somem');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
