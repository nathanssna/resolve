/**
 * Estado do app em memória: conversas (a negociação acontece no chat),
 * serviços combinados e favoritos.
 *
 * As respostas do profissional são SIMULADAS para o protótipo
 * (veja `simulateReply`). Com back-end, troque por mensagens em tempo real
 * (ex.: Supabase Realtime ou Firebase) mantendo os mesmos tipos.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { getProfessional, getService } from '@/data/catalog';
import { firstName, formatBRL, parseAmount } from '@/utils/format';

export type Address = { label: string; line: string; area: string };

type Base = { id: string; at: number; from: 'me' | 'pro' | 'system' };
export type RequestMsg = Base & { kind: 'request'; serviceTitle: string; description: string; when: string; address: Address };
export type TextMsg = Base & { kind: 'text'; text: string };
export type ProposalMsg = Base & { kind: 'proposal'; amount: number; when: string; note?: string; status: 'pending' | 'accepted' | 'declined' };
export type SystemMsg = Base & { kind: 'system'; text: string };
export type Message = RequestMsg | TextMsg | ProposalMsg | SystemMsg;

export type Conversation = {
  id: string;
  proId: string;
  serviceId: string;
  messages: Message[];
  unread: number;
  typing: boolean;
  orderId?: string;
};

export type OrderStatus = 'combinado' | 'concluido' | 'cancelado';
export type Order = {
  id: string;
  conversationId: string;
  proId: string;
  serviceId: string;
  amount: number;
  when: string;
  address: Address;
  status: OrderStatus;
  rating?: number;
  createdAt: number;
};

/** Valores de EXEMPLO usados na proposta simulada. */
const exampleQuote: Record<string, number> = {
  informatica: 150,
  encanador: 120,
  eletricista: 130,
  'montagem-moveis': 180,
  pintor: 450,
  limpeza: 220,
  'ar-condicionado': 350,
  chaveiro: 90,
};

let seq = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

const DAY = 86400000;
function seed(): { conversations: Conversation[]; orders: Order[] } {
  const t = Date.now() - 2 * DAY;
  const address = { label: 'Casa', line: 'Rua das Acácias, 120', area: 'Santa Terezinha' };
  const conv: Conversation = {
    id: 'c_seed',
    proId: 'claudia',
    serviceId: 'limpeza',
    unread: 0,
    typing: false,
    orderId: 'o_seed',
    messages: [
      { id: 'm1', at: t, from: 'me', kind: 'request', serviceTitle: 'Limpeza', description: 'Faxina completa num apartamento de 2 quartos.', when: 'Sábado, 9h', address },
      { id: 'm2', at: t + 4 * 60000, from: 'pro', kind: 'text', text: 'Bom dia! Consigo sim. Levo todos os produtos.' },
      { id: 'm3', at: t + 5 * 60000, from: 'pro', kind: 'proposal', amount: 220, when: 'Sábado, 9h', note: 'Faxina completa, produtos inclusos.', status: 'accepted' },
      { id: 'm4', at: t + 9 * 60000, from: 'system', kind: 'system', text: `Serviço combinado · ${formatBRL(220)} · Sábado, 9h` },
      { id: 'm5', at: t + 10 * 60000, from: 'pro', kind: 'text', text: 'Combinado! Até sábado.' },
    ],
  };
  const order: Order = {
    id: 'o_seed',
    conversationId: 'c_seed',
    proId: 'claudia',
    serviceId: 'limpeza',
    amount: 220,
    when: 'Sábado, 9h',
    address,
    status: 'concluido',
    rating: 5,
    createdAt: t + 9 * 60000,
  };
  return { conversations: [conv], orders: [order] };
}

type AppValue = {
  conversations: Conversation[];
  orders: Order[];
  favorites: string[];
  unreadTotal: number;
  startRequest: (input: { proId: string; serviceId: string; description: string; when: string; address: Address }) => string;
  sendText: (conversationId: string, text: string) => void;
  respondProposal: (conversationId: string, messageId: string, accept: boolean) => void;
  markRead: (conversationId: string) => void;
  completeOrder: (orderId: string) => void;
  cancelOrder: (orderId: string) => void;
  rateOrder: (orderId: string, stars: number) => void;
  toggleFavorite: (serviceId: string) => void;
  isFavorite: (serviceId: string) => boolean;
  /** Id da conversa que está aberta na tela (não conta como não lida). */
  setOpenConversation: (id: string | null) => void;
};

const Ctx = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(seed, []);
  const [conversations, setConversations] = useState<Conversation[]>(initial.conversations);
  const [orders, setOrders] = useState<Order[]>(initial.orders);
  const [favorites, setFavorites] = useState<string[]>([]);
  const openRef = useRef<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const patch = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setConversations((list) => list.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  const push = useCallback(
    (id: string, msg: Message) => {
      patch(id, (c) => ({
        ...c,
        typing: msg.from === 'pro' ? false : c.typing,
        unread: msg.from !== 'me' && openRef.current !== id ? c.unread + 1 : c.unread,
        messages: [...c.messages, msg],
      }));
    },
    [patch],
  );

  /** Resposta simulada do profissional (substituir pelo back-end). */
  const proSays = useCallback(
    (id: string, delay: number, make: () => Message) => {
      later(Math.max(200, delay - 900), () => patch(id, (c) => ({ ...c, typing: true })));
      later(delay, () => push(id, make()));
    },
    [patch, push],
  );

  const startRequest: AppValue['startRequest'] = useCallback(
    ({ proId, serviceId, description, when, address }) => {
      const pro = getProfessional(proId);
      const service = getService(serviceId);
      const id = uid('c');
      const now = Date.now();
      const conv: Conversation = {
        id,
        proId,
        serviceId,
        unread: 0,
        typing: false,
        messages: [
          { id: uid('m'), at: now, from: 'me', kind: 'request', serviceTitle: service?.title ?? '', description, when, address },
        ],
      };
      setConversations((list) => [conv, ...list]);
      const name = pro ? firstName(pro.name) : 'o profissional';
      proSays(id, 1800, () => ({
        id: uid('m'),
        at: Date.now(),
        from: 'pro',
        kind: 'text',
        text: `Oi! Aqui é ${name}. Vi seu pedido e consigo te ajudar.`,
      }));
      proSays(id, 4200, () => ({
        id: uid('m'),
        at: Date.now(),
        from: 'pro',
        kind: 'proposal',
        amount: exampleQuote[serviceId] ?? 150,
        when: when === 'O quanto antes' ? 'Hoje, 16h' : when,
        note: 'Valor com a visita inclusa. Materiais à parte, se precisar.',
        status: 'pending',
      }));
      return id;
    },
    [proSays],
  );

  const sendText: AppValue['sendText'] = useCallback(
    (id, text) => {
      const msg: TextMsg = { id: uid('m'), at: Date.now(), from: 'me', kind: 'text', text };
      push(id, msg);
      const conv = conversations.find((c) => c.id === id);
      const value = parseAmount(text);
      const pending = conv?.messages.find((m) => m.kind === 'proposal' && m.status === 'pending') as ProposalMsg | undefined;
      if (value && !conv?.orderId) {
        // contraproposta: o profissional aceita e manda uma proposta atualizada
        if (pending) patch(id, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === pending.id ? { ...m, status: 'declined' } : m)) as Message[] }));
        proSays(id, 2200, () => ({ id: uid('m'), at: Date.now(), from: 'pro', kind: 'text', text: 'Consigo fazer por esse valor. Te mandei a proposta atualizada.' }));
        proSays(id, 3600, () => ({
          id: uid('m'),
          at: Date.now(),
          from: 'pro',
          kind: 'proposal',
          amount: value,
          when: pending?.when ?? 'Amanhã, 14h',
          status: 'pending',
        }));
      } else {
        proSays(id, 2400, () => ({
          id: uid('m'),
          at: Date.now(),
          from: 'pro',
          kind: 'text',
          text: conv?.orderId ? 'Combinado! Qualquer coisa é só chamar por aqui.' : 'Entendi! Se quiser, me fala um valor e eu vejo se consigo.',
        }));
      }
    },
    [conversations, patch, proSays, push],
  );

  const respondProposal: AppValue['respondProposal'] = useCallback(
    (id, messageId, accept) => {
      const conv = conversations.find((c) => c.id === id);
      const proposal = conv?.messages.find((m) => m.id === messageId) as ProposalMsg | undefined;
      const request = conv?.messages.find((m) => m.kind === 'request') as RequestMsg | undefined;
      if (!conv || !proposal) return;
      patch(id, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === messageId ? { ...m, status: accept ? 'accepted' : 'declined' } : m)) as Message[],
      }));
      if (!accept) {
        push(id, { id: uid('m'), at: Date.now(), from: 'system', kind: 'system', text: 'Você recusou a proposta' });
        proSays(id, 2200, () => ({ id: uid('m'), at: Date.now(), from: 'pro', kind: 'text', text: 'Sem problemas. Me diz um valor que fique bom pra você.' }));
        return;
      }
      const orderId = uid('o');
      const order: Order = {
        id: orderId,
        conversationId: id,
        proId: conv.proId,
        serviceId: conv.serviceId,
        amount: proposal.amount,
        when: proposal.when,
        address: request?.address ?? { label: 'Casa', line: '', area: '' },
        status: 'combinado',
        createdAt: Date.now(),
      };
      setOrders((list) => [order, ...list]);
      patch(id, (c) => ({ ...c, orderId }));
      push(id, { id: uid('m'), at: Date.now(), from: 'system', kind: 'system', text: `Serviço combinado · ${formatBRL(proposal.amount)} · ${proposal.when}` });
      proSays(id, 2000, () => ({ id: uid('m'), at: Date.now(), from: 'pro', kind: 'text', text: 'Perfeito, combinado! Te aviso por aqui quando estiver a caminho.' }));
    },
    [conversations, patch, proSays, push],
  );

  const markRead = useCallback((id: string) => patch(id, (c) => (c.unread ? { ...c, unread: 0 } : c)), [patch]);
  const setOpenConversation = useCallback((id: string | null) => {
    openRef.current = id;
  }, []);

  const setOrder = (id: string, fn: (o: Order) => Order) => setOrders((list) => list.map((o) => (o.id === id ? fn(o) : o)));
  const completeOrder = useCallback((id: string) => setOrder(id, (o) => ({ ...o, status: 'concluido' })), []);
  const cancelOrder = useCallback((id: string) => setOrder(id, (o) => ({ ...o, status: 'cancelado' })), []);
  const rateOrder = useCallback((id: string, stars: number) => setOrder(id, (o) => ({ ...o, rating: stars })), []);

  const toggleFavorite = useCallback(
    (sid: string) => setFavorites((f) => (f.includes(sid) ? f.filter((x) => x !== sid) : [...f, sid])),
    [],
  );

  const value = useMemo<AppValue>(
    () => ({
      conversations,
      orders,
      favorites,
      unreadTotal: conversations.reduce((n, c) => n + c.unread, 0),
      startRequest,
      sendText,
      respondProposal,
      markRead,
      completeOrder,
      cancelOrder,
      rateOrder,
      toggleFavorite,
      isFavorite: (sid) => favorites.includes(sid),
      setOpenConversation,
    }),
    [conversations, orders, favorites, startRequest, sendText, respondProposal, markRead, completeOrder, cancelOrder, rateOrder, toggleFavorite, setOpenConversation],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp precisa estar dentro de <AppProvider>');
  return ctx;
}
