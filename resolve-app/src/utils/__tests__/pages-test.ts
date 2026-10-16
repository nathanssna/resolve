import { fetchAllPages } from '../pages';

// Tabela falsa com `total` linhas, que corta em `cap` por consulta (como o max_rows da API).
const table = (total: number, cap = 1000) => {
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to + 1, total, from + cap);
    return { data: Array.from({ length: Math.max(0, end - from) }, (_, i) => from + i), error: null };
  };
  return { page, calls };
};

describe('fetchAllPages', () => {
  it('traz tudo além do limite de 1000 da API', async () => {
    const t = table(2500);
    const rows = await fetchAllPages(t.page);
    expect(rows).toHaveLength(2500);
    expect(rows.at(-1)).toBe(2499);
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('uma consulta só quando cabe numa página', async () => {
    const t = table(3);
    expect(await fetchAllPages(t.page)).toEqual([0, 1, 2]);
    expect(t.calls).toHaveLength(1);
  });

  it('exatamente 1000: confere a página seguinte (vazia)', async () => {
    const t = table(1000);
    expect(await fetchAllPages(t.page)).toHaveLength(1000);
    expect(t.calls).toHaveLength(2);
  });

  it('erro em qualquer página: falha (não devolve a lista pela metade)', async () => {
    let n = 0;
    const page = async () => (n++ === 1 ? { data: null, error: new Error('rede') } : { data: Array(1000).fill(0), error: null });
    await expect(fetchAllPages(page)).rejects.toThrow('rede');
  });
});
