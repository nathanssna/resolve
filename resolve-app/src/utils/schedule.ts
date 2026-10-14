/**
 * Quando é o serviço: um dia e um período (manhã, tarde, noite).
 *
 * No banco, a proposta guarda `scheduled_at` (o começo do período, no horário
 * do aparelho) e um texto absoluto para avisos e push ("Sex 17/10, tarde").
 * Na tela, o texto é relativo a hoje ("Hoje, à tarde") e é calculado na hora,
 * para não envelhecer. Pedidos antigos guardavam "Hoje, tarde", relativo ao
 * dia em que foram feitos: `parseSchedule` entende os dois formatos.
 */
export type PeriodId = 'manha' | 'tarde' | 'noite';
export type Schedule = { /** Meia-noite do dia, no horário do aparelho (ms). */ day: number; period: PeriodId };

export const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const PERIODS: { id: PeriodId; label: string; hint: string; hour: number }[] = [
  { id: 'manha', label: 'Manhã', hint: '8h–12h', hour: 8 },
  { id: 'tarde', label: 'Tarde', hint: '13h–17h', hour: 13 },
  { id: 'noite', label: 'Noite', hint: '18h–20h', hour: 18 },
];
const AT: Record<PeriodId, string> = { manha: 'de manhã', tarde: 'à tarde', noite: 'à noite' };
const periodOf = (id: PeriodId) => PERIODS.find((p) => p.id === id) ?? PERIODS[0];

const midnight = (ts: number) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const addDays = (day: number, n: number) => {
  const d = new Date(day);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
};
/** Dias entre hoje e `day` (0 = hoje, 1 = amanhã, -1 = ontem). */
const daysFrom = (day: number, now: number) => Math.round((day - midnight(now)) / 86_400_000);
const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Próximos `n` dias, a partir de hoje, para a faixa de escolha. */
export function nextDays(n: number, now = Date.now()) {
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(midnight(now), i);
    const d = new Date(day);
    return { day, label: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : WEEK[d.getDay()], sub: ddmm(d) };
  });
}

/** O próximo período que ainda dá tempo hoje (ou amanhã de manhã, à noite). */
export function soonest(now = Date.now()): Schedule {
  const h = new Date(now).getHours();
  if (h < 12) return { day: midnight(now), period: h < 10 ? 'manha' : 'tarde' };
  if (h < 17) return { day: midnight(now), period: h < 15 ? 'tarde' : 'noite' };
  return h < 19 ? { day: midnight(now), period: 'noite' } : { day: addDays(midnight(now), 1), period: 'manha' };
}

/** O instante gravado em `scheduled_at`: começo do período. */
export function scheduleAt(s: Schedule) {
  const d = new Date(s.day);
  d.setHours(periodOf(s.period).hour, 0, 0, 0);
  return d;
}

/** De `scheduled_at` de volta para dia e período. */
export function fromScheduledAt(ts: number): Schedule {
  const h = new Date(ts).getHours();
  return { day: midnight(ts), period: h < 12 ? 'manha' : h < 17 ? 'tarde' : 'noite' };
}

/** Texto absoluto, para o banco (avisos do chat e push): "Sex 17/10, tarde". */
export function scheduleLabel(s: Schedule) {
  const d = new Date(s.day);
  return `${WEEK[d.getDay()]} ${ddmm(d)}, ${periodOf(s.period).label.toLowerCase()}`;
}

/**
 * Lê "Sex 17/10, tarde" ou o formato antigo "Hoje, tarde" / "Amanhã, manhã"
 * (relativo a `ref`, quando foi escrito). Outro texto ("O quanto antes") → null.
 */
export function parseSchedule(text: string, ref: number): Schedule | null {
  const m = /^\s*(hoje|amanh[ãa]|[a-zá]{3}\.?\s+(\d{1,2})\/(\d{1,2}))\s*,\s*(manh[ãa]|tarde|noite)\s*$/i.exec(text);
  if (!m) return null;
  const head = m[1].toLowerCase();
  let day: number;
  if (head === 'hoje') day = midnight(ref);
  else if (head.startsWith('amanh')) day = addDays(midnight(ref), 1);
  else {
    const dd = Number(m[2]);
    const mm = Number(m[3]);
    // Sem ano no texto: o da data mais perto de `ref` (pedido de dezembro para janeiro).
    const year = new Date(ref).getFullYear();
    const options = [year - 1, year, year + 1].map((y) => new Date(y, mm - 1, dd)).filter((d) => d.getDate() === dd && d.getMonth() === mm - 1);
    if (!options.length) return null;
    day = options.reduce((best, d) => (Math.abs(d.getTime() - ref) < Math.abs(best.getTime() - ref) ? d : best)).getTime();
  }
  const p = m[4].toLowerCase();
  return { day, period: p.startsWith('manh') ? 'manha' : p === 'tarde' ? 'tarde' : 'noite' };
}

/** Na tela: "Hoje, à tarde", "Amanhã, de manhã", "Ontem, à noite", "Sex 17/10, à tarde". */
export function formatSchedule(s: Schedule, now = Date.now()) {
  const diff = daysFrom(s.day, now);
  const d = new Date(s.day);
  const head = diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : diff === -1 ? 'Ontem' : `${WEEK[d.getDay()]} ${ddmm(d)}`;
  return `${head}, ${AT[s.period]}`;
}

export const isToday = (s: Schedule, now = Date.now()) => daysFrom(s.day, now) === 0;

/** Prazo para cancelar sem consequência, antes do começo do período. */
export const CANCEL_NOTICE_HOURS = 12;

/**
 * Cancelar agora é "em cima da hora"? Menos de 12 h para o começo do período,
 * até o fim do dia do serviço (depois disso o serviço já passou). Mesma regra
 * do banco (cancel_order).
 */
export function cancelIsLate(s: Schedule | undefined, now = Date.now()) {
  return !!s && daysFrom(s.day, now) >= 0 && now > scheduleAt(s).getTime() - CANCEL_NOTICE_HOURS * 3_600_000;
}

/** Para ordenar a agenda: dia e depois período. */
export const scheduleOrder = (s: Schedule) => scheduleAt(s).getTime();
