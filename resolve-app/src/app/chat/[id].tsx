import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Avatar,
  Bubble,
  Composer,
  EmptyState,
  Icon,
  IconButton,
  goBack,
  ProposalCard,
  RequestCard,
  SystemNote,
  Text,
  TopBar,
  TypingBubble,
} from '@/components';
import { getProfessional, getService } from '@/data/catalog';
import { useApp } from '@/state/app';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { formatBRL } from '@/utils/format';

function notify(msg: string) {
  if (Platform.OS === 'web') window.alert(msg);
  else Alert.alert('Resolve', msg);
}

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { conversations, orders, sendText, respondProposal, markRead, setOpenConversation } = useApp();
  const conv = conversations.find((c) => c.id === id);
  const pro = conv ? getProfessional(conv.proId) : undefined;
  const service = conv ? getService(conv.serviceId) : undefined;
  const order = conv?.orderId ? orders.find((o) => o.id === conv.orderId) : undefined;
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [prefill, setPrefill] = useState<{ text: string; key: number }>();

  useFocusEffect(
    useCallback(() => {
      setOpenConversation(id);
      return () => setOpenConversation(null);
    }, [id, setOpenConversation]),
  );

  const count = conv?.messages.length ?? 0;
  useEffect(() => {
    if (conv?.unread) markRead(conv.id);
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [count, conv?.typing, conv?.unread, conv?.id, markRead]);

  if (!conv || !pro) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <TopBar title="Conversa" />
        <View style={{ padding: spacing[5] }}>
          <EmptyState icon="message-circle" title="Conversa não encontrada" />
        </View>
      </SafeAreaView>
    );
  }

  const quick = order
    ? ['Obrigado!', 'Pode confirmar o horário?', 'Já está a caminho?']
    : ['Qual o valor?', 'Pode vir hoje?', 'Aceita Pix?'];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Cabeçalho */}
        <View style={styles.head}>
          <IconButton icon="arrow-left" label="Voltar" onPress={goBack} />
          <Avatar size={44} />
          <View style={{ flex: 1, gap: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text variant="labelLg" numberOfLines={1} style={{ flexShrink: 1 }}>
                {pro.name}
              </Text>
              {pro.verified ? <Icon name="badge-check" size={16} strokeWidth={2.25} fill={colors.brand} /> : null}
            </View>
            <Text variant="caption" color={conv.typing ? colors.success : colors.inkMuted} numberOfLines={1}>
              {conv.typing ? 'digitando…' : `${service?.short} · responde em ~${pro.replyMin} min`}
            </Text>
          </View>
          <IconButton icon="phone" label="Ligar" onPress={() => notify('Ligação disponível depois que o serviço for combinado.')} />
        </View>

        {order ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/pedido/[id]', params: { id: order.id } })}
            style={({ pressed }) => [styles.deal, pressed && { opacity: 0.9 }]}
          >
            <Icon name="badge-check" size={20} strokeWidth={2.25} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text variant="label" color={colors.onInk}>
                {order.status === 'concluido' ? 'Serviço concluído' : 'Serviço combinado'}
              </Text>
              <Text variant="caption" color={colors.onInkMuted}>
                {formatBRL(order.amount)} · {order.when}
              </Text>
            </View>
            <Text variant="label" color={colors.brand}>
              Ver
            </Text>
          </Pressable>
        ) : null}

        <ScrollView ref={scroll} style={styles.list} contentContainerStyle={styles.listContent}>
          <SystemNote text="Combine tudo por aqui. Não compartilhe senhas ou códigos." />
          {conv.messages.map((m) => {
            switch (m.kind) {
              case 'request':
                return (
                  <RequestCard
                    key={m.id}
                    serviceTitle={m.serviceTitle}
                    description={m.description}
                    when={m.when}
                    address={`${m.address.line} · ${m.address.area}`}
                    at={m.at}
                  />
                );
              case 'proposal':
                return (
                  <ProposalCard
                    key={m.id}
                    amount={m.amount}
                    when={m.when}
                    note={m.note}
                    status={m.status}
                    at={m.at}
                    onAccept={() => respondProposal(conv.id, m.id, true)}
                    onDecline={() => respondProposal(conv.id, m.id, false)}
                    onCounter={() => setPrefill({ text: 'Consigo fechar por R$ ', key: Date.now() })}
                  />
                );
              case 'system':
                return <SystemNote key={m.id} text={m.text} tone={m.text.startsWith('Serviço combinado') ? 'success' : 'muted'} />;
              default:
                return <Bubble key={m.id} mine={m.from === 'me'} text={m.text} at={m.at} />;
            }
          })}
          {conv.typing ? <TypingBubble /> : null}
        </ScrollView>

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
          <Composer quickReplies={quick} prefill={prefill} onSend={(t) => sendText(conv.id, t)} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  deal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginHorizontal: spacing[4],
    marginTop: spacing[3],
    padding: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
    boxShadow: shadows.card,
  },
  list: { flex: 1 },
  listContent: { paddingVertical: spacing[4], gap: spacing[3] },
  composer: { paddingHorizontal: spacing[4], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
});
