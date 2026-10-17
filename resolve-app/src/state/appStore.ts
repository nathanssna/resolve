/**
 * Os dados do usuário guardados na memória (conversas, pedidos, mensagens…) e as
 * funções puras que juntam o que chega do banco ao que já está na tela.
 *
 * Mensagens: as de pedido e proposta vêm todas; das outras (texto e avisos), só as
 * PAGE mais recentes de cada conversa. As anteriores, o chat busca quando a pessoa
 * rola até o topo (mergeOlder).
 */
import type { Database, Json } from '@/lib/database.types';

/** Mensagens por página (abertura do app e "Carregar mensagens anteriores"). */
export const PAGE = 50;
export const MESSAGE_COLS = 'id, conversation_id, request_id, sender_id, kind, body, proposal_id, request_when, request_address, photos, created_at';
export const REQUEST_COLS = 'id, conversation_id, service_id, created_at, updated_at, closed_at, closed_by, request_address:request_addresses(address)';
export const PROPOSAL_COLS = 'id, conversation_id, request_id, amount, scheduled_label, scheduled_at, note, status, updated_at';
export const ORDER_COLS =
  'id, conversation_id, request_id, professional_id, service_id, amount, scheduled_label, scheduled_at, address, status, created_at, updated_at, completed_at, canceled_late, cancel_reason, done_at, done_photos, done_blocked, disputed_at, help_requested_at, completed_by, reschedule_at, reschedule_label, reschedule_by, client_confirmed_at, pro_confirmed_at, review:reviews(rating, comment), client_review:client_reviews(rating)';
/** Busca do que mudou: com mais que isso, sai mais barato buscar tudo de novo. */
export const CHANGES_MAX = 500;

export type Tables = Database['public']['Tables'];
export type PartyRow = { full_name: string; avatar_url: string | null; deleted_at: string | null };
export type ConvRow = Pick<Tables['conversations']['Row'], 'id' | 'professional_id' | 'client_id' | 'client_last_read_at' | 'professional_last_read_at' | 'updated_at'> & {
  client: PartyRow | null;
  /** Nome do profissional mesmo fora do catálogo (ex.: conta excluída). */
  professional: { profile: PartyRow | null } | null;
};
export type RequestRow = Pick<Tables['requests']['Row'], 'id' | 'conversation_id' | 'service_id' | 'created_at' | 'updated_at' | 'closed_at' | 'closed_by'> & {
  /** Endereço completo do pedido: só o cliente recebe (o banco devolve null para o profissional). */
  request_address?: { address: Json } | null;
};
export type MessageRow = Pick<
  Tables['messages']['Row'],
  'id' | 'conversation_id' | 'request_id' | 'sender_id' | 'kind' | 'body' | 'proposal_id' | 'request_when' | 'request_address' | 'photos' | 'created_at'
>;
export type ProposalRow = Pick<Tables['proposals']['Row'], 'id' | 'conversation_id' | 'request_id' | 'amount' | 'scheduled_label' | 'scheduled_at' | 'note' | 'status' | 'updated_at'>;
export type OrderRow = Pick<
  Tables['orders']['Row'],
  | 'id'
  | 'conversation_id'
  | 'request_id'
  | 'professional_id'
  | 'service_id'
  | 'amount'
  | 'scheduled_label'
  | 'scheduled_at'
  | 'address'
  | 'status'
  | 'created_at'
  | 'updated_at'
  | 'completed_at'
  | 'canceled_late'
  | 'cancel_reason'
  | 'done_at'
  | 'done_photos'
  | 'done_blocked'
  | 'disputed_at'
  | 'help_requested_at'
  | 'completed_by'
  | 'reschedule_at'
  | 'reschedule_label'
  | 'reschedule_by'
  | 'client_confirmed_at'
  | 'pro_confirmed_at'
> & { rating?: number; comment?: string | null; clientRating?: number };

export type Store = {
  convs: Record<string, ConvRow>;
  requests: Record<string, RequestRow>;
  messages: Record<string, MessageRow>;
  proposals: Record<string, ProposalRow>;
  orders: Record<string, OrderRow>;
  /**
   * Por conversa: `created_at` da mensagem mais antiga carregada sem buracos até a mais
   * recente; `null` = histórico completo. As mensagens de pedido e proposta vêm sempre
   * todas (os pedidos dependem delas), e podem estar antes disso.
   */
  history: Record<string, string | null>;
  /**
   * Por conversa, só quando há não lidas antes do trecho carregado: quantas eram (`n`) antes
   * de `before` (contadas pelo banco, unread_before). Mensagens novas chegam sempre depois.
   */
  olderUnread: Record<string, { before: string; n: number }>;
};
export const EMPTY: Store = { convs: {}, requests: {}, messages: {}, proposals: {}, orders: {}, history: {}, olderUnread: {} };

export const byId = <T extends { id: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.id, r]));
export const time = (iso: string) => Date.parse(iso);
/** Mensagem ainda não confirmada pelo banco. */
export const isTmp = (id: string) => id.startsWith('tmp:');

/** Onde começa o histórico contínuo de uma página buscada do mais novo para o mais antigo. */
export const pageStart = (page: MessageRow[]): string | null =>
  page.length < PAGE ? null : page.reduce((a, m) => (time(m.created_at) < time(a) ? m.created_at : a), page[0].created_at);

/**
 * Não lidas de uma conversa: as carregadas (de outra pessoa, depois da última leitura) mais as
 * anteriores ao trecho carregado, contadas pelo banco. Com `older`, as carregadas antes de
 * `older.before` já estão em `older.n` e não contam de novo (ex.: depois de carregar as anteriores).
 */
export function unreadCount(rows: MessageRow[], uid: string, readAt: number, older?: { before: string; n: number }) {
  const cut = older ? time(older.before) : -Infinity;
  const loaded = rows.filter((r) => r.sender_id !== uid && time(r.created_at) > readAt && time(r.created_at) >= cut).length;
  return loaded + (older && readAt < cut ? older.n : 0);
}

/** Como a linha do serviço vem do banco: com a avaliação de cada lado junto. */
export type OrderFromDb = Omit<OrderRow, 'rating' | 'comment' | 'clientRating'> & {
  review: { rating: number; comment: string | null } | null;
  /** Só a nota que o próprio profissional deu (o cliente não lê a tabela). */
  client_review: { rating: number } | null;
};
export const orderFromDb = ({ review, client_review, ...o }: OrderFromDb): OrderRow => ({
  ...o,
  rating: review?.rating,
  comment: review?.comment,
  clientRating: client_review?.rating,
});

/**
 * Desde quando buscar o que mudou: a marca mais recente já vista (do relógio do banco,
 * não do aparelho), com 1 minuto de folga para o que estava sendo gravado. Buscar a mais
 * não estraga nada: juntar é "inserir/atualizar por id". `null`: nada carregado ainda.
 */
export function changesSince(s: Store): string | null {
  let latest = -Infinity;
  const see = (iso: string | null | undefined) => {
    if (iso) latest = Math.max(latest, time(iso));
  };
  for (const m of Object.values(s.messages)) if (!isTmp(m.id)) see(m.created_at);
  for (const r of Object.values(s.requests)) see(r.updated_at);
  for (const p of Object.values(s.proposals)) see(p.updated_at);
  for (const o of Object.values(s.orders)) see(o.updated_at);
  for (const c of Object.values(s.convs)) see(c.updated_at);
  return latest === -Infinity ? null : new Date(latest - 60_000).toISOString();
}

export type Changes = {
  convs: Pick<ConvRow, 'id' | 'client_last_read_at' | 'professional_last_read_at' | 'updated_at'>[];
  messages: MessageRow[];
  requests: RequestRow[];
  proposals: ProposalRow[];
  orders: OrderRow[];
  /** Avaliações novas (não mudam a linha do serviço). */
  reviews: { order_id: string; rating: number; comment: string | null }[];
  clientReviews: { order_id: string; rating: number }[];
};

/**
 * Junta o que mudou ao que está na tela. `null` quando apareceu conversa nova (precisa dos
 * nomes e do resto: busca completa). Mensagens novas vêm depois do trecho carregado, então
 * o histórico contínuo continua valendo.
 */
export function mergeChanges(s: Store, c: Changes): Store | null {
  const known = (id: string) => !!s.convs[id];
  if (
    !c.convs.every((x) => known(x.id)) ||
    !c.messages.every((m) => known(m.conversation_id)) ||
    !c.requests.every((r) => known(r.conversation_id)) ||
    !c.orders.every((o) => known(o.conversation_id))
  ) {
    return null;
  }
  const convs = { ...s.convs };
  for (const x of c.convs) convs[x.id] = { ...convs[x.id], ...x };
  const orders = { ...s.orders };
  for (const o of c.orders) orders[o.id] = { ...orders[o.id], ...o };
  for (const r of c.reviews) if (orders[r.order_id]) orders[r.order_id] = { ...orders[r.order_id], rating: r.rating, comment: r.comment };
  for (const r of c.clientReviews) if (orders[r.order_id]) orders[r.order_id] = { ...orders[r.order_id], clientRating: r.rating };
  return {
    ...s,
    convs,
    messages: { ...s.messages, ...byId(c.messages) },
    requests: { ...s.requests, ...byId(c.requests) },
    proposals: { ...s.proposals, ...byId(c.proposals) },
    orders,
  };
}

/** A mais antiga das duas marcas (`null` = desde o começo). */
const earliest = (a: string | null, b: string | null) => (a === null || b === null ? null : time(a) < time(b) ? a : b);

/**
 * Junta uma busca completa (abertura, volta ao app, reconexão) ao que já estava na tela.
 * As mensagens nunca mudam depois de gravadas: as antigas que o chat já tinha buscado
 * continuam, e o histórico só encolhe quando há um buraco entre o que havia e o que veio.
 * Conversas que não vieram mais (ex.: conta excluída) somem com as mensagens.
 */
export function mergeFresh(prev: Store | null, fresh: Store): Store {
  const messages: Record<string, MessageRow> = {};
  const latestBefore: Record<string, number> = {};
  for (const m of Object.values(prev?.messages ?? {})) {
    if (!fresh.convs[m.conversation_id]) continue;
    messages[m.id] = m;
    if (!isTmp(m.id)) latestBefore[m.conversation_id] = Math.max(latestBefore[m.conversation_id] ?? -Infinity, time(m.created_at));
  }
  Object.assign(messages, fresh.messages);

  const history: Record<string, string | null> = {};
  for (const id of Object.keys(fresh.convs)) {
    const from = fresh.history[id] ?? null;
    const before = prev?.history[id];
    const latest = latestBefore[id];
    // Sem nada antes, ou com buraco (chegou mais de uma página enquanto o app estava fora): vale o que veio.
    history[id] = before === undefined || latest === undefined || (from !== null && time(from) > latest) ? from : earliest(before, from);
  }
  return { ...fresh, messages, history };
}

/** Junta uma página de mensagens anteriores (do mais novo para o mais antigo) de uma conversa. */
export function mergeOlder(s: Store, conversationId: string, page: MessageRow[]): Store {
  return {
    ...s,
    messages: { ...s.messages, ...byId(page) },
    history: { ...s.history, [conversationId]: pageStart(page) },
  };
}
