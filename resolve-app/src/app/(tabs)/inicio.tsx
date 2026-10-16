import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ActiveOrderCard,
  Avatar,
  CatalogFallback,
  Icon,
  IconButton,
  PromoCard,
  SearchTrigger,
  SectionHeader,
  ServiceTile,
  SuspendedNotice,
  Text,
} from '@/components';
import { useAddresses } from '@/state/addresses';
import { soonestFirst, useApp } from '@/state/app';
import { useAuth } from '@/state/auth';
import { useCatalog, type Professional } from '@/state/catalog';
import { useDistances } from '@/state/distances';
import { ProHome } from '@/screens/ProHome';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import { firstName, formatBRL, formatDecimal } from '@/utils/format';
import { sortProfessionals } from '@/utils/rankProfessionals';
import { serviceStage } from '@/utils/serviceStage';
import { notify } from '@/utils/dialog';

/** Profissional vê o painel dele; cliente, o catálogo. */
export default function Inicio() {
  const { profile } = useAuth();
  return profile?.role === 'profissional' ? <ProHome /> : <ClientHome />;
}

/** Cartão de "Perto de você": toque abre o perfil. */
function NearbyPro({ pro, km, service }: { pro: Professional; km: number; service?: { id: string; short: string } }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pro.name}${service ? `, ${service.short}` : ''}, ${pro.reviews ? `nota ${formatDecimal(pro.rating)}` : 'novo na Rezolveaê'}, a ${km} km`}
      onPress={() => router.push({ pathname: '/profissional/[id]', params: { id: pro.id, serviceId: service?.id } })}
      style={({ pressed }) => [styles.near, pressed && { opacity: 0.9 }]}
    >
      <View>
        <Avatar size={56} uri={pro.avatarUrl} />
        {pro.verified ? (
          <View style={styles.nearSeal}>
            <Icon name="badge-check" size={20} fill={colors.brand} />
          </View>
        ) : null}
      </View>
      <Text variant="label" numberOfLines={1} style={{ marginTop: spacing[1] }}>
        {firstName(pro.name)}
      </Text>
      {service ? (
        <Text variant="caption" color={colors.inkMuted} numberOfLines={1}>
          {service.short}
        </Text>
      ) : null}
      <View style={styles.nearMeta}>
        {pro.reviews ? (
          <>
            <Icon name="star" size={12} fill={colors.star} color={colors.star} strokeWidth={1} />
            <Text variant="caption" style={{ fontFamily: fonts.bold }}>
              {formatDecimal(pro.rating)}
            </Text>
          </>
        ) : (
          <Text variant="caption" style={{ fontFamily: fonts.bold }}>
            Novo
          </Text>
        )}
        <Text variant="caption" color={colors.inkMuted}>{`· ${km} km`}</Text>
      </View>
    </Pressable>
  );
}

function ClientHome() {
  const { primary } = useAddresses();
  const addressText = primary ? `${primary.label} · ${primary.line}` : 'Adicionar endereço';
  const insets = useSafeAreaInsets();
  const { conversations, orders, blocked } = useApp();
  const { suspendedUntil } = useAuth();
  const { services, professionals, getService, getProfessional, status, refresh, refreshing } = useCatalog();

  // Card de destaque: proposta esperando resposta > serviço combinado
  const pendingJob = conversations.flatMap((c) => c.jobs).find((j) => j.state === 'proposta');
  const pendingConv = pendingJob && conversations.find((c) => c.id === pendingJob.conversationId);
  const activeOrder = orders.filter((o) => o.status === 'combinado').sort(soonestFirst)[0];

  // Serviço que pede resposta do cliente (confirmar se foi feito, nova data…) vem primeiro.
  const toAnswer = orders
    .filter((o) => o.status === 'combinado')
    .map((o) => ({ o, stage: serviceStage(o, false, firstName(getProfessional(o.proId)?.name ?? o.other.name)) }))
    .find((x) => x.stage?.tone === 'action');

  let highlight: { title: string; subtitle: string; progress: number; onPress: () => void } | null = null;
  if (toAnswer?.stage) {
    const { o, stage } = toAnswer;
    highlight = {
      title: stage.title,
      subtitle: `${getService(o.serviceId)?.title} · Toque para responder`,
      progress: 0.9,
      onPress: () => router.push({ pathname: '/pedido/[id]', params: { id: o.id } }),
    };
  } else if (pendingConv && pendingJob?.pending) {
    const pro = getProfessional(pendingConv.proId);
    const p = pendingJob.pending;
    highlight = {
      title: `${firstName(pro?.name ?? '')} enviou uma proposta`,
      subtitle: `${formatBRL(p.amount)} · ${p.when} · Toque para responder`,
      progress: 0.5,
      onPress: () => router.push({ pathname: '/chat/[id]', params: { id: pendingConv.id } }),
    };
  } else if (activeOrder) {
    const pro = getProfessional(activeOrder.proId);
    highlight = {
      title: `Combinado com ${firstName(pro?.name ?? '')}`,
      subtitle: `${getService(activeOrder.serviceId)?.title} · ${activeOrder.when}`,
      progress: 0.75,
      onPress: () => router.push({ pathname: '/pedido/[id]', params: { id: activeOrder.id } }),
    };
  }

  // Perto de você: quem tem o endereço principal dentro do raio de atendimento, do mais perto ao mais longe.
  const dist = useDistances(primary?.coords);
  const nearby = useMemo(() => {
    if (!dist) return [];
    const inRange = professionals.filter((p) => !p.paused && !blocked.includes(p.id) && dist.get(p.id)?.inRange);
    return sortProfessionals(inRange, 'proximos', dist).slice(0, 8);
  }, [professionals, blocked, dist]);

  const openService = (id: string) => router.push({ pathname: '/servico/[id]', params: { id } });

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: spacing[8] }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing && status === 'ready'} onRefresh={refresh} tintColor={colors.ink} />}
    >
      {/* Topo amarelo */}
      <View style={[styles.hero, { paddingTop: insets.top + spacing[3] }]}>
        <View style={styles.heroTop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={primary ? `Endereço: ${primary.label}, ${primary.line}. Trocar` : 'Adicionar endereço'}
            onPress={() => router.push('/enderecos')}
            style={styles.address}
          >
            <Icon name="map-pin" size={18} fill={colors.ink} color={colors.brand} />
            <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
              {addressText}
            </Text>
            <Icon name="chevron-down" size={16} />
          </Pressable>
          <IconButton icon="bell" label="Notificações" floating onPress={() => notify('Sem notificações novas.')} />
        </View>
        <Text variant="display" accessibilityRole="header" style={styles.greeting}>
          O que vamos resolver hoje?
        </Text>
      </View>

      <View style={styles.searchWrap}>
        <SearchTrigger onPress={() => router.push('/buscar')} />
      </View>

      <View style={styles.body}>
        {suspendedUntil ? <SuspendedNotice until={suspendedUntil} /> : null}
        {highlight ? <ActiveOrderCard {...highlight} /> : null}

        <View style={{ gap: spacing[3] }}>
          <SectionHeader title="Serviços" action="Ver todos" onAction={() => router.push('/buscar')} />
          {status === 'ready' ? (
            <View style={styles.grid}>
              {services.map((s) => (
                <ServiceTile key={s.id} icon={s.icon} label={s.short} badge={s.badge} onPress={() => openService(s.id)} />
              ))}
            </View>
          ) : (
            <CatalogFallback status={status} onRetry={refresh} />
          )}
        </View>

        <View style={{ gap: spacing[3] }}>
          <SectionHeader title="Perto de você" />
          {!primary?.coords ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/enderecos')} style={({ pressed }) => [styles.invite, pressed && { opacity: 0.85 }]}>
              <View style={styles.inviteIcon}>
                <Icon name="map-pin" size={18} />
              </View>
              <Text variant="label" style={{ flex: 1 }}>
                {primary ? 'Confira seu endereço para ver quem atende perto de você' : 'Adicione seu endereço para ver quem atende perto de você'}
              </Text>
              <Icon name="chevron-right" size={18} />
            </Pressable>
          ) : !dist ? null : nearby.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.nearScroll} contentContainerStyle={styles.nearList}>
              {nearby.map((p) => {
                const svc = getService(p.serviceIds[0]);
                return <NearbyPro key={p.id} pro={p} km={dist.get(p.id)!.km} service={svc && { id: svc.id, short: svc.short }} />;
              })}
            </ScrollView>
          ) : (
            <Text variant="bodySm" color={colors.inkMuted}>
              · ainda não há profissionais perto de você
            </Text>
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.promos}
        snapToInterval={312}
        decelerationRate="fast"
      >
        <PromoCard
          tone="dark"
          icon="message-circle"
          title="Combine direto com o profissional"
          text="Peça orçamentos e negocie o valor pelo chat."
          cta="Como funciona"
          onPress={() => router.push('/ajuda')}
        />
        <PromoCard
          tone="brand"
          icon="shield-check"
          title="Selo Verificado"
          text="Quem tem o selo teve documento e selfie conferidos."
          onPress={() => router.push({ pathname: '/ajuda', params: { abrir: 'selo' } })}
        />
        <PromoCard
          tone="tint"
          icon="calendar-clock"
          title="Agende para quando quiser"
          text="Hoje, amanhã ou no fim de semana."
          onPress={() => router.push('/buscar')}
        />
      </ScrollView>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing[5],
    paddingBottom: 52,
    borderBottomLeftRadius: radius.sheet,
    borderBottomRightRadius: radius.sheet,
    gap: spacing[5],
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
  address: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    height: 44,
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  greeting: { maxWidth: 300 },
  searchWrap: { marginTop: -30, paddingHorizontal: spacing[5] },
  body: { paddingHorizontal: spacing[5], paddingTop: spacing[6], gap: spacing[6] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing[1], rowGap: spacing[3] },
  nearScroll: { marginHorizontal: -spacing[5] },
  nearList: { paddingHorizontal: spacing[5], gap: spacing[3] },
  near: {
    width: 124,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    borderRadius: radius.lg,
    // Cinza dos blocos de serviço, sem sombra: a sombra fica só na busca.
    backgroundColor: colors.surfaceMuted,
  },
  nearSeal: { position: 'absolute', right: -4, bottom: -4 },
  nearMeta: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  invite: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.surfaceMuted },
  inviteIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  promos: { paddingHorizontal: spacing[5], paddingTop: spacing[6], gap: spacing[3] },
});
