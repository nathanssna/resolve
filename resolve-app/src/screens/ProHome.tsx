import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Badge, Button, CatalogFallback, EmptyState, Icon, SectionHeader, Text } from '@/components';
import { useApp, type Conversation, type Order, type RequestMsg } from '@/state/app';
import { useAuth } from '@/state/auth';
import { useCatalog } from '@/state/catalog';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { firstName, formatBRL, formatDay, formatDecimal } from '@/utils/format';

function RequestRow({ conv, label }: { conv: Conversation; label: string }) {
  const { getService } = useCatalog();
  const request = conv.messages.find((m): m is RequestMsg => m.kind === 'request');
  const last = conv.messages.at(-1);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${conv.other.name}, ${getService(conv.serviceId)?.title ?? ''}`}
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: conv.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.94 }]}
    >
      <View style={styles.cardTop}>
        <Avatar size={44} uri={conv.other.avatarUrl} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="labelLg" numberOfLines={1}>
            {conv.other.name}
          </Text>
          <Text variant="caption" color={colors.inkMuted} numberOfLines={1}>
            {getService(conv.serviceId)?.title} · {last ? formatDay(last.at) : ''}
          </Text>
        </View>
        {conv.unread ? (
          <View style={styles.unread}>
            <Text variant="caption" color={colors.onInk} style={{ fontSize: 11 }}>
              {conv.unread}
            </Text>
          </View>
        ) : null}
      </View>
      {request ? (
        <>
          <Text variant="body" color={colors.inkBody} numberOfLines={2}>
            {request.description}
          </Text>
          <View style={styles.meta}>
            <Icon name="calendar-clock" size={15} color={colors.inkMuted} />
            <Text variant="caption" color={colors.inkMuted}>
              {request.when}
            </Text>
            {request.photos.length ? (
              <>
                <Icon name="image" size={15} color={colors.inkMuted} />
                <Text variant="caption" color={colors.inkMuted}>
                  {request.photos.length === 1 ? '1 foto' : `${request.photos.length} fotos`}
                </Text>
              </>
            ) : null}
          </View>
        </>
      ) : null}
    </Pressable>
  );
}

function OrderRow({ order }: { order: Order }) {
  const { getService } = useCatalog();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/pedido/[id]', params: { id: order.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.94 }]}
    >
      <View style={styles.cardTop}>
        <Avatar size={44} uri={order.other.avatarUrl} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="labelLg" numberOfLines={1}>
            {order.other.name}
          </Text>
          <Text variant="caption" color={colors.inkMuted} numberOfLines={1}>
            {getService(order.serviceId)?.title} · {order.when}
          </Text>
        </View>
        <Text variant="labelLg">{formatBRL(order.amount)}</Text>
      </View>
    </Pressable>
  );
}

/** Início do profissional: pedidos para responder, propostas enviadas e serviços combinados. */
export function ProHome() {
  const insets = useSafeAreaInsets();
  const { profile, session } = useAuth();
  const { status, refresh, conversations, orders } = useApp();
  const { getProfessional, refreshing, refresh: refreshCatalog } = useCatalog();
  // Só aparece no catálogo quem tem nome e pelo menos um serviço.
  const me = getProfessional(session?.user.id);

  const open = conversations.filter((c) => !c.orderId);
  const toAnswer = open.filter((c) => !c.messages.some((m) => m.kind === 'proposal'));
  const waiting = open.filter((c) => c.messages.some((m) => m.kind === 'proposal' && m.status === 'pending'));
  const active = orders.filter((o) => o.status === 'combinado');
  const done = orders.filter((o) => o.status === 'concluido').length;

  const onRefresh = () => {
    refresh();
    refreshCatalog();
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: spacing[8] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />}
    >
      <View style={[styles.hero, { paddingTop: insets.top + spacing[5] }]}>
        <Text variant="overline">PAINEL DO PROFISSIONAL</Text>
        <Text variant="display" accessibilityRole="header">
          {`Olá, ${firstName(profile?.full_name || 'profissional')}!`}
        </Text>
        <Text variant="body" color={colors.onBrand}>
          {toAnswer.length ? `${toAnswer.length === 1 ? '1 pedido espera' : `${toAnswer.length} pedidos esperam`} sua resposta.` : 'Nenhum pedido esperando resposta.'}
        </Text>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text variant="titleLg">{toAnswer.length}</Text>
          <Text variant="caption" color={colors.inkMuted}>
            para responder
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="titleLg">{active.length}</Text>
          <Text variant="caption" color={colors.inkMuted}>
            combinados
          </Text>
        </View>
        <View style={styles.stat}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="star" size={18} fill={colors.star} color={colors.star} strokeWidth={1} />
            <Text variant="titleLg">{me && me.reviews ? formatDecimal(me.rating) : '–'}</Text>
          </View>
          <Text variant="caption" color={colors.inkMuted}>
            {done === 1 ? '1 concluído' : `${done} concluídos`}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        {!me ? (
          <View style={styles.setup}>
            <Badge tone="ink" icon="briefcase">
              FICHA INCOMPLETA
            </Badge>
            <Text variant="titleSm">Os clientes ainda não encontram você</Text>
            <Text variant="bodySm" color={colors.inkBody}>
              Escolha os serviços que você faz e sua profissão para aparecer na lista.
            </Text>
            <Button variant="dark" size="md" onPress={() => router.push('/profissional/ficha')}>
              Completar ficha
            </Button>
          </View>
        ) : null}

        {status === 'loading' || status === 'error' ? <CatalogFallback status={status} onRetry={refresh} /> : null}

        {status === 'ready' ? (
          <>
            <View style={{ gap: spacing[3] }}>
              <SectionHeader title="Responda" />
              {toAnswer.length ? (
                toAnswer.map((c) => <RequestRow key={c.id} conv={c} label="Pedido novo" />)
              ) : (
                <EmptyState icon="message-circle" title="Nenhum pedido novo" description="Quando um cliente pedir orçamento, ele aparece aqui e você recebe uma notificação." />
              )}
            </View>

            {waiting.length ? (
              <View style={{ gap: spacing[3] }}>
                <SectionHeader title="Aguardando o cliente" />
                {waiting.map((c) => (
                  <RequestRow key={c.id} conv={c} label="Proposta enviada" />
                ))}
              </View>
            ) : null}

            {active.length ? (
              <View style={{ gap: spacing[3] }}>
                <SectionHeader title="Combinados" action="Ver pedidos" onAction={() => router.push('/pedidos')} />
                {active.map((o) => (
                  <OrderRow key={o.id} order={o} />
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {me ? (
          <Button variant="secondary" block iconLeft="pencil" onPress={() => router.push('/profissional/ficha')}>
            Editar minha ficha
          </Button>
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
    paddingBottom: spacing[8] + spacing[4],
    gap: spacing[2],
    borderBottomLeftRadius: radius.sheet,
    borderBottomRightRadius: radius.sheet,
  },
  stats: { flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[5], marginTop: -spacing[8] },
  stat: { flex: 1, padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.surface, boxShadow: shadows.card, gap: 2 },
  body: { paddingHorizontal: spacing[5], paddingTop: spacing[6], gap: spacing[6] },
  setup: { padding: spacing[4], borderRadius: radius.xl, backgroundColor: colors.brandTint, gap: spacing[2], alignItems: 'flex-start' },
  card: { padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.surface, boxShadow: shadows.card, gap: spacing[2] },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  unread: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
});
