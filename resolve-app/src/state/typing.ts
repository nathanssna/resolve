/**
 * "Digitando…" no chat, por Realtime Broadcast (nada é gravado no banco).
 *
 * Um canal por conversa (`typing:<id>`). Quem digita avisa no máximo a cada
 * 2 s; o indicador some 3,5 s depois do último aviso.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

const SEND_EVERY = 2000;
const SHOW_FOR = 3500;

export function useTyping(conversationId: string | undefined, myId: string | undefined) {
  const [otherTyping, setOtherTyping] = useState(false);
  const channel = useRef<RealtimeChannel | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!conversationId || !myId) return;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const ch = supabase
      .channel(`typing:${conversationId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.userId === myId) return;
        setOtherTyping(true);
        clearTimeout(hide);
        hide = setTimeout(() => setOtherTyping(false), SHOW_FOR);
      })
      .subscribe();
    channel.current = ch;
    return () => {
      clearTimeout(hide);
      channel.current = null;
      supabase.removeChannel(ch);
    };
  }, [conversationId, myId]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSent.current < SEND_EVERY) return;
    lastSent.current = now;
    channel.current?.send({ type: 'broadcast', event: 'typing', payload: { userId: myId } });
  }, [myId]);

  return { otherTyping, notifyTyping };
}
