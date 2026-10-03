/**
 * Catálogo vindo do Supabase: serviços e profissionais (leitura pública).
 *
 * É pequeno, então carrega tudo de uma vez ao abrir o app e guarda uma cópia
 * no aparelho: nas próximas aberturas a tela aparece na hora (e funciona sem
 * internet) enquanto a versão nova chega.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { IconName } from '@/components';
import { iconPaths } from '@/components/iconPaths';
import { supabase } from '@/lib/supabase';

export type Service = {
  id: string;
  icon: IconName;
  title: string;
  /** Rótulo curto para a grade do Início. */
  short: string;
  subtitle: string;
  area: string;
  rating: number;
  reviews: number;
  description: string;
  includes: string[];
  /** Sugestões de pedido mostradas na busca e no formulário. */
  examples: string[];
  badge?: string;
  popular: boolean;
};

export type Professional = {
  id: string;
  serviceIds: string[];
  name: string;
  avatarUrl?: string;
  role: string;
  bio: string;
  rating: number;
  reviews: number;
  years: number;
  /** Tempo típico para responder no chat, em minutos. */
  replyMin: number;
  jobs: number;
  tags: string[];
  verified: boolean;
  /** Bairro de onde sai ("Bela Vista, São Paulo"); vazio = área não informada. */
  area: string;
  /** Até onde atende, em km. */
  radiusKm: number;
};

type Data = { services: Service[]; professionals: Professional[] };
export type CatalogStatus = 'loading' | 'ready' | 'error';

type CatalogValue = Data & {
  /** 'loading' só enquanto não há nenhum dado (nem a cópia salva). */
  status: CatalogStatus;
  refreshing: boolean;
  refresh: () => Promise<void>;
  /** Ids dos serviços em destaque ("Mais pedidos na sua região"). */
  popular: string[];
  getService: (id: string | undefined) => Service | undefined;
  getProfessional: (id: string | undefined) => Professional | undefined;
  getProfessionals: (serviceId: string | undefined) => Professional[];
};

// v2: profissionais com área de atendimento.
const CACHE_KEY = 'resolve:catalog:v2';
const Ctx = createContext<CatalogValue | null>(null);

const isIcon = (name: string): name is IconName => name in iconPaths;

async function fetchCatalog(): Promise<Data> {
  const [svc, pros] = await Promise.all([
    supabase
      .from('services')
      .select('id, icon, title, short_title, subtitle, area, description, includes, examples, badge, rating, review_count, is_popular')
      .order('sort_order'),
    supabase
      .from('professionals')
      .select(
        'id, role_title, bio, years_experience, reply_minutes, jobs_count, tags, verified, rating, review_count, base_area, service_radius_km, profile:profiles!inner(full_name, avatar_url), professional_services(service_id)',
      ),
  ]);
  if (svc.error) throw svc.error;
  if (pros.error) throw pros.error;

  const services: Service[] = svc.data.map((s) => ({
    id: s.id,
    icon: isIcon(s.icon) ? s.icon : 'wrench',
    title: s.title,
    short: s.short_title,
    subtitle: s.subtitle,
    area: s.area,
    rating: Number(s.rating),
    reviews: s.review_count,
    description: s.description,
    includes: s.includes,
    examples: s.examples,
    badge: s.badge ?? undefined,
    popular: s.is_popular,
  }));

  const professionals: Professional[] = pros.data
    .map((p) => ({
      id: p.id,
      serviceIds: p.professional_services.map((ps) => ps.service_id),
      name: p.profile.full_name.trim(),
      avatarUrl: p.profile.avatar_url ?? undefined,
      role: p.role_title,
      bio: p.bio,
      rating: Number(p.rating),
      reviews: p.review_count,
      years: p.years_experience,
      replyMin: p.reply_minutes,
      jobs: p.jobs_count,
      tags: p.tags,
      verified: p.verified,
      area: p.base_area,
      radiusKm: p.service_radius_km,
    }))
    // Ficha incompleta (sem nome ou sem serviço) não aparece para o cliente.
    .filter((p) => p.name !== '' && p.serviceIds.length > 0);

  return { services, professionals };
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const apply = useCallback((fresh: Data) => {
    setData(fresh);
    setFailed(false);
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fresh)).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      apply(await fetchCatalog());
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, [apply]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        // Só usa a cópia se a rede ainda não respondeu.
        setData((current) => current ?? (JSON.parse(raw) as Data));
      })
      .catch(() => {});
    fetchCatalog()
      .then((fresh) => alive && apply(fresh))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [apply]);

  const value = useMemo<CatalogValue>(() => {
    const services = data?.services ?? [];
    const professionals = data?.professionals ?? [];
    const serviceById = new Map(services.map((s) => [s.id, s]));
    const proById = new Map(professionals.map((p) => [p.id, p]));
    return {
      services,
      professionals,
      status: data ? 'ready' : failed ? 'error' : 'loading',
      refreshing,
      refresh,
      popular: services.filter((s) => s.popular).map((s) => s.id),
      getService: (id) => (id ? serviceById.get(id) : undefined),
      getProfessional: (id) => (id ? proById.get(id) : undefined),
      getProfessionals: (serviceId) => (serviceId ? professionals.filter((p) => p.serviceIds.includes(serviceId)) : []),
    };
  }, [data, failed, refreshing, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCatalog() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCatalog precisa estar dentro de <CatalogProvider>');
  return ctx;
}
