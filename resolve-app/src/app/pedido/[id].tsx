import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton, Avatar, Badge, Button, EmptyState, Icon, ListRow, StickyFooter, Text, Timeline, TopBar, type TimelineStep } from '@/components';
import { getProfessional, getService } from '@/data/catalog';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';
import { firstName, formatBRL, formatDecimal } from '@/utils/format';

function notify(msg: string) {
  if (Platform.OS === 'web') window.alert(msg);
  else Alert.alert('Resolve', msg);
}

function confirm(msg: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(msg)) onYes();
  } else {
    Alert.alert('Resolve', msg, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Confirmar', style: 'destructive', onPress: onYes },
    ]);
  }
}

export default function PedidoDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, completeOrder, cancelOrder, rateOrder } = useApp();
  const order = orders.find((o) => o.id === id);
  const [stars, setStars] = useState(0);

  if (!order) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <TopBar title="Pedido" />
        <View style={{ padding: spacing[5] }}>
          <EmptyState icon="clipboard-list" title="Pedido não encontrado" />
        </View>
      </SafeAreaView>
    );
  }

  const service = getService(order.serviceId);
  const pro = getProfessional(order.proId);
  const name = firstName(pro?.name ?? '');
  const done = order.status === 'concluido';
  const canceled = order.status === 'cancelado';

  const steps: TimelineStep[] = [
    { label: 'Pedido enviado', detail: `Você pediu um orçamento a ${name}`, state: 'done' },
    { label: 'Proposta aceita', detail: `${formatBRL(order.amount)} combinados no chat`, state: 'done' },
    { label: 'Dia do serviço', detail: order.when, state: done ? 'done' : canceled ? 'todo' : 'current' },
    { label: canceled ? 'Cancelado' : 'Concluído', detail: done ? 'Tudo resolvido' : undefined, state: done ? 'done' : canceled ? 'current' : 'todo' },
  ];

  const headline = canceled ? 'Serviço cancelado' : done ? 'Tudo resolvido!' : `Combinado para ${order.when.toLowerCase()}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Detalhes do serviço" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.status, done && { backgroundColor: colors.successTint }, canceled && { backgroundColor: colors.surfaceMuted }]}>
          <Badge tone={done ? 'success' : canceled ? 'muted' : 'ink'} icon={done ? 'check' : canceled ? 'x' : 'calendar-clock'}>
            {done ? 'CONCLUÍDO' : canceled ? 'CANCELADO' : 'COMBINADO'}
          </Badge>
          <Text variant="display">{headline}</Text>
          <Text variant="body" color={colors.inkBody}>
            {service?.title} · {order.address.line}
          </Text>
        </View>

        <View style={styles.proCard}>
          <View style={styles.proTop}>
            <Avatar size={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="labelLg">{pro?.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="star" size={13} fill={colors.star} color={colors.star} strokeWidth={1} />
                <Text variant="bodySm">
                  {formatDecimal(pro?.rating ?? 0)} · {pro?.role}
                </Text>
              </View>
            </View>
            {pro?.verified ? <Badge tone="success" icon="badge-check">VERIFICADO</Badge> : null}
          </View>
          <View style={styles.actions}>
            <ActionButton icon="message-circle" label="Mensagem" onPress={() => router.push({ pathname: '/chat/[id]', params: { id: order.conversationId } })} />
            <ActionButton icon="phone" label="Ligar" onPress={() => notify(`Ligando para ${name}… (em breve)`)} />
            <ActionButton icon="share" label="Compartilhar" onPress={() => Share.share({ message: `${service?.title} com ${pro?.name} · ${order.when}` }).catch(() => {})} />
            <ActionButton icon="circle-help" label="Ajuda" onPress={() => notify('Central de ajuda em breve.')} />
          </View>
        </View>

        <View style={styles.block}>
          <Text variant="titleSm">Andamento</Text>
          <Timeline steps={steps} />
        </View>

        <View style={styles.block}>
          <Text variant="titleSm">Resumo</Text>
          <View>
            <ListRow icon={service?.icon ?? 'wrench'} label="Serviço" value={service?.title ?? ''} />
            <ListRow icon="calendar-clock" label="Quando" value={order.when} />
            <ListRow icon="map-pin" label="Onde" value={`${order.address.line} · ${order.address.area}`} />
            <ListRow icon="banknote" label="Valor combinado · pago direto ao profissional" value={formatBRL(order.amount)} />
          </View>
        </View>

        {done ? (
          <View style={[styles.block, styles.rate]}>
            <Text variant="titleSm">{order.rating ? 'Obrigado pela avaliação!' : `Como foi o serviço de ${name}?`}</Text>
            <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel={`Nota: ${order.rating ?? stars} de 5`}>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = n <= (order.rating ?? stars);
                return (
                  <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} estrelas`} disabled={!!order.rating} onPress={() => setStars(n)} hitSlop={6}>
                    <Icon name="star" size={36} strokeWidth={1.75} fill={on ? colors.star : 'none'} color={on ? colors.star : colors.inkMuted} />
                  </Pressable>
                );
              })}
            </View>
            {!order.rating ? (
              <Button variant="dark" block disabled={!stars} onPress={() => rateOrder(order.id, stars)}>
                Enviar avaliação
              </Button>
            ) : null}
          </View>
        ) : null}

        {!done && !canceled ? (
          <Button variant="link" onPress={() => confirm('Cancelar este serviço? Avise o profissional pelo chat.', () => cancelOrder(order.id))} style={{ alignSelf: 'center' }}>
            Cancelar serviço
          </Button>
        ) : null}
      </ScrollView>

      {!done && !canceled ? (
        <StickyFooter>
          <Button variant="primary" block iconLeft="check" onPress={() => completeOrder(order.id)}>
            Serviço concluído
          </Button>
        </StickyFooter>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[5], paddingTop: spacing[2], gap: spacing[5], paddingBottom: spacing[8] },
  status: { padding: spacing[5], borderRadius: radius.xl, backgroundColor: colors.brand, gap: spacing[2] },
  proCard: { padding: spacing[4], borderRadius: radius.xl, backgroundColor: colors.surfaceMuted, gap: spacing[4] },
  proTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  block: { gap: spacing[3] },
  rate: { padding: spacing[4], borderRadius: radius.xl, backgroundColor: colors.brandTint, alignItems: 'center' },
  stars: { flexDirection: 'row', gap: spacing[2], paddingVertical: spacing[2] },
});
