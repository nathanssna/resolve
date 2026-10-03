/**
 * Conversas, propostas e pedidos do usuário logado, no Supabase.
 *
 * Carrega tudo do usuário de uma vez (conversas com pedidos, mensagens,
 * propostas, serviços combinados e avaliações) e se mantém atualizado pelo
 * Realtime. As mudanças de estado passam pelas RPCs do banco (create_request,
 * accept_proposal, complete_order…).
 *
 * Uma conversa por cliente e profissional; cada pedido de orçamento (Job) vive
 * dentro dela, com as próprias propostas e o próprio serviço combinado.
 *
 * Cada usuário vê o próprio lado: o cliente, as conversas que abriu; o
 * profissional, os pedidos que recebeu (pelo papel do perfil). Os favoritos
 * ficam na tabela favorites, presos à conta.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { Database, Json } from '@/lib/database.types';
import { photoName, uploadPhoto, type LocalPhoto } from '@/lib/photos';
import { supabase, type UserRole } from '@/lib/supabase';
import { useAuth } from '@/state/auth';
import { useCatalog } from '@/state/catalog';

export type Address = { label: string; line: string; area: string; complement?: string; city?: string; state?: string; postalCode?: string };

/**
 * `them`: o outro participante (o profissional para o cliente, o cliente para o profissional).
 * `jobId`: o pedido a que a mensagem se refere (pedido, proposta e avisos do sistema).
 */
type Base = { id: string; at: number; from: 'me' | 'them' | 'system'; jobId?: string };
export type RequestMsg = Base & {
  kind: 'request';
  serviceTitle: string;
  description: string;
  when: string;
  address: Address;
  /** true: só bairro/cidade (profissional antes de combinar o serviço). */
  addressPartial: boolean;
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
export type Party = { id: string; name: string; avatarUrl?: string; /** Excluiu a conta. */ deleted?: boolean };

/**
 * Situação de um pedido: 'novo' (sem proposta), 'proposta' (esperando o
 * cliente), 'recusada' (sem proposta pendente) ou a do serviço combinado.
 */
export type JobState = 'novo' | 'proposta' | 'recusada' | 'encerrado' | OrderStatus;

/** Um pedido de orçamento dentro da conversa. */
export type Job = {
  id: string;
  conversationId: string;
  serviceId: string;
  createdAt: number;
  request?: RequestMsg;
  /** Proposta esperando resposta do cliente. */
  pending?: ProposalMsg;
  orderId?: string;
  /** Encerrado sem serviço: quem encerrou (o cliente cancelou ou o profissional recusou). */
  closedBy?: 'cliente' | 'profissional';
  state: JobState;
};

export type Conversation = {
  id: string;
  proId: string;
  clientId: string;
  other: Party;
  messages: Message[];
  unread: number;
  /** Pedidos, do mais antigo ao mais recente. */
  jobs: Job[];
  /** O pedido mais recente (o que aparece na lista de conversas). */
  latestJob?: Job;
  /** Eu bloqueei o outro participante. */
  blockedByMe: boolean;
};

export type OrderStatus = Database['public']['Enums']['order_status'];
export type Order = {
  id: string;
  conversationId: string;
  jobId: string;
  proId: string;
  clientId: string;
  other: Party;
  serviceId: string;
  amount: number;
  when: string;
  address: Address;
  status: OrderStatus;
  rating?: number;
  /** Comentário da avaliação, se houver. */
  comment?: string;
  createdAt: number;
};

type Tables = Database['public']['Tables'];
type PartyRow = { full_name: string; avatar_url: string | null; deleted_at: string | null };
type ConvRow = Pick<Tables['conversations']['Row'], 'id' | 'professional_id' | 'client_id' | 'client_last_read_at' | 'professional_last_read_at'> & {
  client: PartyRow | null;
  /** Nome do profissional mesmo fora do catálogo (ex.: conta excluída). */
  professional: { profile: PartyRow | null } | null;
};
type RequestRow = Pick<Tables['requests']['Row'], 'id' | 'conversation_id' | 'service_id' | 'created_at' | 'closed_at' | 'closed_by'> & {
  /** Endereço completo do pedido: só o cliente recebe (o banco devolve null para o profissional). */
  request_address?: { address: Json } | null;
};
type MessageRow = Pick<
  Tables['messages']['Row'],
  'id' | 'conversation_id' | 'request_id' | 'sender_id' | 'kind' | 'body' | 'proposal_id' | 'request_when' | 'request_address' | 'photos' | 'created_at'
>;
type ProposalRow = Pick<Tables['proposals']['Row'], 'id' | 'conversation_id' | 'request_id' | 'amount' | 'scheduled_label' | 'note' | 'status'>;
type OrderRow = Pick<
  Tables['orders']['Row'],
  'id' | 'conversation_id' | 'request_id' | 'professional_id' | 'service_id' | 'amount' | 'scheduled_label' | 'address' | 'status' | 'created_at'
> & { rating?: number; comment?: string | null };

type Store = {
  convs: Record<string, ConvRow>;
  requests: Record<string, RequestRow>;
  messages: Record<string, MessageRow>;
  proposals: Record<string, ProposalRow>;
  orders: Record<string, OrderRow>;
};
const EMPTY: Store = { convs: {}, requests: {}, messages: {}, proposals: {}, orders: {} };

const PROPOSAL_COLS = 'id, conversation_id, request_id, amount, scheduled_label, note, status';

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
  /** Faz o pedido na conversa com o profissional (abre se for a primeira vez, envia as fotos antes) e devolve o id da conversa. */
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
  /** Profissional: envia uma proposta para o pedido (substitui a pendente anterior dele). */
  sendProposal: (conversationId: string, jobId: string, input: { amount: number; when: string; note?: string }) => Promise<void>;
  markRead: (conversationId: string) => void;
  completeOrder: (orderId: string) => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  rateOrder: (orderId: string, stars: number, comment?: string) => Promise<void>;
  /** Cliente cancela / profissional recusa um pedido ainda sem serviço combinado. */
  closeRequest: (jobId: string) => Promise<void>;
  /** Só com login (a tela leva para o login antes). */
  toggleFavorite: (serviceId: string) => Promise<void>;
  /** Pessoas que eu bloqueei. */
  blocked: string[];
  block: (userId: string) => Promise<void>;
  unblock: (userId: string) => Promise<void>;
  isFavorite: (serviceId: string) => boolean;
};

const Ctx = createContext<AppValue | null>(null);

const byId = <T extends { id: string }>(rows: T[]) => Object.fromEntries(rows.map((r) => [r.id, r]));
const time = (iso: string) => Date.parse(iso);
const isTmp = (id: string) => id.startsWith('tmp:');

function toAddress(value: Json | null): Address {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const str = (x: Json | undefined) => (typeof x === 'string' ? x : '');
  return {
    label: str(v.label) || 'Casa',
    line: str(v.line),
    area: str(v.area),
    complement: str(v.complement) || undefined,
    city: str(v.city) || undefined,
    state: str(v.state) || undefined,
    postalCode: str(v.postal_code) || undefined,
  };
}

async function fetchStore(uid: string, role: UserRole): Promise<Store> {
  // As tabelas filhas também se ligam ao pedido (request_id): o !fkey diz que o caminho é pela conversa.
  const { data, error } = await supabase
    .from('conversations')
    .select(
      `id, professional_id, client_id, client_last_read_at, professional_last_read_at,
      client:profiles!conversations_client_id_fkey(full_name, avatar_url, deleted_at),
      professional:professionals!conversations_professional_id_fkey(profile:profiles!professionals_id_fkey(full_name, avatar_url, deleted_at)),
      requests!requests_conversation_id_fkey(id, conversation_id, service_id, created_at, closed_at, closed_by, request_address:request_addresses(address)),
      messages!messages_conversation_id_fkey(id, conversation_id, request_id, sender_id, kind, body, proposal_id, request_when, request_address, photos, created_at),
      proposals!proposals_conversation_id_fkey(id, conversation_id, request_id, amount, scheduled_label, note, status),
      orders!orders_conversation_id_fkey(id, conversation_id, request_id, professional_id, service_id, amount, scheduled_label, address, status, created_at, review:reviews(rating, comment))`,
    )
    .eq(role === 'profissional' ? 'professional_id' : 'client_id', uid);
  if (error) throw error;

  const store: Store = { convs: {}, requests: {}, messages: {}, proposals: {}, orders: {} };
  for (const { requests, messages, proposals, orders, ...conv } of data) {
    store.convs[conv.id] = conv;
    Object.assign(store.requests, byId(requests));
    Object.assign(store.messages, byId(messages));
    Object.assign(store.proposals, byId(proposals));
    for (const { review, ...o } of orders) store.orders[o.id] = { ...o, rating: review?.rating, comment: review?.comment };
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
  const [favData, setFavData] = useState<{ uid: string; ids: string[] } | null>(null);
  const favorites = useMemo(() => (uid && favData?.uid === uid ? favData.ids : []), [uid, favData]);
  const [blockData, setBlockData] = useState<{ uid: string; ids: string[] } | null>(null);
  const blocked = useMemo(() => (uid && blockData?.uid === uid ? blockData.ids : []), [uid, blockData]);

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

  // Favoritos da conta.
  useEffect(() => {
    if (!uid || favData?.uid === uid) return;
    supabase
      .from('favorites')
      .select('service_id')
      .order('created_at')
      .then(({ data: rows }) => {
        if (rows) setFavData({ uid, ids: rows.map((r) => r.service_id) });
      });
  }, [uid, favData?.uid]);

  // Bloqueios feitos por mim.
  useEffect(() => {
    if (!uid || blockData?.uid === uid) return;
    supabase
      .from('blocks')
      .select('blocked_id')
      .then(({ data: rows }) => {
        if (rows) setBlockData({ uid, ids: rows.map((r) => r.blocked_id) });
      });
  }, [uid, blockData?.uid]);

  // Realtime: o banco só entrega as linhas que este usuário pode ler (RLS).
  useEffect(() => {
    if (!uid) return;

    const channel = supabase
      .channel(`app:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, ({ new: row }) => {
        if (!('id' in row)) return;
        const r = row as RequestRow;
        if (!storeRef.current.convs[r.conversation_id] && !replay.current) return load();
        update((s) => ({ ...s, requests: { ...s.requests, [r.id]: { ...s.requests[r.id], ...r } } }));
      })
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
          update((s) =>
            s.orders[r.order_id] ? { ...s, orders: { ...s.orders, [r.order_id]: { ...s.orders[r.order_id], rating: r.rating, comment: r.comment } } } : s,
          );
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
        return {
          id: c.client_id,
          name: c.client?.full_name.trim() || 'Cliente',
          avatarUrl: c.client?.avatar_url ?? undefined,
          deleted: !!c.client?.deleted_at,
        };
      }
      // Do catálogo (mais atual); fora dele (ex.: conta excluída), do próprio profile.
      const pro = getProfessional(c.professional_id);
      const profile = c.professional?.profile;
      return {
        id: c.professional_id,
        name: pro?.name ?? (profile?.full_name.trim() || 'Profissional'),
        avatarUrl: pro?.avatarUrl ?? profile?.avatar_url ?? undefined,
        deleted: !!profile?.deleted_at,
      };
    },
    [role, getProfessional],
  );

  const conversations = useMemo<Conversation[]>(() => {
    if (!uid) return [];
    const grouped: Record<string, MessageRow[]> = {};
    for (const m of Object.values(store.messages)) (grouped[m.conversation_id] ??= []).push(m);
    const requestsByConv: Record<string, RequestRow[]> = {};
    for (const r of Object.values(store.requests)) (requestsByConv[r.conversation_id] ??= []).push(r);
    const orderByRequest = Object.fromEntries(Object.values(store.orders).map((o) => [o.request_id, o]));

    const list = Object.values(store.convs).map((c): Conversation => {
      const rows = (grouped[c.id] ?? []).sort((a, b) => time(a.created_at) - time(b.created_at));
      const messages: Message[] = [];
      for (const r of rows) {
        const from = r.sender_id === null ? 'system' : r.sender_id === uid ? 'me' : 'them';
        const base = { id: r.id, at: time(r.created_at), from, jobId: r.request_id ?? undefined } as const;
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
          // Completo para o cliente; para o profissional, só a parte pública da mensagem.
          const req = r.request_id ? store.requests[r.request_id] : undefined;
          const full = req?.request_address?.address;
          messages.push({
            ...base,
            kind: 'request',
            serviceTitle: req ? (getService(req.service_id)?.title ?? '') : '',
            description: r.body ?? '',
            when: r.request_when ?? '',
            address: toAddress(full ?? r.request_address),
            addressPartial: !full && !toAddress(r.request_address).line,
            photos: r.photos ?? [],
          });
        } else if (r.kind === 'system') {
          messages.push({ ...base, kind: 'system', text: r.body ?? '' });
        } else {
          messages.push({ ...base, kind: 'text', text: r.body ?? '', pending: isTmp(r.id) });
        }
      }

      const jobs = (requestsByConv[c.id] ?? [])
        .sort((a, b) => time(a.created_at) - time(b.created_at))
        .map((r): Job => {
          const order = orderByRequest[r.id];
          const own = messages.filter((m) => m.jobId === r.id);
          const proposals = own.filter((m): m is ProposalMsg => m.kind === 'proposal');
          const pending = proposals.find((m) => m.status === 'pending');
          return {
            id: r.id,
            conversationId: c.id,
            serviceId: r.service_id,
            createdAt: time(r.created_at),
            request: own.find((m): m is RequestMsg => m.kind === 'request'),
            pending,
            orderId: order?.id,
            closedBy: r.closed_by ? (r.closed_by === c.client_id ? 'cliente' : 'profissional') : undefined,
            state: order ? order.status : r.closed_at ? 'encerrado' : pending ? 'proposta' : proposals.length ? 'recusada' : 'novo',
          };
        });

      const readAt = time(role === 'profissional' ? c.professional_last_read_at : c.client_last_read_at);
      // O chat aberto marca como lido no banco assim que algo chega (ver chat/[id].tsx).
      const unread = rows.filter((r) => r.sender_id !== uid && time(r.created_at) > readAt).length;
      return {
        id: c.id,
        proId: c.professional_id,
        clientId: c.client_id,
        other: otherOf(c),
        messages,
        unread,
        jobs,
        latestJob: jobs.at(-1),
        blockedByMe: blocked.includes(role === 'profissional' ? c.client_id : c.professional_id),
      };
    });

    return list
      .filter((c) => c.messages.length > 0)
      .sort((a, b) => (b.messages.at(-1)?.at ?? 0) - (a.messages.at(-1)?.at ?? 0));
  }, [store, uid, role, getService, otherOf, blocked]);

  const orders = useMemo<Order[]>(
    () =>
      Object.values(store.orders)
        .map((o) => ({
          id: o.id,
          conversationId: o.conversation_id,
          jobId: o.request_id,
          proId: o.professional_id,
          clientId: store.convs[o.conversation_id]?.client_id ?? '',
          other: store.convs[o.conversation_id] ? otherOf(store.convs[o.conversation_id]) : { id: o.professional_id, name: '' },
          serviceId: o.service_id,
          amount: Number(o.amount),
          when: o.scheduled_label,
          address: toAddress(o.address),
          status: o.status,
          rating: o.rating,
          comment: o.comment ?? undefined,
          createdAt: time(o.created_at),
        }))
        .sort((a, b) => b.createdAt - a.createdAt),
    [store.orders, store.convs, otherOf],
  );

  // ----- ações -----

  const startRequest: AppValue['startRequest'] = useCallback(
    async ({ proId, serviceId, description, when, address, photos = [], onProgress }) => {
      // Mesma conversa para todos os pedidos ao mesmo profissional.
      const { data: conv, error } = await supabase.rpc('open_conversation', { p_professional_id: proId });
      if (error) throw error;

      // Fotos vão na pasta da conversa (é o que o Storage e o banco exigem).
      const paths: string[] = [];
      onProgress?.(0, photos.length);
      for (const photo of photos) {
        const path = `${conv.id}/${photoName()}`;
        await uploadPhoto('request-photos', path, photo.uri);
        paths.push(path);
        onProgress?.(paths.length, photos.length);
      }

      // Endereço completo: só o cliente lê; o profissional recebe no aceite.
      const fullAddress = {
        label: address.label,
        line: address.line,
        complement: address.complement ?? null,
        area: address.area,
        city: address.city ?? null,
        state: address.state ?? null,
        postal_code: address.postalCode ?? null,
      };
      const { data: msg, error: msgError } = await supabase.rpc('create_request', {
        p_conversation_id: conv.id,
        p_service_id: serviceId,
        p_description: description,
        p_when: when,
        p_address: fullAddress,
        p_photos: paths,
      });
      if (msgError) {
        // Não deixa foto solta no Storage.
        if (paths.length) supabase.storage.from('request-photos').remove(paths).then(() => {});
        throw msgError;
      }
      const requestId = msg.request_id!;
      update((s) => ({
        ...s,
        convs: { ...s.convs, [conv.id]: s.convs[conv.id] ?? { ...conv, client: null, professional: null } },
        requests: {
          ...s.requests,
          [requestId]: {
            id: requestId,
            conversation_id: conv.id,
            service_id: serviceId,
            created_at: msg.created_at,
            closed_at: null,
            closed_by: null,
            request_address: { address: fullAddress },
          },
        },
        messages: { ...s.messages, [msg.id]: msg },
      }));
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
        request_id: null,
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
        .select('id, conversation_id, request_id, sender_id, kind, body, proposal_id, request_when, request_address, photos, created_at')
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
    async (conversationId, jobId, { amount, when, note }) => {
      const { data: p, error } = await supabase
        .from('proposals')
        .insert({ conversation_id: conversationId, request_id: jobId, amount, scheduled_label: when, note: note?.trim() || null })
        .select(PROPOSAL_COLS)
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
    async (orderId: string, stars: number, comment?: string) => {
      const { data: review, error } = await supabase.rpc('rate_order', { p_order_id: orderId, p_rating: stars, p_comment: comment?.trim() || undefined });
      if (error) throw error;
      update((s) =>
        s.orders[orderId] ? { ...s, orders: { ...s.orders, [orderId]: { ...s.orders[orderId], rating: review.rating, comment: review.comment } } } : s,
      );
    },
    [update],
  );

  const closeRequest = useCallback(
    async (jobId: string) => {
      const { data: r, error } = await supabase.rpc('close_request', { p_request_id: jobId });
      if (error) throw error;
      // As propostas pendentes e o aviso chegam pelo Realtime.
      update((s) => ({ ...s, requests: { ...s.requests, [r.id]: { ...s.requests[r.id], ...r } } }));
    },
    [update],
  );

  const toggleFavorite = useCallback(
    async (sid: string) => {
      if (!uid) return;
      const was = favorites.includes(sid);
      const next = was ? favorites.filter((x) => x !== sid) : [...favorites, sid];
      setFavData({ uid, ids: next });
      const { error } = was
        ? await supabase.from('favorites').delete().eq('service_id', sid)
        : await supabase.from('favorites').insert({ service_id: sid });
      if (error) {
        setFavData((d) => (d?.uid === uid ? { uid, ids: was ? [...d.ids, sid] : d.ids.filter((x) => x !== sid) } : d));
        throw error;
      }
    },
    [uid, favorites],
  );

  const block = useCallback(
    async (userId: string) => {
      if (!uid) return;
      const { error } = await supabase.from('blocks').insert({ blocked_id: userId });
      // Já bloqueado (chave repetida) conta como sucesso.
      if (error && error.code !== '23505') throw error;
      setBlockData((d) => ({ uid, ids: [...(d?.uid === uid ? d.ids.filter((x) => x !== userId) : []), userId] }));
    },
    [uid],
  );

  const unblock = useCallback(
    async (userId: string) => {
      if (!uid) return;
      const { error } = await supabase.from('blocks').delete().eq('blocked_id', userId);
      if (error) throw error;
      setBlockData((d) => ({ uid, ids: d?.uid === uid ? d.ids.filter((x) => x !== userId) : [] }));
    },
    [uid],
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
      closeRequest,
      toggleFavorite,
      blocked,
      block,
      unblock,
      isFavorite: (sid) => favorites.includes(sid),
    }),
    [status, role, load, conversations, orders, favorites, startRequest, sendText, respondProposal, sendProposal, markRead, completeOrder, cancelOrder, rateOrder, closeRequest, toggleFavorite, blocked, block, unblock],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp precisa estar dentro de <AppProvider>');
  return ctx;
}
