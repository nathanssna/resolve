/**
 * Distância de cada profissional até um ponto (o endereço do cliente), pela
 * função professional_distances do banco. As coordenadas dos profissionais
 * não saem do banco: só a distância em km inteiros e se o ponto está no raio.
 */
import { useEffect, useState } from 'react';

import type { Coords } from '@/lib/geo';
import { supabase } from '@/lib/supabase';

export type Distance = { km: number; inRange: boolean };

/** `null` = sem ponto (ou ainda carregando/sem rede): a tela segue sem distância. */
export function useDistances(point?: Coords): Map<string, Distance> | null {
  const key = point ? `${point.latitude},${point.longitude}` : null;
  const [data, setData] = useState<{ key: string; map: Map<string, Distance> } | null>(null);

  useEffect(() => {
    if (!key) return;
    const [lat, lng] = key.split(',').map(Number);
    let alive = true;
    supabase.rpc('professional_distances', { p_lat: lat, p_lng: lng }).then(({ data: rows, error }) => {
      if (!alive || error || !rows) return;
      setData({ key, map: new Map(rows.map((r) => [r.professional_id, { km: r.distance_km, inRange: r.in_range }])) });
    });
    return () => {
      alive = false;
    };
  }, [key]);

  return key && data?.key === key ? data.map : null;
}
