const fs = require('fs'); const { Client } = require('pg');
const APP = require('path').resolve(__dirname, '../../supabase');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ok   ' : '  FALHA', m); };
(async () => {
  const a = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'postgres' }); await a.connect();
  await a.query('drop database if exists e'); await a.query('create database e'); await a.end();
  const db = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'e' }); await db.connect();
  db.on('notice', (n) => { if (n.severity === 'WARNING' && !n.message.includes('wal_level')) console.log('    (warning:', n.message + ')'); });
  const run = (f, tx = (s) => s) => db.query(tx(fs.readFileSync(f, 'utf8')));
  await run(__dirname + '/bootstrap.sql');
  for (const m of fs.readdirSync(`${APP}/migrations`).sort()) await run(`${APP}/migrations/${m}`, (s) => s.replace(/create extension if not exists pg_net;/, ''));
  await run(`${APP}/seed.sql`); await run(`${APP}/seeds/demo_professionals.sql`); await run(`${APP}/seeds/demo_bot.sql`);
  console.log('4 migrations + seeds');

  const as = async (uid, sql, params = []) => {
    await db.query('begin');
    try {
      await db.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
      const r = await db.query(sql, params); await db.query('commit'); return r;
    } catch (e) { await db.query('rollback'); return { error: e.message, rows: [] }; }
  };
  const signup = async (name, role = 'cliente') => (await db.query('insert into auth.users (raw_user_meta_data) values ($1) returning id', [{ full_name: name, role }])).rows[0].id;
  const cli = await signup('Ana Souza'); const other = await signup('Intruso');
  const marcos = (await db.query("select md5('resolve-demo:marcos')::uuid id")).rows[0].id;
  const openConv = async (uid, pro) => (await as(uid, 'select id from public.open_conversation($1)', [pro])).rows[0].id;
  const conv = await openConv(cli, marcos);
  const conv2 = await openConv(other, marcos);

  console.log('\nBuckets');
  const b = (await db.query('select id, public, file_size_limit from storage.buckets order by id')).rows;
  ok(b.length === 2 && b[0].id === 'avatars' && b[0].public && b[1].id === 'request-photos' && !b[1].public, 'avatars público, request-photos privado');

  console.log('\nFotos do pedido (storage)');
  const put = (uid, bucket, name) => as(uid, 'insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, name]);
  ok(!(await put(cli, 'request-photos', `${conv}/a.jpg`)).error, 'cliente envia foto na pasta da conversa');
  ok(!!(await put(other, 'request-photos', `${conv}/b.jpg`)).error, 'estranho não envia na conversa dos outros');
  ok(!!(await put(cli, 'request-photos', `${conv2}/c.jpg`)).error, 'cliente não envia na pasta de outra conversa');
  ok(!!(await put(cli, 'request-photos', `a.jpg`)).error, 'foto fora de pasta de conversa é recusada');
  ok(!!(await put(null, 'request-photos', `${conv}/d.jpg`)).error, 'anon não envia');
  ok((await as(cli, "select name from storage.objects where bucket_id = 'request-photos'")).rows.length === 1, 'cliente vê a própria foto');
  ok((await as(other, "select name from storage.objects where bucket_id = 'request-photos'")).rows.length === 0, 'estranho não vê');
  ok((await as(null, "select name from storage.objects where bucket_id = 'request-photos'")).rows.length === 0, 'anon não vê');
  // profissional da conversa: simula com um profissional real
  const pro = await signup('Pro Real', 'profissional');
  await as(pro, "insert into public.professional_services values ($1, 'encanador')", [pro]);
  const conv3 = await openConv(cli, pro);
  await put(cli, 'request-photos', `${conv3}/x.jpg`);
  ok((await as(pro, "select name from storage.objects where bucket_id = 'request-photos'")).rows.map((r) => r.name).join() === `${conv3}/x.jpg`, 'profissional vê só as fotos das conversas dele');
  ok((await as(other, "delete from storage.objects where name = $1", [`${conv}/a.jpg`])).rowCount === 0, 'estranho não apaga');
  ok((await as(cli, "delete from storage.objects where name = $1", [`${conv}/a.jpg`])).rowCount === 1, 'quem enviou apaga');

  console.log('\nFoto de perfil (storage)');
  ok(!(await put(cli, 'avatars', `${cli}/avatar.jpg`)).error, 'envia na própria pasta');
  ok(!!(await put(cli, 'avatars', `${other}/avatar.jpg`)).error, 'não envia na pasta de outro');
  ok((await as(null, "select name from storage.objects where bucket_id = 'avatars'")).rows.length === 0, 'anon NÃO lista os avatares');
  ok((await as(other, "select name from storage.objects where bucket_id = 'avatars'")).rows.length === 0, 'outro usuário NÃO lista os avatares');
  ok((await as(cli, "select name from storage.objects where bucket_id = 'avatars'")).rows.length === 1, 'o dono vê a própria pasta');
  ok((await as(other, "update storage.objects set name = name where bucket_id = 'avatars'")).rowCount === 0, 'outro não troca o avatar');
  ok((await as(cli, "update storage.objects set name = name where bucket_id = 'avatars'")).rowCount === 1, 'dono troca (upsert)');

  console.log('\nFotos na mensagem de pedido');
  const req = (uid, c, photos) => as(uid, "select public.create_request($1, 'encanador', 'Torneira', 'Hoje, manhã', null, $2)", [c, photos]);
  ok(!!(await req(cli, conv, [`${conv2}/z.jpg`])).error, 'foto de outra conversa na mensagem é recusada');
  ok(!!(await req(cli, conv, [1, 2, 3, 4, 5].map((i) => `${conv}/${i}.jpg`))).error, 'mais de 4 fotos é recusado');
  ok(!!(await as(cli, "insert into public.messages (conversation_id, body, photos) values ($1, 'oi', $2)", [conv, [`${conv}/1.jpg`]])).error, 'texto com fotos é recusado');

  console.log('\nPush');
  await as(cli, "select public.register_push_token('ExponentPushToken[cliente]', 'android')");
  await db.query('delete from net.calls');
  ok(!(await req(cli, conv, [`${conv}/1.jpg`, `${conv}/2.jpg`])).error, 'pedido com 2 fotos da própria conversa');
  const calls = (await db.query('select body from net.calls order by id')).rows.map((r) => r.body);
  const flat = calls.flat();
  ok(calls.length === 2, `2 envios para a Expo (saudação + proposta do robô), sem push para o próprio cliente: ${calls.length}`);
  ok(flat[0]?.to === 'ExponentPushToken[cliente]' && flat[0]?.title === 'Marcos Oliveira' && flat[0]?.body === 'Oi! Aqui é Marcos. Vi seu pedido e consigo te ajudar.', 'saudação: título com o nome, texto da mensagem');
  ok(flat[1]?.body === 'Proposta: R$ 120,00 · Hoje, manhã', `proposta: "${flat[1]?.body}"`);
  ok(flat[0]?.data?.url === `/chat/${conv}` && flat[0]?.channelId === 'mensagens', 'abre o chat certo ao tocar; canal "mensagens"');
  ok((await db.query("select url from net.calls limit 1")).rows[0].url === 'https://exp.host/--/api/v2/push/send', 'URL da API de push da Expo');

  await db.query('delete from net.calls');
  const pid = (await as(cli, "select id from public.proposals where conversation_id = $1 and status = 'pending'", [conv])).rows[0].id;
  await as(cli, 'select public.accept_proposal($1)', [pid]);
  const c2 = (await db.query('select body from net.calls')).rows.map((r) => r.body).flat();
  ok(c2.length === 1 && c2[0].body.startsWith('Perfeito, combinado!'), 'aceite: o cliente (quem aceitou) não recebe o aviso de sistema, só a resposta do robô');

  await db.query('delete from net.calls');
  await as(pro, "select public.register_push_token('ExponentPushToken[pro]', 'ios')");
  await req(cli, conv3, []);
  const c3 = (await db.query('select body from net.calls')).rows.map((r) => r.body).flat();
  ok(c3.length === 1 && c3[0].to === 'ExponentPushToken[pro]' && c3[0].title === 'Ana Souza' && c3[0].body === 'Novo pedido de orçamento: Torneira', 'profissional real recebe "Novo pedido de orçamento"');

  console.log('\nFalha no envio');
  await db.query('drop function net.http_post(text, jsonb, jsonb, jsonb, int)');
  const r = await as(cli, "insert into public.messages (conversation_id, body) values ($1, 'ainda funciona?')", [conv3]);
  ok(!r.error, 'sem pg_net, a mensagem é gravada mesmo assim');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
