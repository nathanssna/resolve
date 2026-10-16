/** Linhas por consulta: a API do Supabase devolve no máximo 1000 (max_rows), sem avisar que cortou. */
export const PAGE_ROWS = 1000;

/**
 * Busca todas as linhas, página por página, até vir uma página incompleta.
 * `page(from, to)`: as linhas de `from` a `to` (inclusive), numa ordem estável.
 */
export async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, size = PAGE_ROWS): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
}
