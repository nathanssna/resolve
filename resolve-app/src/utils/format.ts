/** 4.8 → "4,8" */
export function formatDecimal(n: number, digits = 1) {
  return n.toFixed(digits).replace('.', ',');
}

/** 1245 → "1.245" */
export function formatCount(n: number) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 2.3 → "2,3 km de você" */
export function formatDistance(km: number) {
  return `${formatDecimal(km)} km de você`;
}

/** 1 → "1 ano de experiência", 5 → "5 anos de experiência" */
export function formatExperience(years: number) {
  return `${years} ${years === 1 ? 'ano' : 'anos'} de experiência`;
}

/** 150 → "R$ 150,00" */
export function formatBRL(n: number) {
  const [int, dec] = n.toFixed(2).split('.');
  return `R$ ${formatCount(Number(int))},${dec}`;
}

/** Hora "14:05" de um timestamp. */
export function formatTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "Hoje", "Ontem" ou "12/09" para listas de conversa. */
export function formatDay(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86400000);
  if (diff === 0) return formatTime(ts);
  if (diff === 1) return 'Ontem';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Primeiro nome. */
export function firstName(name: string) {
  return name.split(' ')[0];
}

/** Valor digitado em reais: "150" → 150, "1.500,50" → 1500.5, "99.9" → 99.9. Inválido → null. */
export function parseBRLInput(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  // Com vírgula, o ponto é milhar; sem vírgula, um único ponto com 1–2 casas é decimal.
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d+\.\d{1,2}$/.test(t) ? t : t.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n <= 99_999_999 ? n : null;
}

/** Celular/telefone brasileiro enquanto digita: "11912345678" → "(11) 91234-5678". Aceita "+55…". */
export function formatPhoneBR(text: string) {
  let d = text.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  const cut = rest.length > 8 ? 5 : 4;
  return rest.length > cut ? `(${ddd}) ${rest.slice(0, cut)}-${rest.slice(cut)}` : `(${ddd}) ${rest}`;
}
