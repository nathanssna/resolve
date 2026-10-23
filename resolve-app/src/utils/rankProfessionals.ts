import type { Distance } from '@/state/distances';
import type { Professional } from '@/state/catalog';

export type ProSort = 'recomendados' | 'proximos' | 'avaliados' | 'rapidos';

/** Empurrão nos recomendados: Profissional de Ouro vale meia estrela; só as aulas, um quinto de estrela. */
export const GOLD_BOOST = 10;
export const LESSONS_BOOST = 4;

/** Recomendação simples: nota, volume e rapidez, mais o empurrão do Ouro (ou só das aulas). */
const score = (p: Professional) =>
  p.rating * 20 + Math.min(p.jobs, 500) / 50 - p.replyMin / 5 + (p.gold ? GOLD_BOOST : p.lessonsDone ? LESSONS_BOOST : 0);

export function sortProfessionals(list: Professional[], sort: ProSort, dist?: Map<string, Distance> | null) {
  const copy = [...list];
  if (sort === 'recomendados') copy.sort((a, b) => score(b) - score(a));
  if (sort === 'proximos') copy.sort((a, b) => (dist?.get(a.id)?.km ?? 999) - (dist?.get(b.id)?.km ?? 999));
  if (sort === 'avaliados') copy.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
  if (sort === 'rapidos') copy.sort((a, b) => a.replyMin - b.replyMin);
  return copy;
}
