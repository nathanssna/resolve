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

/**
 * Lê um valor em reais de um texto: "faz por 120?" → 120, "R$ 1.500" → 1500.
 * Só conta número com cara de dinheiro ("R$", "reais", "por 120"…),
 * pra "pode vir às 14h?" ou "dia 15" não virarem contraproposta.
 */
export function parseAmount(text: string): number | null {
  const t = text.toLowerCase().replace(/(\d)\.(?=\d{3}\b)/g, '$1');
  const num = String.raw`(\d{2,5})(?:,(\d{1,2}))?(?![\d:h])`;
  const m =
    t.match(/r\$\s*(\d{1,5})(?:,(\d{1,2}))?/) ??
    t.match(new RegExp(`${num}\\s*(?:reais|conto|pila)\\b`)) ??
    t.match(new RegExp(`\\b(?:por|faz|fecha|fechar|pago|valor|ofereço|ofereco|consigo)\\s+(?:uns\\s+|de\\s+)?${num}`));
  if (!m) return null;
  return Number(m[1]) + (m[2] ? Number(m[2].padEnd(2, '0')) / 100 : 0);
}
