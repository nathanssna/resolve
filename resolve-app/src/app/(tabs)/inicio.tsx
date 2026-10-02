import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ActiveOrderCard,
  CatalogFallback,
  Icon,
  IconButton,
  PromoCard,
  SearchTrigger,
  SectionHeader,
  ServiceCard,
  ServiceTile,
  Text,
} from '@/components';
import { defaultAddress } from '@/data/sample';
import { useApp, type ProposalMsg } from '@/state/app';
import { useAuth } from '@/state/auth';
import { useCatalog } from '@/state/catalog';
import { ProHome } from '@/screens/ProHome';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { firstName, formatBRL } from '@/utils/format';
import { notify } from '@/utils/dialog';

/** Profissional vê o painel dele; cliente, o catálogo. */
export default function Inicio() {
  const { profile } = useAuth();
  return profile?.role === 'profissional' ? <ProHome /> : <ClientHome />;
}

function ClientHome() {
  const insets = useSafeAreaInsets();
  const { conversations, orders } = useApp();
  const { services, popular, getService, getProfessional, status, refresh, refreshing } = useCatalog();

  // Card de destaque: proposta esperando resposta > serviço combinado
  const pendingConv = conversations.find((c) => !c.orderId && c.messages.some((m) => m.kind === 'proposal' && m.status === 'pending'));
  const activeOrder = orders.find((o) => o.status === 'combinado');
  const lastDone = orders.find((o) => o.status === 'concluido');

  let highlight: { title: string; subtitle: string; progress: number; onPress: () => void } | null = null;
  if (pendingConv) {
    const pro = getProfessional(pendingConv.proId);
    const p = [...pendingConv.messages].reverse().find((m) => m.kind === 'proposal') as ProposalMsg;
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
            accessibilityLabel={`Endereço: ${defaultAddress.label}, ${defaultAddress.line}. Trocar`}
            onPress={() => notify('Troca de endereço em breve.')}
            style={styles.address}
          >
            <Icon name="map-pin" size={18} strokeWidth={2.25} fill={colors.ink} color={colors.brand} />
            <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
              {defaultAddress.label} · {defaultAddress.line}
            </Text>
            <Icon name="chevron-down" size={16} strokeWidth={2.5} />
          </Pressable>
          <IconButton icon="bell" label="Notificações" floating onPress={() => notify('Sem notificações novas.')} />
        </View>
        <Text variant="display" accessibilityRole="header" style={styles.greeting}>
          Olá! O que vamos resolver hoje?
        </Text>
      </View>

      <View style={styles.searchWrap}>
        <SearchTrigger onPress={() => router.push('/buscar')} />
      </View>

      <View style={styles.body}>
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
          onPress={() => openService('informatica')}
        />
        <PromoCard
          tone="brand"
          icon="shield-check"
          title="Profissionais verificados"
          text="Documentos e avaliações conferidos."
          onPress={() => openService('encanador')}
        />
        <PromoCard
          tone="tint"
          icon="calendar-clock"
          title="Agende para quando quiser"
          text="Hoje, amanhã ou no fim de semana."
          onPress={() => router.push('/buscar')}
        />
      </ScrollView>

      <View style={styles.body}>
        {lastDone ? (
          <View style={{ gap: spacing[3] }}>
            <SectionHeader title="Peça de novo" />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/pedido/novo', params: { serviceId: lastDone.serviceId, proId: lastDone.proId } })}
              style={({ pressed }) => [styles.again, pressed && { opacity: 0.92 }]}
            >
              <View style={styles.againIcon}>
                <Icon name={getService(lastDone.serviceId)?.icon ?? 'wrench'} size={26} duotone />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="labelLg">{getService(lastDone.serviceId)?.title}</Text>
                <Text variant="bodySm" color={colors.inkMuted}>
                  com {getProfessional(lastDone.proId)?.name}
                </Text>
              </View>
              <View style={styles.againCta}>
                <Text variant="label">Pedir</Text>
              </View>
            </Pressable>
          </View>
        ) : null}

        {popular.length > 0 ? (
          <View style={{ gap: spacing[3] }}>
            <SectionHeader title="Mais pedidos na sua região" />
            {popular.map((id) => {
              const s = getService(id);
              if (!s) return null;
              return (
                <ServiceCard
                  key={s.id}
                  icon={s.icon}
                  title={s.title}
                  subtitle={s.subtitle}
                  rating={s.rating}
                  count={s.reviews}
                  onPress={() => openService(s.id)}
                />
              );
            })}
          </View>
        ) : null}
      </View>
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
  promos: { paddingHorizontal: spacing[5], paddingTop: spacing[6], gap: spacing[3] },
  again: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
  },
  againIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  againCta: { height: 36, paddingHorizontal: spacing[4], borderRadius: radius.pill, backgroundColor: colors.brand, justifyContent: 'center' },
});
