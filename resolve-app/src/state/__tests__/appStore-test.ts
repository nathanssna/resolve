import { changesSince, EMPTY, mergeChanges, mergeFresh, mergeOlder, PAGE, pageStart, time, unreadCount, type Changes, type MessageRow, type OrderRow, type Store } from '../appStore';

// Minuto `n` de um dia qualquer, no formato do banco.
const at = (n: number) => new Date(Date.UTC(2026, 9, 15, 0, n)).toISOString().replace('Z', '+00:00');
const msg = (id: string, conv: string, minute: number, kind: MessageRow['kind'] = 'text'): MessageRow => ({
  id,
  conversation_id: conv,
  request_id: null,
  sender_id: 'u1',
  kind,
  body: id,
  proposal_id: null,
  request_when: null,
  request_address: null,
  photos: [],
  created_at: at(minute),
});
/** Página do mais novo para o mais antigo, de `newest` para trás. */
const page = (conv: string, newest: number, size: number) => Array.from({ length: size }, (_, i) => msg(`${conv}-${newest - i}`, conv, newest - i));
const conv = (id: string) => ({ id, professional_id: 'p', client_id: 'c', client_last_read_at: at(0), professional_last_read_at: at(0), updated_at: at(0), client: null, professional: null });

/** Busca completa como fetchStore devolve: a página mais recente de cada conversa. */
function fetched(pages: Record<string, MessageRow[]>, extra: MessageRow[] = []): Store {
  const s: Store = { ...EMPTY, convs: {}, messages: {}, history: {} };
  for (const [id, p] of Object.entries(pages)) {
    s.convs[id] = conv(id);
    for (const m of p) s.messages[m.id] = m;
    s.history[id] = pageStart(p);
  }
  for (const m of extra) s.messages[m.id] = m;
  return s;
}
const idsOf = (s: Store, c: string) =>
  Object.values(s.messages)
    .filter((m) => m.conversation_id === c)
    .map((m) => m.id)
    .sort();

describe('pageStart', () => {
  it('página incompleta: o histórico está todo aqui', () => {
    expect(pageStart(page('a', 10, 3))).toBeNull();
    expect(pageStart([])).toBeNull();
  });

  it('página cheia: começa na mais antiga, em qualquer ordem', () => {
    const p = page('a', 200, PAGE);
    expect(pageStart(p)).toBe(at(200 - PAGE + 1));
    expect(pageStart([...p].reverse())).toBe(at(200 - PAGE + 1));
  });
});

describe('mergeFresh', () => {
  it('primeira busca: fica o que veio', () => {
    const fresh = fetched({ a: page('a', 200, PAGE), b: page('b', 5, 2) });
    const s = mergeFresh(null, fresh);
    expect(s.history).toEqual({ a: at(151), b: null });
    expect(idsOf(s, 'a')).toHaveLength(PAGE);
  });

  it('volta ao app: mantém as antigas que o chat já tinha buscado', () => {
    // O chat carregou tudo (história completa); depois chegaram 3 mensagens.
    const before = mergeOlder(mergeFresh(null, fetched({ a: page('a', 200, PAGE) })), 'a', page('a', 150, 30));
    expect(before.history.a).toBeNull();
    const s = mergeFresh(before, fetched({ a: page('a', 203, PAGE) }));
    expect(s.history.a).toBeNull();
    expect(idsOf(s, 'a')).toHaveLength(203 - 121 + 1);
  });

  it('volta ao app sem ter buscado as antigas: o começo continua o mesmo', () => {
    const before = mergeFresh(null, fetched({ a: page('a', 200, PAGE) }));
    const s = mergeFresh(before, fetched({ a: page('a', 210, PAGE) }));
    expect(s.history.a).toBe(at(151));
  });

  it('chegou mais de uma página fora do app: começa no que veio (sem buraco na tela)', () => {
    const before = mergeOlder(mergeFresh(null, fetched({ a: page('a', 200, PAGE) })), 'a', page('a', 150, 10));
    const s = mergeFresh(before, fetched({ a: page('a', 300, PAGE) }));
    expect(s.history.a).toBe(at(251));
    // As antigas ficam guardadas; o chat volta a mostrá-las ao carregar as anteriores.
    expect(s.messages['a-150']).toBeDefined();
  });

  it('mensagem ainda não confirmada fica, mas não conta como já carregada', () => {
    const before = mergeFresh(null, fetched({ a: page('a', 200, PAGE) }));
    const tmp = { ...msg('tmp:1', 'a', 400), id: 'tmp:1' };
    const withTmp = { ...before, messages: { ...before.messages, [tmp.id]: tmp } };
    const s = mergeFresh(withTmp, fetched({ a: page('a', 300, PAGE) }));
    expect(s.messages['tmp:1']).toBeDefined();
    expect(s.history.a).toBe(at(251));
  });

  it('conversa que não veio mais some com as mensagens', () => {
    const before = mergeFresh(null, fetched({ a: page('a', 10, 3), b: page('b', 10, 3) }));
    const s = mergeFresh(before, fetched({ a: page('a', 10, 3) }));
    expect(idsOf(s, 'b')).toEqual([]);
    expect(s.history).toEqual({ a: null });
  });

  it('pedidos e propostas antigos (sempre carregados) não fecham o buraco', () => {
    // A busca traz o pedido de muito antes; a página de texto começa no minuto 251.
    const request = msg('pedido', 'a', 1, 'request');
    const before = mergeFresh(null, fetched({ a: page('a', 200, PAGE) }, [request]));
    const s = mergeFresh(before, fetched({ a: page('a', 300, PAGE) }, [request]));
    expect(s.history.a).toBe(at(251));
  });
});

describe('mergeOlder', () => {
  it('página cheia: ainda há mais antes', () => {
    const s = mergeOlder(mergeFresh(null, fetched({ a: page('a', 200, PAGE) })), 'a', page('a', 150, PAGE));
    expect(s.history.a).toBe(at(101));
    expect(idsOf(s, 'a')).toHaveLength(2 * PAGE);
  });

  it('página incompleta: chegou ao começo da conversa', () => {
    const s = mergeOlder(mergeFresh(null, fetched({ a: page('a', 200, PAGE) })), 'a', page('a', 150, 7));
    expect(s.history.a).toBeNull();
  });

  it('não mexe nas outras conversas', () => {
    const before = mergeFresh(null, fetched({ a: page('a', 200, PAGE), b: page('b', 200, PAGE) }));
    const s = mergeOlder(before, 'a', page('a', 150, 7));
    expect(s.history.b).toBe(before.history.b);
  });
});

describe('unreadCount', () => {
  // Mensagens da outra pessoa (u1) nos minutos 100 a 149: as 50 carregadas.
  const loaded = page('c1', 149, PAGE);
  const me = 'u2';

  it('só com as carregadas: as de outra pessoa depois da última leitura', () => {
    expect(unreadCount(loaded, me, time(at(139)))).toBe(10);
    expect(unreadCount(loaded, 'u1', time(at(0)))).toBe(0);
  });

  it('com não lidas antes do trecho carregado: soma as do banco', () => {
    // 60 não lidas: 50 carregadas + 10 antes do minuto 100.
    expect(unreadCount(loaded, me, time(at(89)), { before: at(100), n: 10 })).toBe(60);
  });

  it('carregar as anteriores não conta duas vezes', () => {
    const more = [...loaded, ...page('c1', 99, 10)];
    expect(unreadCount(more, me, time(at(89)), { before: at(100), n: 10 })).toBe(60);
  });

  it('depois de ler, as antigas não contam mais', () => {
    expect(unreadCount([...loaded, msg('novo', 'c1', 150)], me, time(at(149)), { before: at(100), n: 10 })).toBe(1);
  });
});

describe('changesSince', () => {
  it('nada carregado: busca completa', () => {
    expect(changesSince(EMPTY)).toBeNull();
  });

  it('a marca mais recente do banco, 1 minuto antes', () => {
    const s = fetched({ a: page('a', 120, 3) });
    s.convs.a = { ...s.convs.a, updated_at: at(130) };
    expect(changesSince(s)).toBe(new Date(time(at(129))).toISOString());
  });

  it('ignora a mensagem ainda não confirmada (hora do aparelho)', () => {
    const s = fetched({ a: page('a', 120, 3) }, [{ ...msg('tmp:x', 'a', 999) }]);
    expect(changesSince(s)).toBe(new Date(time(at(119))).toISOString());
  });
});

describe('mergeChanges', () => {
  const none: Changes = { convs: [], messages: [], requests: [], proposals: [], orders: [], reviews: [], clientReviews: [] };
  const order = (id: string, conv: string, o: Partial<OrderRow> = {}) => ({ id, conversation_id: conv, status: 'combinado', updated_at: at(1), ...o }) as OrderRow;

  it('junta mensagens novas e leitura, sem mexer no histórico', () => {
    const s = fetched({ a: page('a', 200, PAGE) });
    const next = mergeChanges(s, { ...none, messages: [msg('a-201', 'a', 201)], convs: [{ id: 'a', client_last_read_at: at(201), professional_last_read_at: at(0), updated_at: at(201) }] })!;
    expect(idsOf(next, 'a')).toContain('a-201');
    expect(next.history.a).toBe(s.history.a);
    expect(next.convs.a.client_last_read_at).toBe(at(201));
    expect(next.convs.a.client).toBeNull();
  });

  it('serviço atualizado e avaliações novas', () => {
    const s = { ...fetched({ a: page('a', 10, 2) }), orders: { o1: order('o1', 'a') } };
    const next = mergeChanges(s, {
      ...none,
      orders: [order('o1', 'a', { status: 'concluido' })],
      reviews: [{ order_id: 'o1', rating: 5, comment: 'Ótimo' }],
      clientReviews: [{ order_id: 'o1', rating: 4 }],
    })!;
    expect(next.orders.o1).toMatchObject({ status: 'concluido', rating: 5, comment: 'Ótimo', clientRating: 4 });
  });

  it('conversa nova: pede a busca completa', () => {
    const s = fetched({ a: page('a', 10, 2) });
    expect(mergeChanges(s, { ...none, messages: [msg('b-1', 'b', 1)] })).toBeNull();
    expect(mergeChanges(s, { ...none, convs: [{ id: 'b', client_last_read_at: at(0), professional_last_read_at: at(0), updated_at: at(1) }] })).toBeNull();
  });

  it('sem mudanças: o mesmo conteúdo', () => {
    const s = fetched({ a: page('a', 10, 2) });
    expect(mergeChanges(s, none)).toEqual(s);
  });
});
