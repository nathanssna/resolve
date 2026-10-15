import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Button, CatalogFallback, EmptyState, Icon, Segmented, serviceStage, Text } from '@/components';
import { soonestFirst, useApp, type Order } from '@/state/app';
import { useCatalog } from '@/state/catalog';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { formatBRL } from '@/utils/format';

const statusBadge: Record<Order['status'], { tone: 'brand' | 'success' | 'muted'; label: string }> = {
  combinado: { tone: 'brand', label: 'COMBINADO' },
  concluido: { tone: 'success', label: 'CONCLUÍDO' },
  cancelado: { tone: 'muted', label: 'CANCELADO' },
};

function OrderCard({ order, isPro }: { order: Order; isPro: boolean }) {
  const { getService } = useCatalog();
  const service = getService(order.serviceId);
  // Combinado com algo a decidir: a etiqueta diz de quem é a vez.
  const stage = serviceStage(order, isPro, '');
  const b = stage ? (stage.tone === 'action' ? { tone: 'brand' as const, label: 'RESPONDER' } : { tone: 'muted' as const, label: 'AGUARDANDO' }) : statusBadge[order.status];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/pedido/[id]', params: { id: order.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.94 }]}
    >
      <View style={styles.cardTop}>
        <View style={styles.icon}>
          <Icon name={service?.icon ?? 'wrench'} size={26} duotone />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="labelLg">{service?.title}</Text>
          <Text variant="bodySm" color={colors.inkMuted}>
            {order.other.name ? `com ${order.other.name}` : ''}
          </Text>
        </View>
        <Badge tone={b.tone}>{b.label}</Badge>
      </View>
      <View style={styles.cardBottom}>
        <View style={styles.meta}>
          <Icon name="calendar-clock" size={16} />
          <Text variant="label">{order.when}</Text>
        </View>
        <Text variant="labelLg">{formatBRL(order.amount)}</Text>
      </View>
    </Pressable>
  );
}

export default function Pedidos() {
  const { status, role, refresh, orders } = useApp();
  // `aba=historico`: o resumo do mês, no painel do profissional, abre direto no histórico.
  const { aba } = useLocalSearchParams<{ aba?: string }>();
  const [tab, setTab] = useState<'andamento' | 'historico'>(aba === 'historico' ? 'historico' : 'andamento');
  const [lastAba, setLastAba] = useState(aba);
  if (aba !== lastAba) {
    setLastAba(aba);
    if (aba === 'historico') setTab('historico');
  }
  // Em andamento: o próximo serviço primeiro. Histórico: o mais recente primeiro.
  const list = tab === 'andamento' ? orders.filter((o) => o.status === 'combinado').sort(soonestFirst) : orders.filter((o) => o.status !== 'combinado');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <Text variant="titleLg" accessibilityRole="header">
          Pedidos
        </Text>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: 'andamento', label: 'Em andamento' },
            { id: 'historico', label: 'Histórico' },
          ]}
        />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
        {list.map((o) => (
          <OrderCard key={o.id} order={o} isPro={role === 'profissional'} />
        ))}
        {status === 'idle' ? (
          <View style={{ gap: spacing[4] }}>
            <EmptyState icon="clipboard-list" title="Entre para ver seus pedidos" description="Os serviços que você combinar no chat aparecem aqui." />
            <Button variant="primary" block onPress={() => router.push('/entrar')}>
              Entrar ou criar conta
            </Button>
          </View>
        ) : null}
        {status === 'loading' || status === 'error' ? <CatalogFallback status={status} onRetry={refresh} /> : null}
        {status === 'ready' && list.length === 0 ? (
          <View style={{ gap: spacing[4] }}>
            <EmptyState
              icon="clipboard-list"
              title={tab === 'andamento' ? 'Nada combinado agora' : 'Sem histórico ainda'}
              description={
                tab === 'andamento'
                  ? role === 'profissional'
                    ? 'Quando um cliente aceitar uma proposta sua, o serviço aparece aqui.'
                    : 'Quando você aceitar uma proposta no chat, o serviço aparece aqui.'
                  : 'Seus serviços concluídos aparecem aqui.'
              }
            />
            {tab === 'andamento' && role !== 'profissional' ? (
              <Button variant="primary" block onPress={() => router.push('/buscar')}>
                Pedir um orçamento
              </Button>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Branco atrás da barra de status, como o cabeçalho; o cinza fica só na lista.
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1, backgroundColor: colors.canvas },
  head: { paddingHorizontal: spacing[5], paddingTop: spacing[4], paddingBottom: spacing[4], gap: spacing[4], backgroundColor: colors.surface },
  list: { padding: spacing[5], gap: spacing[3] },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing[4], gap: spacing[4], boxShadow: shadows.card },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  icon: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
});
