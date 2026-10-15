import type { Distance } from '@/state/distances';
import type { Professional } from '@/state/catalog';

export type ProSort = 'recomendados' | 'proximos' | 'avaliados' | 'rapidos';

/** Recomendação simples: nota, volume e rapidez. */
const score = (p: Professional) => p.rating * 20 + Math.min(p.jobs, 500) / 50 - p.replyMin / 5;

export function sortProfessionals(list: Professional[], sort: ProSort, dist?: Map<string, Distance> | null) {
  const copy = [...list];
  if (sort === 'recomendados') copy.sort((a, b) => score(b) - score(a));
  if (sort === 'proximos') copy.sort((a, b) => (dist?.get(a.id)?.km ?? 999) - (dist?.get(b.id)?.km ?? 999));
  if (sort === 'avaliados') copy.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
  if (sort === 'rapidos') copy.sort((a, b) => a.replyMin - b.replyMin);
  return copy;
}
