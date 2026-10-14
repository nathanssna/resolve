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

  // Como o app chama: anônimo (visitante) pela API.
  const search = async (q) => {
    await db.query('begin'); await db.query('set local role anon');
    try { return (await db.query('select service_id, score from public.search_services($1)', [q])).rows; } finally { await db.query('rollback'); }
  };
  const show = (rows) => rows.map((r) => `${r.service_id} ${Number(r.score).toFixed(2)}`).join(', ') || '(nada)';

  console.log('\nFrases → primeiro resultado');
  const first = [
    ['preciso instalar um chuveiro', 'encanador'],
    ['torneira pingando', 'encanador'],
    ['privada entupida', 'encanador'],
    ['cano vazando na cozinha', 'encanador'],
    ['tomada sem energia', 'eletricista'],
    ['o disjuntor fica desarmando', 'eletricista'],
    ['instalar lustre na sala', 'eletricista'],
    ['meu notebook está muito lento', 'informatica'],
    ['wifi caindo toda hora', 'informatica'],
    ['montar guarda roupa', 'montagem-moveis'],
    ['fixar suporte de tv na parede', 'montagem-moveis'],
    ['parede com mofo', 'pintor'],
    ['pintar o portão', 'pintor'],
    ['faxina no apartamento', 'limpeza'],
    ['limpar o sofá', 'limpeza'],
    ['ar condicionado não gela', 'ar-condicionado'],
    ['ar pingando água', 'ar-condicionado'],
    ['fiquei trancado pra fora de casa', 'chaveiro'],
    ['perdi a chave', 'chaveiro'],
    // sem acento, pela metade e com erro de digitação
    ['instalacao de chuveiro', 'encanador'],
    ['eletrica', 'eletricista'],
    ['fechadur', 'chaveiro'],
    ['chuvero', 'encanador'],
    ['geladeria', null],
  ];
  for (const [q, want] of first) {
    const r = await search(q);
    ok(want ? r[0]?.service_id === want : r.length === 0, `"${q}" → ${show(r)}`);
  }

  console.log('\nO que não deve aparecer');
  const chuveiro = (await search('preciso instalar um chuveiro')).map((r) => r.service_id);
  ok(chuveiro.join() === 'encanador,eletricista', `"preciso instalar um chuveiro" traz só encanador e eletricista (${chuveiro})`);
  const notebook = (await search('meu notebook está muito lento')).map((r) => r.service_id);
  ok(notebook.join() === 'informatica', `"meu notebook está muito lento" traz só informática (${notebook})`);
  const torneira = (await search('torneira pingando')).map((r) => r.service_id);
  ok(!torneira.includes('ar-condicionado'), `"torneira pingando" não traz ar-condicionado (${torneira})`);
  const cozinha = (await search('cano vazando na cozinha')).map((r) => r.service_id);
  ok(cozinha.join() === 'encanador', `cômodo não puxa limpeza: "cano vazando na cozinha" (${cozinha})`);
  const casa = (await search('fiquei trancado pra fora de casa')).map((r) => r.service_id);
  ok(casa.join() === 'chaveiro', `"fiquei trancado pra fora de casa" traz só chaveiro (${casa})`);
  ok((await search('instalar')).length >= 3, 'palavra genérica ("instalar") traz vários serviços');

  console.log('\nEntradas estranhas');
  ok((await search('')).length === 0, 'vazio → nada');
  ok((await search(null)).length === 0, 'null → nada');
  ok((await search('de um para o')).length === 0, 'só palavras vazias → nada');
  ok((await search("'; drop table x; --")).length === 0, 'texto com SQL é só texto');
  ok((await search('%_%')).length === 0, 'curingas do LIKE não casam tudo');
  ok((await search('chuveiro '.repeat(500))).length > 0, 'frase enorme não quebra');

  console.log(`\n${pass} ok, ${fail} falhas`); await db.end(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
