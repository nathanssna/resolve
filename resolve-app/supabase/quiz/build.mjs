// Gera supabase/quiz.sql a partir dos bancos de questões (supabase/quiz/*.json).
// Uso: npm run quiz:sql. Depois aplique no banco: npx supabase db query --linked -f supabase/quiz.sql
//
// Cada banco: { service, title, draw, pass, minutes, sources: { chave: texto }, questions: [...] }.
// Em cada questão, options[0] é a certa (o servidor embaralha) e source é uma chave de `sources`.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, '..', 'quiz.sql');

// Nome curto da fonte, mostrado no canto da questão durante o teste.
const SOURCE = {
  nr10: 'NR-10', nr35: 'NR-35', nbr5410: 'NBR 5410', nbr14136: 'NBR 14136', nbr14913: 'NBR 14913',
  lorenzetti: 'Manual Lorenzetti', procobre: 'Procobre / NBR 5410', cemig: 'Cemig', pratica: 'Prática de campo',
  tigre: 'Manual técnico Tigre', sabesp: 'Sabesp', saude: 'Secretaria da Saúde', saae: 'SAAE',
  midea: 'Manual Midea Springer', abrava: 'ABRAVA', a2l: 'ABRAVA / LG', pmoc: 'Lei 13.589/2018',
  tramontina: 'Manual Tramontina', manual: 'Manual do móvel', fischer: 'Fischer', knauf: 'Knauf / Placo',
  tombamento: 'CPSC (EUA)', mdf: 'Fabricantes de MDF', coral: 'Boletim Coral', suvinil: 'Suvinil',
  metal: 'Suvinil / Coral', abrafati: 'ABRAFATI', certbr: 'CERT.br', dell: 'Manual Dell', lgpd: 'LGPD',
  software: 'Lei do Software', recuperacao: 'Recuperação de arquivos', windows11: 'Microsoft',
  impressora: 'HP', reserva: 'Rede doméstica', samsung: 'Samsung', tv: 'Netflix / Wi-Fi', cabo: 'Cabo de rede',
  cp: 'Código Penal', cdc: 'Código de Defesa do Consumidor', porto: 'Porto Seguro', df: 'Portaria SSPDS/DF',
  porta: 'Segurança da porta', stam: 'Manual Stam', transponder: 'Chave codificada', antipanico: 'Saída de emergência',
  anvisa: 'Anvisa', 'anvisa-mistura': 'Anvisa', marmore: 'Pedras naturais',
  dvr: 'Manual Intelbras', camera: 'Manual Intelbras', mibo: 'Intelbras Mibo', condominio: 'LGPD em condomínio',
  interruptor: 'Manual Intelbras', tomada: 'Manual Intelbras', alexa: 'Amazon Echo',
};

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const arr = (xs) => `array[${xs.map(q).join(', ')}]::text[]`;

const banks = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(DIR, f), 'utf8')) }));

const errors = [];
const ids = new Set();
for (const b of banks) {
  if (!(b.draw > 0 && b.pass > 0 && b.pass <= b.draw && b.minutes > 0)) errors.push(`${b.file}: draw/pass/minutes inválidos`);
  if (b.questions.length < b.draw) errors.push(`${b.file}: só ${b.questions.length} questões para sortear ${b.draw}`);
  for (const x of b.questions) {
    if (ids.has(x.id)) errors.push(`${b.file}: id repetido ${x.id}`);
    ids.add(x.id);
    if (x.options?.length !== 4 || new Set(x.options).size !== 4) errors.push(`${b.file}: ${x.id} precisa de 4 alternativas diferentes`);
    if (!(x.source in b.sources)) errors.push(`${b.file}: ${x.id} usa fonte desconhecida (${x.source})`);
    if (!SOURCE[x.source]) errors.push(`${b.file}: ${x.id} — falta o nome curto da fonte "${x.source}" em build.mjs`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const lines = [
  '-- Gerado por supabase/quiz/build.mjs a partir de supabase/quiz/*.json. Não edite à mão.',
  '-- Idempotente: atualiza testes e questões e desativa as que saíram dos bancos.',
  'begin;',
  '',
];
for (const b of banks) {
  lines.push(`-- ${b.title} (${b.questions.length} questões, sorteia ${b.draw}, passa com ${b.pass}, ${b.minutes} min)`);
  lines.push(
    `insert into public.quiz_tests (service_id, label, draw, pass, minutes) values (${q(b.service)}, ${q(b.title)}, ${b.draw}, ${b.pass}, ${b.minutes})`,
    '  on conflict (service_id) do update set label = excluded.label, draw = excluded.draw, pass = excluded.pass, minutes = excluded.minutes;',
  );
  lines.push('insert into private.quiz_questions (id, service_id, topic, question, options, why, source, active, updated_at) values');
  lines.push(
    b.questions
      .map((x) => `  (${q(x.id)}, ${q(b.service)}, ${q(x.topic)}, ${q(x.question)}, ${arr(x.options)}, ${q(x.why)}, ${q(SOURCE[x.source])}, true, now())`)
      .join(',\n'),
  );
  lines.push(
    'on conflict (id) do update set service_id = excluded.service_id, topic = excluded.topic, question = excluded.question,',
    '  options = excluded.options, why = excluded.why, source = excluded.source, active = true, updated_at = now();',
  );
  lines.push(
    `update private.quiz_questions set active = false, updated_at = now() where service_id = ${q(b.service)} and id <> all (${arr(b.questions.map((x) => x.id))});`,
    '',
  );
}
lines.push('commit;', '');
writeFileSync(OUT, lines.join('\n'));
console.log(`supabase/quiz.sql: ${banks.length} testes, ${ids.size} questões`);
