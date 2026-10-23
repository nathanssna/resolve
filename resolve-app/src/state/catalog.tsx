/**
 * Catálogo vindo do Supabase: serviços e profissionais (leitura pública).
 *
 * Carrega tudo ao abrir o app (os profissionais em páginas de 1000, o limite da API) e guarda uma cópia
 * no aparelho: nas próximas aberturas a tela aparece na hora (e funciona sem
 * internet) enquanto a versão nova chega.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { IconName } from '@/components';
import { iconPaths } from '@/components/iconPaths';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/utils/pages';

export type Service = {
  id: string;
  icon: IconName;
  title: string;
  /** Rótulo curto para a grade do Início. */
  short: string;
  subtitle: string;
  area: string;
  description: string;
  includes: string[];
  /** Sugestões de pedido mostradas na busca e no formulário. */
  examples: string[];
  badge?: string;
  popular: boolean;
  /** Nome da área no teste e no selo ("Aprovado em Elétrica"). */
  testLabel: string;
};

export type Professional = {
  id: string;
  serviceIds: string[];
  /** Serviços em que passou no teste. Para o cliente, são os mesmos de serviceIds (os outros nem chegam). */
  approvedIds: string[];
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
  /** Pausou o recebimento de pedidos: fora das listas, sem pedido novo. */
  paused: boolean;
  /** Profissional de Ouro (aulas + serviços + nota + pontualidade): o cliente vê a marca e ele sobe na lista. */
  gold: boolean;
  /** Concluiu as aulas da Rezolveaê (etapa do Ouro): sozinho, dá um empurrão na lista. */
  lessonsDone: boolean;
};

type Data = { services: Service[]; professionals: Professional[] };
export type CatalogStatus = 'loading' | 'ready' | 'error';

type CatalogValue = Data & {
  /** 'loading' só enquanto não há nenhum dado (nem a cópia salva). */
  status: CatalogStatus;
  refreshing: boolean;
  /** `silent`: atualiza sem acender o indicador de "puxar para atualizar". */
  refresh: (opts?: { silent?: boolean }) => Promise<void>;
  /** Ids dos serviços em destaque ("Mais pedidos na sua região"). */
  popular: string[];
  getService: (id: string | undefined) => Service | undefined;
  getProfessional: (id: string | undefined) => Professional | undefined;
  /** Quem atende o serviço e está recebendo pedidos. */
  getProfessionals: (serviceId: string | undefined) => Professional[];
};

// v3: serviços com o nome do teste; profissionais com os serviços aprovados.
const CACHE_KEY = 'resolve:catalog:v3';
const Ctx = createContext<CatalogValue | null>(null);

const isIcon = (name: string): name is IconName => name in iconPaths;

async function fetchCatalog(): Promise<Data> {
  const [svc, tests, pros] = await Promise.all([
    supabase
      .from('services')
      .select('id, icon, title, short_title, subtitle, area, description, includes, examples, badge, is_popular')
      .order('sort_order'),
    supabase.from('quiz_tests').select('service_id, label'),
    fetchAllPages((from, to) =>
      supabase
        .from('professionals')
        .select(
          'id, role_title, bio, years_experience, reply_minutes, jobs_count, tags, verified, rating, review_count, base_area, service_radius_km, paused, lessons_done_at, gold_at, profile:profiles!inner(full_name, avatar_url), professional_services(service_id, approved_at)',
        )
        .order('id')
        .range(from, to),
    ),
  ]);
  if (svc.error) throw svc.error;
  const labels = new Map((tests.data ?? []).map((t) => [t.service_id, t.label]));

  const services: Service[] = svc.data.map((s) => ({
    id: s.id,
    icon: isIcon(s.icon) ? s.icon : 'wrench',
    title: s.title,
    short: s.short_title,
    subtitle: s.subtitle,
    area: s.area,
    description: s.description,
    includes: s.includes,
    examples: s.examples,
    badge: s.badge ?? undefined,
    popular: s.is_popular,
    testLabel: labels.get(s.id) || s.title,
  }));

  // Serviços do profissional na ordem do catálogo (a API não garante ordem nas listas aninhadas).
  const order = new Map(services.map((s, i) => [s.id, i]));
  const byCatalog = (a: string, b: string) => (order.get(a) ?? 99) - (order.get(b) ?? 99);

  const professionals: Professional[] = pros
    .map((p) => ({
      id: p.id,
      serviceIds: p.professional_services.map((ps) => ps.service_id).sort(byCatalog),
      approvedIds: p.professional_services.filter((ps) => ps.approved_at).map((ps) => ps.service_id).sort(byCatalog),
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
      paused: p.paused,
      gold: !!p.gold_at,
      lessonsDone: !!p.lessons_done_at,
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

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setRefreshing(true);
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
      // Listas do cliente: quem pausou os pedidos não aparece (o perfil e o chat continuam).
      getProfessionals: (serviceId) => (serviceId ? professionals.filter((p) => p.approvedIds.includes(serviceId) && !p.paused) : []),
    };
  }, [data, failed, refreshing, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCatalog() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCatalog precisa estar dentro de <CatalogProvider>');
  return ctx;
}
