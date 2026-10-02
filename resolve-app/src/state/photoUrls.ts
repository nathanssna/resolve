/**
 * URLs assinadas das fotos do pedido (bucket privado `request-photos`).
 * Cada link vale 1 h; o cache reaproveita enquanto faltar mais de 5 min.
 */
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

const TTL = 3600;
const cache = new Map<string, { url: string; expiresAt: number }>();

const fresh = (path: string) => {
  const hit = cache.get(path);
  return hit && hit.expiresAt - Date.now() > 5 * 60_000 ? hit.url : undefined;
};

/** Devolve `{ caminho: url }` para as fotos que já têm link. */
export function useSignedUrls(paths: string[]) {
  const key = paths.join('|');
  const [urls, setUrls] = useState<Record<string, string>>(() =>
    Object.fromEntries(paths.flatMap((p) => (fresh(p) ? [[p, fresh(p)!]] : []))),
  );

  useEffect(() => {
    const list = key ? key.split('|') : [];
    const missing = list.filter((p) => !fresh(p));
    const ready = () => Object.fromEntries(list.flatMap((p) => (fresh(p) ? [[p, fresh(p)!]] : [])));
    if (missing.length === 0) {
      Promise.resolve().then(() => setUrls(ready()));
      return;
    }
    let alive = true;
    supabase.storage
      .from('request-photos')
      .createSignedUrls(missing, TTL)
      .then(({ data }) => {
        for (const item of data ?? []) {
          if (item.signedUrl && item.path) cache.set(item.path, { url: item.signedUrl, expiresAt: Date.now() + TTL * 1000 });
        }
        if (alive) setUrls(ready());
      });
    return () => {
      alive = false;
    };
  }, [key]);

  return urls;
}
