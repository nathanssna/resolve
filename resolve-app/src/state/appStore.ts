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

export type Tables = Database['public']['Tables'];
export type PartyRow = { full_name: string; avatar_url: string | null; deleted_at: string | null };
export type ConvRow = Pick<Tables['conversations']['Row'], 'id' | 'professional_id' | 'client_id' | 'client_last_read_at' | 'professional_last_read_at'> & {
  client: PartyRow | null;
  /** Nome do profissional mesmo fora do catálogo (ex.: conta excluída). */
  professional: { profile: PartyRow | null } | null;
};
export type RequestRow = Pick<Tables['requests']['Row'], 'id' | 'conversation_id' | 'service_id' | 'created_at' | 'closed_at' | 'closed_by'> & {
  /** Endereço completo do pedido: só o cliente recebe (o banco devolve null para o profissional). */
  request_address?: { address: Json } | null;
};
export type MessageRow = Pick<
  Tables['messages']['Row'],
  'id' | 'conversation_id' | 'request_id' | 'sender_id' | 'kind' | 'body' | 'proposal_id' | 'request_when' | 'request_address' | 'photos' | 'created_at'
>;
export type ProposalRow = Pick<Tables['proposals']['Row'], 'id' | 'conversation_id' | 'request_id' | 'amount' | 'scheduled_label' | 'scheduled_at' | 'note' | 'status'>;
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
};
export const EMPTY: Store = { convs: {}, requests: {}, messages: {}, proposals: {}, orders: {}, history: {} };

export const byId = <T extends { id: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.id, r]));
export const time = (iso: string) => Date.parse(iso);
/** Mensagem ainda não confirmada pelo banco. */
export const isTmp = (id: string) => id.startsWith('tmp:');

/** Onde começa o histórico contínuo de uma página buscada do mais novo para o mais antigo. */
export const pageStart = (page: MessageRow[]): string | null =>
  page.length < PAGE ? null : page.reduce((a, m) => (time(m.created_at) < time(a) ? m.created_at : a), page[0].created_at);

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
