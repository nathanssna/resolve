import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Button, EmptyState, Icon, Segmented, Text } from '@/components';
import { getProfessional, getService } from '@/data/catalog';
import { useApp, type Order } from '@/state/app';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { formatBRL } from '@/utils/format';

const statusBadge: Record<Order['status'], { tone: 'brand' | 'success' | 'muted'; label: string }> = {
  combinado: { tone: 'brand', label: 'COMBINADO' },
  concluido: { tone: 'success', label: 'CONCLUÍDO' },
  cancelado: { tone: 'muted', label: 'CANCELADO' },
};

function OrderCard({ order }: { order: Order }) {
  const service = getService(order.serviceId);
  const pro = getProfessional(order.proId);
  const b = statusBadge[order.status];
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
            com {pro?.name}
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
  const { orders } = useApp();
  const [tab, setTab] = useState<'andamento' | 'historico'>('andamento');
  const list = orders.filter((o) => (tab === 'andamento' ? o.status === 'combinado' : o.status !== 'combinado'));

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
      <ScrollView contentContainerStyle={styles.list}>
        {list.map((o) => (
          <OrderCard key={o.id} order={o} />
        ))}
        {list.length === 0 ? (
          <View style={{ gap: spacing[4] }}>
            <EmptyState
              icon="clipboard-list"
              title={tab === 'andamento' ? 'Nada combinado agora' : 'Sem histórico ainda'}
              description={tab === 'andamento' ? 'Quando você aceitar uma proposta no chat, o serviço aparece aqui.' : 'Seus serviços concluídos aparecem aqui.'}
            />
            {tab === 'andamento' ? (
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
  safe: { flex: 1, backgroundColor: colors.canvas },
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
