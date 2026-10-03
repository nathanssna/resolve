const fs = require('fs'); const { Client } = require('pg');
const APP = require('path').resolve(__dirname, '../../supabase');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ok   ' : '  FALHA', m); };
(async () => {
  const a = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'postgres' }); await a.connect();
  await a.query('drop database if exists b'); await a.query('create database b'); await a.end();
  const db = new Client({ host: '127.0.0.1', port: 54999, user: 'postgres', database: 'b' }); await db.connect();
  db.on('notice', (n) => { if (n.severity === 'WARNING') console.log('    (warning do banco:', n.message + ')'); });
  const run = (f) => db.query(fs.readFileSync(f, 'utf8'));
  await run(__dirname + '/bootstrap.sql');
  for (const m of fs.readdirSync(`${APP}/migrations`).sort()) await db.query(fs.readFileSync(`${APP}/migrations/${m}`, 'utf8').replace(/create extension if not exists pg_net;/, ''));
  await run(`${APP}/seed.sql`); await run(`${APP}/seeds/demo_professionals.sql`); await run(`${APP}/seeds/demo_bot.sql`); await run(`${APP}/seeds/demo_bot.sql`);
  console.log('migrations + seeds (robô aplicado 2x)');

  const as = async (uid, sql, params = []) => {
    await db.query('begin');
    try {
      await db.query('set local role authenticated');
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      const r = await db.query(sql, params); await db.query('commit'); return r.rows;
    } catch (e) { await db.query('rollback'); throw e; }
  };
  const signup = async () => (await db.query('insert into auth.users (raw_user_meta_data) values (null) returning id')).rows[0].id;
  const cli = await signup();
  await as(cli, "select public.complete_onboarding('Ana Souza', 'cliente')");
  const marcos = (await db.query("select md5('resolve-demo:marcos')::uuid id")).rows[0].id;
  // Pedido pelo fluxo do app: abre (ou reaproveita) a conversa e cria o pedido.
  const newReq = async (pro, svc, body, when, address = null) => {
    const c = (await as(cli, 'select id from public.open_conversation($1)', [pro]))[0].id;
    await as(cli, 'select public.create_request($1, $2, $3, $4, $5)', [c, svc, body, when, address]);
    return c;
  };
  const msgs = async (conv) => as(cli, `select m.kind, m.sender_id, m.body, p.amount, p.status, p.scheduled_label, m.created_at
    from public.messages m left join public.proposals p on p.id = m.proposal_id where m.conversation_id = $1 order by m.created_at`, [conv]);

  console.log('\nValor no texto (mesmos casos do parseAmount do app)');
  const cases = [['faz por 120?', 120], ['Consigo fechar por R$ 130', 130], ['R$ 1.500,50', 1500.5], ['150 reais', 150], ['fecha 99,9?', 99.9], ['Pode vir às 14h?', null], ['dia 15?', null], ['por 14:30', null], ['Qual o valor?', null], ['Aceita Pix?', null], ['consigo vir amanhã', null], ['pago 200 no pix', 200], ['me liga 11 99999-0000', null]];
  for (const [t, want] of cases) {
    const got = (await db.query('select private.demo_parse_amount($1) v', [t])).rows[0].v;
    ok((got === null ? null : Number(got)) === want, `"${t}" → ${got}`);
  }

  console.log('\nPedido para profissional demo');
  const conv = await newReq(marcos, 'encanador', 'Torneira pingando', 'Amanhã, tarde', { label: 'Casa', line: 'Rua A, 1', area: 'Centro' });
  let m = await msgs(conv);
  ok(m.length === 3 && m[0].kind === 'request' && m[1].kind === 'text' && m[2].kind === 'proposal', 'pedido → saudação → proposta, nessa ordem');
  ok(m[1].body === 'Oi! Aqui é Marcos. Vi seu pedido e consigo te ajudar.' && m[1].sender_id === marcos, 'saudação com o primeiro nome, enviada pelo profissional');
  ok(Number(m[2].amount) === 120 && m[2].scheduled_label === 'Amanhã, tarde' && m[2].status === 'pending', 'proposta R$ 120 (encanador) para "Amanhã, tarde"');
  ok(m.every((x, i) => i === 0 || x.created_at > m[i - 1].created_at), 'horários estritamente crescentes (clock_timestamp)');

  console.log('\nConversa');
  await as(cli, "insert into public.messages (conversation_id, body) values ($1, 'Pode vir às 14h?')", [conv]);
  m = await msgs(conv);
  ok(m.at(-1).body === 'Entendi! Se quiser, me fala um valor e eu vejo se consigo.' && m.filter((x) => x.kind === 'proposal').length === 1, 'horário não vira valor; robô pede um valor');
  await as(cli, "insert into public.messages (conversation_id, body) values ($1, 'faz por 100?')", [conv]);
  m = await msgs(conv);
  const props = m.filter((x) => x.kind === 'proposal');
  ok(m.at(-2).body === 'Consigo fazer por esse valor. Te mandei a proposta atualizada.' && Number(props.at(-1).amount) === 100, 'contraproposta: nova proposta de R$ 100');
  ok(props[0].status === 'superseded' && props.at(-1).status === 'pending' && props.at(-1).scheduled_label === 'Amanhã, tarde', 'anterior substituída; mantém o horário');

  console.log('\nAceite, conclusão e depois');
  const pid = (await as(cli, "select id from public.proposals where conversation_id = $1 and status = 'pending'", [conv]))[0].id;
  await as(cli, 'select public.accept_proposal($1)', [pid]);
  m = await msgs(conv);
  ok(m.at(-2).kind === 'system' && m.at(-2).body === 'Serviço combinado · R$ 100,00 · Amanhã, tarde', 'mensagem de sistema do aceite');
  ok(m.at(-1).body === 'Perfeito, combinado! Te aviso por aqui quando estiver a caminho.', 'robô responde ao aceite, depois do sistema');
  await as(cli, "insert into public.messages (conversation_id, body) values ($1, 'faz por 80?')", [conv]);
  m = await msgs(conv);
  ok(m.at(-1).body === 'Combinado! Qualquer coisa é só chamar por aqui.' && m.filter((x) => x.kind === 'proposal').length === 2, 'depois de combinado, valor no texto não gera proposta');
  const oid = (await as(cli, 'select id from public.orders where conversation_id = $1', [conv]))[0].id;
  await as(cli, 'select public.complete_order($1)', [oid]);
  ok((await msgs(conv)).at(-1).body === 'Obrigado! Se puder, deixe sua avaliação no app.', 'responde à conclusão');

  console.log('\nRecusa');
  const conv2 = await newReq(marcos, 'encanador', 'Pia entupida', 'O quanto antes');
  m = await msgs(conv2);
  ok(conv2 === conv, 'segundo pedido ao Marcos cai na mesma conversa');
  ok(m.at(-2).body === 'Oi de novo! Vi seu novo pedido e consigo te ajudar.', 'saudação de quem já conversou');
  ok(m.at(-1).scheduled_label === 'Hoje, 16h', '"O quanto antes" vira "Hoje, 16h"');
  const pid2 = (await as(cli, "select id from public.proposals where conversation_id = $1 and status = 'pending'", [conv2]))[0].id;
  await as(cli, 'select public.decline_proposal($1)', [pid2]);
  ok((await msgs(conv2)).at(-1).body === 'Sem problemas. Me diz um valor que fique bom pra você.', 'responde à recusa');
  await newReq(marcos, 'encanador', 'Ralo', 'Sábado');
  await as(cli, "insert into public.messages (conversation_id, body) values ($1, 'faz por 70?')", [conv]);
  const last = (await as(cli, "select p.amount, r.body from public.proposals p join public.messages r on r.request_id = p.request_id and r.kind = 'request' where p.conversation_id = $1 order by p.created_at desc limit 1", [conv]))[0];
  ok(Number(last.amount) === 70 && last.body === 'Ralo', 'com 2 pedidos em aberto, o valor vale para o mais recente');

  console.log('\nProfissional real (não demo)');
  const real = (await db.query("insert into auth.users (raw_user_meta_data) values ('{\"full_name\":\"Pro Real\",\"role\":\"profissional\"}') returning id")).rows[0].id;
  await as(real, "insert into public.professional_services values ($1, 'encanador')", [real]);
  const conv3 = await newReq(real, 'encanador', 'Chuveiro', 'Hoje, manhã');
  ok((await msgs(conv3)).length === 1, 'robô não responde por profissional real');

  console.log('\nRobô com erro');
  await db.query('drop function private.demo_quote(text)');
  let saved = true, conv4;
  try { conv4 = await newReq(marcos, 'encanador', 'Teste', 'Hoje, manhã'); } catch { saved = false; }
  ok(saved && (await msgs(conv4)).at(-1).kind === 'request', 'erro no robô não impede o pedido do cliente');
  await run(`${APP}/seeds/demo_bot.sql`);

  console.log('\nLimpeza');
  await run(`${APP}/demo_cleanup.sql`);
  const left = (await db.query("select (select count(*) from pg_trigger where tgname = 'demo_bot_reply')::int t, (select count(*) from pg_proc where proname like 'demo_%')::int f, (select count(*) from public.professionals where id = $1)::int p", [marcos])).rows[0];
  ok(left.t === 0 && left.f === 0 && left.p === 0, 'demo_cleanup.sql remove o robô e os profissionais demo');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
