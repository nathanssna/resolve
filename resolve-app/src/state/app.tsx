/**
 * Conversas, propostas e pedidos do usuário logado, no Supabase.
 *
 * Carrega tudo do cliente de uma vez (conversas com mensagens, propostas,
 * pedido e avaliação) e se mantém atualizado pelo Realtime. As mudanças de
 * estado passam pelas RPCs do banco (accept_proposal, complete_order…).
 *
 * Cada usuário vê o próprio lado: o cliente, as conversas que abriu; o
 * profissional, os pedidos que recebeu (pelo papel do perfil). Favoritos
 * ainda ficam só na memória.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { Database, Json } from '@/lib/database.types';
import { photoName, uploadPhoto, type LocalPhoto } from '@/lib/photos';
import { supabase, type UserRole } from '@/lib/supabase';
import { useAuth } from '@/state/auth';
import { useCatalog } from '@/state/catalog';

export type Address = { label: string; line: string; area: string };

/** `them`: o outro participante (o profissional para o cliente, o cliente para o profissional). */
type Base = { id: string; at: number; from: 'me' | 'them' | 'system' };
export type RequestMsg = Base & {
  kind: 'request';
  serviceTitle: string;
  description: string;
  when: string;
  address: Address;
  /** Caminhos no bucket request-photos (use useSignedUrls para mostrar). */
  photos: string[];
};
export type TextMsg = Base & { kind: 'text'; text: string; pending?: boolean };
export type ProposalMsg = Base & {
  kind: 'proposal';
  proposalId: string;
  amount: number;
  when: string;
  note?: string;
  status: 'pending' | 'accepted' | 'declined';
};
export type SystemMsg = Base & { kind: 'system'; text: string };
export type Message = RequestMsg | TextMsg | ProposalMsg | SystemMsg;

/** O outro participante, para mostrar nome e foto. */
export type Party = { id: string; name: string; avatarUrl?: string };

export type Conversation = {
  id: string;
  proId: string;
  clientId: string;
  other: Party;
  serviceId: string;
  messages: Message[];
  unread: number;
  orderId?: string;
};

export type OrderStatus = Database['public']['Enums']['order_status'];
export type Order = {
  id: string;
  conversationId: string;
  proId: string;
  clientId: string;
  other: Party;
  serviceId: string;
  amount: number;
  when: string;
  address: Address;
  status: OrderStatus;
  rating?: number;
  createdAt: number;
};

type Tables = Database['public']['Tables'];
type ConvRow = Pick<
  Tables['conversations']['Row'],
  'id' | 'professional_id' | 'client_id' | 'service_id' | 'client_last_read_at' | 'professional_last_read_at'
> & { client: { full_name: string; avatar_url: string | null } | null };
type MessageRow = Pick<
  Tables['messages']['Row'],
  'id' | 'conversation_id' | 'sender_id' | 'kind' | 'body' | 'proposal_id' | 'request_when' | 'request_address' | 'photos' | 'created_at'
>;
type ProposalRow = Pick<Tables['proposals']['Row'], 'id' | 'conversation_id' | 'amount' | 'scheduled_label' | 'note' | 'status'>;
type OrderRow = Pick<
  Tables['orders']['Row'],
  'id' | 'conversation_id' | 'professional_id' | 'service_id' | 'amount' | 'scheduled_label' | 'address' | 'status' | 'created_at'
> & { rating?: number };

type Store = {
  convs: Record<string, ConvRow>;
  messages: Record<string, MessageRow>;
  proposals: Record<string, ProposalRow>;
  orders: Record<string, OrderRow>;
};
const EMPTY: Store = { convs: {}, messages: {}, proposals: {}, orders: {} };

const CONV_COLS =
  'id, professional_id, client_id, service_id, client_last_read_at, professional_last_read_at, client:profiles!conversations_client_id_fkey(full_name, avatar_url)';
const MESSAGE_COLS = 'id, conversation_id, sender_id, kind, body, proposal_id, request_when, request_address, photos, created_at';

export type AppStatus = 'idle' | 'loading' | 'ready' | 'error';

type AppValue = {
  /** 'idle' = sem login. */
  status: AppStatus;
  /** Lado que o usuário vê. */
  role: UserRole;
  refresh: () => void;
  conversations: Conversation[];
  orders: Order[];
  favorites: string[];
  unreadTotal: number;
  /** Abre a conversa com o pedido (enviando as fotos antes) e devolve o id dela. */
  startRequest: (input: {
    proId: string;
    serviceId: string;
    description: string;
    when: string;
    address: Address;
    photos?: LocalPhoto[];
    /** Progresso do envio das fotos. */
    onProgress?: (sent: number, total: number) => void;
  }) => Promise<string>;
  sendText: (conversationId: string, text: string) => Promise<void>;
  respondProposal: (conversationId: string, messageId: string, accept: boolean) => Promise<void>;
  /** Profissional: envia uma proposta (substitui a pendente anterior). */
  sendProposal: (conversationId: string, input: { amount: number; when: string; note?: string }) => Promise<void>;
  markRead: (conversationId: string) => void;
  completeOrder: (orderId: string) => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  rateOrder: (orderId: string, stars: number) => Promise<void>;
  toggleFavorite: (serviceId: string) => void;
  isFavorite: (serviceId: string) => boolean;
};

const Ctx = createContext<AppValue | null>(null);

const byId = <T extends { id: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.id, r]));
const time = (iso: string) => Date.parse(iso);
const isTmp = (id: string) => id.startsWith('tmp:');

function toAddress(value: Json | null): Address {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const str = (x: Json | undefined) => (typeof x === 'string' ? x : '');
  return { label: str(v.label) || 'Casa', line: str(v.line), area: str(v.area) };
}

async function fetchStore(uid: string, role: UserRole): Promise<Store> {
  const { data, error } = await supabase
    .from('conversations')
    .select(
      'id, professional_id, client_id, service_id, client_last_read_at, professional_last_read_at, client:profiles!conversations_client_id_fkey(full_name, avatar_url), messages(id, conversation_id, sender_id, kind, body, proposal_id, request_when, request_address, photos, created_at), proposals(id, conversation_id, amount, scheduled_label, note, status), order:orders(id, conversation_id, professional_id, service_id, amount, scheduled_label, address, status, created_at, review:reviews(rating))',
    )
    .eq(role === 'profissional' ? 'professional_id' : 'client_id', uid);
  if (error) throw error;

  const store: Store = { convs: {}, messages: {}, proposals: {}, orders: {} };
  for (const { messages, proposals, order, ...conv } of data) {
    store.convs[conv.id] = conv;
    Object.assign(store.messages, byId(messages));
    Object.assign(store.proposals, byId(proposals));
    if (order) {
      const { review, ...o } = order;
      store.orders[o.id] = { ...o, rating: review?.rating };
    }
  }
  return store;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { session, profile, ready: authReady } = useAuth();
  const { getService, getProfessional, refresh: refreshCatalog } = useCatalog();
  const uid = session?.user.id ?? null;
  // O papel vem do perfil; sem perfil (ex.: sem rede), segue como cliente.
  const role: UserRole = profile?.role ?? 'cliente';
  const owner = uid && (profile || authReady) ? `${uid}:${role}` : null;

  // Dados guardados com o id do dono: trocar de conta invalida sozinho.
  const [data, setData] = useState<{ owner: string; store: Store } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);

  const loaded = !!owner && data?.owner === owner;
  const store = loaded ? data.store : EMPTY;
  const status: AppStatus = !uid ? 'idle' : loaded ? 'ready' : owner && failedFor === owner ? 'error' : 'loading';

  // Para os callbacks do Realtime consultarem o estado atual.
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  // Mudanças que chegam enquanto uma busca completa está no ar: são guardadas e
  // reaplicadas sobre o resultado, senão o retrato antigo apagaria o que veio
  // pelo Realtime nesse meio-tempo. Todas as mudanças são "inserir/atualizar por
  // id", então reaplicar não duplica nada.
  const replay = useRef<((s: Store) => Store)[] | null>(null);

  const update = useCallback(
    (fn: (s: Store) => Store) => {
      replay.current?.push(fn);
      setData((d) => (d && d.owner === owner ? { owner: d.owner, store: fn(d.store) } : d));
    },
    [owner],
  );

  /** Busca tudo do banco (abertura, reconexão do Realtime, app de volta, "Tentar de novo"). */
  const load = useCallback(() => {
    if (!uid || !owner) return;
    const buffer: ((s: Store) => Store)[] = [];
    replay.current = buffer;
    fetchStore(uid, role)
      .then((fresh) => {
        setData((d) => {
          // Mantém mensagens ainda não confirmadas pelo banco.
          const pending = d?.owner === owner ? Object.values(d.store.messages).filter((m) => isTmp(m.id)) : [];
          let next: Store = { ...fresh, messages: { ...fresh.messages, ...byId(pending) } };
          for (const fn of buffer) next = fn(next);
          return { owner, store: next };
        });
        setFailedFor(null);
      })
      .catch(() => setFailedFor(owner))
      .finally(() => {
        if (replay.current === buffer) replay.current = null;
      });
  }, [uid, owner, role]);

  // Carga inicial (e a cada troca de conta).
  useEffect(() => {
    if (!owner || loaded) return;
    load();
  }, [owner, loaded, load]);

  // Realtime: o banco só entrega as linhas que este usuário pode ler (RLS).
  useEffect(() => {
    if (!uid) return;

    const channel = supabase
      .channel(`app:${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, ({ new: row }) => {
        const m = row as MessageRow;
        // Conversa criada em outro aparelho: busca tudo de novo.
        if (!storeRef.current.convs[m.conversation_id] && !replay.current) return load();
        update((s) => ({ ...s, messages: { ...s.messages, [m.id]: m } }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposals' }, ({ new: row }) => {
        if (!('id' in row)) return;
        const p = row as ProposalRow;
        update((s) => ({ ...s, proposals: { ...s.proposals, [p.id]: p } }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, ({ new: row }) => {
        if (!('id' in row)) return;
        const o = row as OrderRow;
        update((s) => ({ ...s, orders: { ...s.orders, [o.id]: { ...s.orders[o.id], ...o } } }));
      })
      // Só as avaliações deste usuário (a tabela é pública; não precisa receber as de todo mundo).
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reviews', filter: `${role === 'profissional' ? 'professional_id' : 'client_id'}=eq.${uid}` },
        ({ new: row }) => {
          const r = row as Tables['reviews']['Row'];
          update((s) => (s.orders[r.order_id] ? { ...s, orders: { ...s.orders, [r.order_id]: { ...s.orders[r.order_id], rating: r.rating } } } : s));
          // A nota do profissional (painel, lista) vem do catálogo.
          if (role === 'profissional') refreshCatalog();
        },
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, ({ new: row }) => {
        const c = row as Tables['conversations']['Row'];
        update((s) =>
          s.convs[c.id]
            ? {
                ...s,
                convs: {
                  ...s.convs,
                  [c.id]: { ...s.convs[c.id], client_last_read_at: c.client_last_read_at, professional_last_read_at: c.professional_last_read_at },
                },
              }
            : s,
        );
      })
      .subscribe((state) => {
        // Conectou (ou reconectou): busca o que pode ter chegado antes da conexão.
        if (state === 'SUBSCRIBED') load();
      });

    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') load();
    });

    return () => {
      appState.remove();
      supabase.removeChannel(channel);
    };
  }, [uid, role, update, load, refreshCatalog]);

  // ----- leitura -----

  // Nome e foto do outro participante.
  const otherOf = useCallback(
    (c: ConvRow): Party => {
      if (role === 'profissional') {
        return { id: c.client_id, name: c.client?.full_name.trim() || 'Cliente', avatarUrl: c.client?.avatar_url ?? undefined };
      }
      const pro = getProfessional(c.professional_id);
      return { id: c.professional_id, name: pro?.name ?? 'Profissional', avatarUrl: pro?.avatarUrl };
    },
    [role, getProfessional],
  );

  const conversations = useMemo<Conversation[]>(() => {
    if (!uid) return [];
    const grouped: Record<string, MessageRow[]> = {};
    for (const m of Object.values(store.messages)) (grouped[m.conversation_id] ??= []).push(m);
    const orderByConv = Object.fromEntries(Object.values(store.orders).map((o) => [o.conversation_id, o.id]));

    const list = Object.values(store.convs).map((c): Conversation => {
      const rows = (grouped[c.id] ?? []).sort((a, b) => time(a.created_at) - time(b.created_at));
      const messages: Message[] = [];
      for (const r of rows) {
        const from = r.sender_id === null ? 'system' : r.sender_id === uid ? 'me' : 'them';
        const base = { id: r.id, at: time(r.created_at), from } as const;
        if (r.kind === 'proposal') {
          const p = r.proposal_id ? store.proposals[r.proposal_id] : undefined;
          // A proposta chega pelo Realtime junto com a mensagem; até lá, não mostra.
          if (!p) continue;
          messages.push({
            ...base,
            kind: 'proposal',
            proposalId: p.id,
            amount: Number(p.amount),
            when: p.scheduled_label,
            note: p.note ?? undefined,
            status: p.status === 'superseded' ? 'declined' : p.status,
          });
        } else if (r.kind === 'request') {
          messages.push({
            ...base,
            kind: 'request',
            serviceTitle: getService(c.service_id)?.title ?? '',
            description: r.body ?? '',
            when: r.request_when ?? '',
            address: toAddress(r.request_address),
            photos: r.photos ?? [],
          });
        } else if (r.kind === 'system') {
          messages.push({ ...base, kind: 'system', text: r.body ?? '' });
        } else {
          messages.push({ ...base, kind: 'text', text: r.body ?? '', pending: isTmp(r.id) });
        }
      }
      const readAt = time(role === 'profissional' ? c.professional_last_read_at : c.client_last_read_at);
      // O chat aberto marca como lido no banco assim que algo chega (ver chat/[id].tsx).
      const unread = rows.filter((r) => r.sender_id !== uid && time(r.created_at) > readAt).length;
      return {
        id: c.id,
        proId: c.professional_id,
        clientId: c.client_id,
        other: otherOf(c),
        serviceId: c.service_id,
        messages,
        unread,
        orderId: orderByConv[c.id],
      };
    });

    return list
      .filter((c) => c.messages.length > 0)
      .sort((a, b) => (b.messages.at(-1)?.at ?? 0) - (a.messages.at(-1)?.at ?? 0));
  }, [store, uid, role, getService, otherOf]);

  const orders = useMemo<Order[]>(
    () =>
      Object.values(store.orders)
        .map((o) => ({
          id: o.id,
          conversationId: o.conversation_id,
          proId: o.professional_id,
          clientId: store.convs[o.conversation_id]?.client_id ?? '',
          other: store.convs[o.conversation_id] ? otherOf(store.convs[o.conversation_id]) : { id: o.professional_id, name: '' },
          serviceId: o.service_id,
          amount: Number(o.amount),
          when: o.scheduled_label,
          address: toAddress(o.address),
          status: o.status,
          rating: o.rating,
          createdAt: time(o.created_at),
        }))
        .sort((a, b) => b.createdAt - a.createdAt),
    [store.orders, store.convs, otherOf],
  );

  // ----- ações -----

  const startRequest: AppValue['startRequest'] = useCallback(
    async ({ proId, serviceId, description, when, address, photos = [], onProgress }) => {
      const { data: conv, error } = await supabase
        .from('conversations')
        .insert({ professional_id: proId, service_id: serviceId })
        .select(CONV_COLS)
        .single();
      if (error) throw error;
      update((s) => ({ ...s, convs: { ...s.convs, [conv.id]: conv } }));

      // Fotos vão na pasta da conversa (é o que o Storage e o banco exigem).
      const paths: string[] = [];
      onProgress?.(0, photos.length);
      for (const photo of photos) {
        const path = `${conv.id}/${photoName()}`;
        await uploadPhoto('request-photos', path, photo.uri);
        paths.push(path);
        onProgress?.(paths.length, photos.length);
      }

      const { data: msg, error: msgError } = await supabase
        .from('messages')
        .insert({ conversation_id: conv.id, kind: 'request', body: description, request_when: when, request_address: address, photos: paths })
        .select(MESSAGE_COLS)
        .single();
      if (msgError) {
        // Não deixa foto solta no Storage.
        if (paths.length) supabase.storage.from('request-photos').remove(paths).then(() => {});
        throw msgError;
      }
      update((s) => ({ ...s, messages: { ...s.messages, [msg.id]: msg } }));
      return conv.id;
    },
    [update],
  );

  const sendText: AppValue['sendText'] = useCallback(
    async (conversationId, text) => {
      if (!uid) return;
      // Aparece na hora; é trocada pela mensagem real quando o banco confirma.
      const tmpId = `tmp:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const tmp: MessageRow = {
        id: tmpId,
        conversation_id: conversationId,
        sender_id: uid,
        kind: 'text',
        body: text,
        proposal_id: null,
        request_when: null,
        request_address: null,
        photos: [],
        created_at: new Date().toISOString(),
      };
      update((s) => ({ ...s, messages: { ...s.messages, [tmpId]: tmp } }));

      const { data: msg, error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, body: text })
        .select(MESSAGE_COLS)
        .single();
      update((s) => {
        const rest = { ...s.messages };
        delete rest[tmpId];
        if (msg) rest[msg.id] = msg;
        return { ...s, messages: rest };
      });
      if (error) throw error;
    },
    [uid, update],
  );

  const respondProposal: AppValue['respondProposal'] = useCallback(
    async (_conversationId, messageId, accept) => {
      const proposalId = store.messages[messageId]?.proposal_id;
      if (!proposalId) return;
      if (accept) {
        const { data: order, error } = await supabase.rpc('accept_proposal', { p_proposal_id: proposalId });
        if (error) throw error;
        update((s) => ({
          ...s,
          proposals: { ...s.proposals, [proposalId]: { ...s.proposals[proposalId], status: 'accepted' } },
          orders: { ...s.orders, [order.id]: { ...s.orders[order.id], ...order } },
        }));
      } else {
        const { data: proposal, error } = await supabase.rpc('decline_proposal', { p_proposal_id: proposalId });
        if (error) throw error;
        update((s) => ({ ...s, proposals: { ...s.proposals, [proposal.id]: proposal } }));
      }
    },
    [store.messages, update],
  );

  const markRead = useCallback(
    (conversationId: string) => {
      // Usa o horário (do servidor) da última mensagem, não o relógio do aparelho.
      let last = '';
      for (const m of Object.values(store.messages)) {
        if (m.conversation_id !== conversationId || isTmp(m.id)) continue;
        if (!last || time(m.created_at) > time(last)) last = m.created_at;
      }
      if (last) {
        update((s) =>
          s.convs[conversationId]
            ? {
                ...s,
                convs: {
                  ...s.convs,
                  [conversationId]: {
                    ...s.convs[conversationId],
                    [role === 'profissional' ? 'professional_last_read_at' : 'client_last_read_at']: last,
                  },
                },
              }
            : s,
        );
      }
      supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId }).then(() => {});
    },
    [store.messages, update, role],
  );

  const sendProposal: AppValue['sendProposal'] = useCallback(
    async (conversationId, { amount, when, note }) => {
      const { data: p, error } = await supabase
        .from('proposals')
        .insert({ conversation_id: conversationId, amount, scheduled_label: when, note: note?.trim() || null })
        .select('id, conversation_id, amount, scheduled_label, note, status')
        .single();
      if (error) throw error;
      // A mensagem da proposta é criada pelo banco e chega pelo Realtime.
      update((s) => ({ ...s, proposals: { ...s.proposals, [p.id]: p } }));
    },
    [update],
  );

  const applyOrder = useCallback(
    (order: Omit<OrderRow, 'rating'>) => update((s) => ({ ...s, orders: { ...s.orders, [order.id]: { ...s.orders[order.id], ...order } } })),
    [update],
  );

  const completeOrder = useCallback(
    async (orderId: string) => {
      const { data: order, error } = await supabase.rpc('complete_order', { p_order_id: orderId });
      if (error) throw error;
      applyOrder(order);
    },
    [applyOrder],
  );

  const cancelOrder = useCallback(
    async (orderId: string) => {
      const { data: order, error } = await supabase.rpc('cancel_order', { p_order_id: orderId });
      if (error) throw error;
      applyOrder(order);
    },
    [applyOrder],
  );

  const rateOrder = useCallback(
    async (orderId: string, stars: number) => {
      const { data: review, error } = await supabase.rpc('rate_order', { p_order_id: orderId, p_rating: stars });
      if (error) throw error;
      update((s) => (s.orders[orderId] ? { ...s, orders: { ...s.orders, [orderId]: { ...s.orders[orderId], rating: review.rating } } } : s));
    },
    [update],
  );

  const toggleFavorite = useCallback(
    (sid: string) => setFavorites((f) => (f.includes(sid) ? f.filter((x) => x !== sid) : [...f, sid])),
    [],
  );

  const value = useMemo<AppValue>(
    () => ({
      status,
      role,
      refresh: load,
      conversations,
      orders,
      favorites,
      unreadTotal: conversations.reduce((n, c) => n + c.unread, 0),
      startRequest,
      sendText,
      respondProposal,
      sendProposal,
      markRead,
      completeOrder,
      cancelOrder,
      rateOrder,
      toggleFavorite,
      isFavorite: (sid) => favorites.includes(sid),
    }),
    [status, role, load, conversations, orders, favorites, startRequest, sendText, respondProposal, sendProposal, markRead, completeOrder, cancelOrder, rateOrder, toggleFavorite],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp precisa estar dentro de <AppProvider>');
  return ctx;
}
