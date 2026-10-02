import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Avatar,
  Bubble,
  Button,
  CatalogFallback,
  Composer,
  EmptyState,
  Icon,
  IconButton,
  goBack,
  PhotoViewer,
  ProposalCard,
  ProposalSheet,
  RequestCard,
  SystemNote,
  Text,
  TopBar,
  TypingBubble,
} from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { callOther } from '@/lib/contact';
import { setOpenChat } from '@/lib/push';
import { useApp } from '@/state/app';
import { useAuth } from '@/state/auth';
import { useCatalog } from '@/state/catalog';
import { useSignedUrls } from '@/state/photoUrls';
import { useTyping } from '@/state/typing';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { formatBRL } from '@/utils/format';
import { notify } from '@/utils/dialog';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status, role, refresh, conversations, orders, sendText, respondProposal, sendProposal, markRead } = useApp();
  const isPro = role === 'profissional';
  const { session } = useAuth();
  const focused = useIsFocused();
  const { getProfessional, getService } = useCatalog();
  const conv = conversations.find((c) => c.id === id);
  // Do lado do cliente, os dados do profissional vêm do catálogo.
  const pro = conv && !isPro ? getProfessional(conv.proId) : undefined;
  const service = conv ? getService(conv.serviceId) : undefined;
  const order = conv?.orderId ? orders.find((o) => o.id === conv.orderId) : undefined;
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [prefill, setPrefill] = useState<{ text: string; key: number }>();
  const [busy, setBusy] = useState<string | null>(null);
  const { otherTyping: typing, notifyTyping } = useTyping(conv?.id, session?.user.id);
  const photoPaths = conv?.messages.flatMap((m) => (m.kind === 'request' ? m.photos : [])) ?? [];
  const photoUrls = useSignedUrls(photoPaths);
  const [viewer, setViewer] = useState<{ uris: string[]; index: number } | null>(null);
  const [proposing, setProposing] = useState(false);

  // Com o chat na tela, a notificação desta conversa não aparece.
  useEffect(() => {
    if (!focused || !conv?.id) return;
    setOpenChat(conv.id);
    return () => setOpenChat(null);
  }, [focused, conv?.id]);

  const answer = (messageId: string, accept: boolean) => {
    if (!conv || busy) return;
    setBusy(messageId);
    respondProposal(conv.id, messageId, accept)
      .catch((e) => notify(authErrorMessage(e)))
      .finally(() => setBusy(null));
  };
  const send = (text: string) => {
    if (conv) sendText(conv.id, text).catch((e) => notify(`Mensagem não enviada. ${authErrorMessage(e)}`));
  };


  const count = conv?.messages.length ?? 0;
  useEffect(() => {
    // Só marca como lido o que está na tela (não com o pedido aberto por cima).
    if (focused && conv?.unread) markRead(conv.id);
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [count, typing, focused, conv?.unread, conv?.id, markRead]);

  if (!conv) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <TopBar title="Conversa" />
        <View style={{ padding: spacing[5], gap: spacing[4] }}>
          {status === 'idle' ? (
            <>
              <EmptyState icon="message-circle" title="Entre para ver suas conversas" />
              <Button variant="primary" block onPress={() => router.push('/entrar')}>
                Entrar
              </Button>
            </>
          ) : status === 'ready' ? (
            <EmptyState icon="message-circle" title="Conversa não encontrada" />
          ) : (
            <CatalogFallback status={status} onRetry={refresh} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const quick = isPro
    ? order
      ? ['Estou a caminho', 'Chego em 15 minutos', 'Serviço finalizado!']
      : ['Qual o endereço exato?', 'Pode mandar mais fotos?', 'Consigo ir hoje']
    : order
      ? ['Obrigado!', 'Pode confirmar o horário?', 'Já está a caminho?']
      : ['Qual o valor?', 'Pode vir hoje?', 'Aceita Pix?'];

  // Sugestão de "Quando" na proposta: o horário do pedido.
  const requestWhen = conv.messages.find((m) => m.kind === 'request')?.when ?? '';
  const defaultWhen = requestWhen === 'O quanto antes' ? 'Hoje' : requestWhen;
  const hasPending = conv.messages.some((m) => m.kind === 'proposal' && m.status === 'pending');
  const combined = order?.status === 'combinado' || order?.status === 'concluido';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Cabeçalho */}
        <View style={styles.head}>
          <IconButton icon="arrow-left" label="Voltar" onPress={goBack} />
          <Avatar size={44} uri={conv.other.avatarUrl} />
          <View style={{ flex: 1, gap: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text variant="labelLg" numberOfLines={1} style={{ flexShrink: 1 }}>
                {conv.other.name}
              </Text>
              {pro?.verified ? <Icon name="badge-check" size={16} strokeWidth={2.25} fill={colors.brand} /> : null}
            </View>
            <Text variant="caption" color={typing ? colors.success : colors.inkMuted} numberOfLines={1}>
              {typing
                ? 'digitando…'
                : isPro
                  ? `${service?.short} · pedido de orçamento`
                  : `${service?.short}${pro ? ` · responde em ~${pro.replyMin} min` : ''}`}
            </Text>
          </View>
          <IconButton icon="phone" label="Ligar" onPress={() => callOther(conv.id, conv.other.name, combined)} />
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
                    mine={m.from === 'me'}
                    serviceTitle={m.serviceTitle}
                    description={m.description}
                    when={m.when}
                    address={`${m.address.line} · ${m.address.area}`}
                    at={m.at}
                    photos={m.photos.map((p) => photoUrls[p])}
                    onOpenPhoto={(index) => {
                      const uris = m.photos.map((p) => photoUrls[p]).filter((u): u is string => !!u);
                      setViewer({ uris, index: Math.min(index, uris.length - 1) });
                    }}
                  />
                );
              case 'proposal':
                return (
                  <ProposalCard
                    key={m.id}
                    mine={m.from === 'me'}
                    amount={m.amount}
                    when={m.when}
                    note={m.note}
                    status={m.status}
                    at={m.at}
                    onAccept={() => answer(m.id, true)}
                    onDecline={() => answer(m.id, false)}
                    onCounter={() => setPrefill({ text: 'Consigo fechar por R$ ', key: Date.now() })}
                  />
                );
              case 'system':
                return <SystemNote key={m.id} text={m.text} tone={m.text.startsWith('Serviço combinado') ? 'success' : 'muted'} />;
              default:
                return <Bubble key={m.id} mine={m.from === 'me'} text={m.text} at={m.at} />;
            }
          })}
          {typing ? <TypingBubble /> : null}
        </ScrollView>

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
          {isPro && !order ? (
            <Button variant="secondary" block size="md" iconLeft="receipt" onPress={() => setProposing(true)}>
              {hasPending ? 'Enviar nova proposta' : 'Enviar proposta'}
            </Button>
          ) : null}
          <Composer quickReplies={quick} prefill={prefill} onSend={send} onTyping={notifyTyping} />
        </View>
      </KeyboardAvoidingView>
      <PhotoViewer uris={viewer?.uris ?? []} index={viewer ? viewer.index : null} onClose={() => setViewer(null)} />
      {isPro ? (
        <ProposalSheet
          visible={proposing}
          defaultWhen={defaultWhen}
          onClose={() => setProposing(false)}
          onSubmit={(input) => sendProposal(conv.id, input)}
        />
      ) : null}
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
  composer: { gap: spacing[3], paddingHorizontal: spacing[4], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
});
