/**
 * Canal oficial da Rezolveaê: a conversa de quem está logado com a equipe.
 * Carrega ao entrar, recebe as respostas pelo Realtime e conta as não lidas
 * (para a linha fixada em Mensagens e o número na aba).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/state/auth';

type Row = Database['public']['Tables']['support_messages']['Row'];
export type SupportMessage = { id: string; fromTeam: boolean; body: string; at: number };

type SupportValue = {
  /** Foto do canal: a da conta da equipe (a logo da Rezolveaê). */
  avatarUrl?: string;
  messages: SupportMessage[];
  /** Respostas da equipe ainda não lidas. */
  unread: number;
  send: (text: string) => Promise<void>;
  markRead: () => void;
};

const Ctx = createContext<SupportValue | null>(null);
const toMessage = (r: Row): SupportMessage => ({ id: r.id, fromTeam: r.from_team, body: r.body, at: Date.parse(r.created_at) });

export function SupportProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [data, setData] = useState<{ uid: string; rows: Record<string, SupportMessage>; readAt: number; avatarUrl?: string } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    const load = async () => {
      const [msgs, thread, avatar] = await Promise.all([
        supabase.from('support_messages').select('*').order('created_at'),
        supabase.from('support_threads').select('user_last_read_at').maybeSingle(),
        supabase.rpc('support_team_avatar'),
      ]);
      if (!alive || msgs.error) return;
      const readAt = thread.data?.user_last_read_at ? Date.parse(thread.data.user_last_read_at) : 0;
      setData({ uid, rows: Object.fromEntries(msgs.data.map((r) => [r.id, toMessage(r)])), readAt, avatarUrl: avatar.data ?? undefined });
    };
    load();
    const channel = supabase
      .channel(`suporte:${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `user_id=eq.${uid}` }, ({ new: row }) => {
        const m = toMessage(row as Row);
        setData((d) => (d && d.uid === uid ? { ...d, rows: { ...d.rows, [m.id]: m } } : d));
      })
      .subscribe((state) => {
        // Voltou a conexão: recarrega o que pode ter chegado no meio.
        if (state === 'SUBSCRIBED') load();
      });
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [uid]);

  const mine = data && data.uid === uid ? data : null;
  const messages = useMemo(() => Object.values(mine?.rows ?? {}).sort((a, b) => a.at - b.at), [mine]);
  const unread = messages.filter((m) => m.fromTeam && m.at > (mine?.readAt ?? 0)).length;

  const send = useCallback(async (text: string) => {
    const { data: row, error } = await supabase.rpc('send_support_message', { p_body: text });
    if (error) throw error;
    const m = toMessage(row);
    setData((d) => (d ? { ...d, rows: { ...d.rows, [m.id]: m }, readAt: Date.now() } : d));
  }, []);

  const markRead = useCallback(() => {
    setData((d) => (d ? { ...d, readAt: Date.now() } : d));
    supabase.rpc('mark_support_read').then(() => {});
  }, []);

  const avatarUrl = mine?.avatarUrl;
  const value = useMemo(() => ({ avatarUrl, messages, unread, send, markRead }), [avatarUrl, messages, unread, send, markRead]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSupport() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSupport fora do SupportProvider');
  return v;
}
