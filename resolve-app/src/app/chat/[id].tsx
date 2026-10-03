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
import { addressLine } from '@/state/addresses';
import { useSignedUrls } from '@/state/photoUrls';
import { useTyping } from '@/state/typing';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { formatBRL } from '@/utils/format';
import { confirm, notify } from '@/utils/dialog';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status, role, refresh, conversations, orders, sendText, respondProposal, sendProposal, markRead, closeRequest } = useApp();
  const isPro = role === 'profissional';
  const { session } = useAuth();
  const focused = useIsFocused();
  const { getProfessional, getService } = useCatalog();
  const conv = conversations.find((c) => c.id === id);
  // Do lado do cliente, os dados do profissional vêm do catálogo.
  const pro = conv && !isPro ? getProfessional(conv.proId) : undefined;
  // Cabeçalho: o pedido mais recente que não foi encerrado (senão, o mais recente).
  const service = getService((conv?.jobs.filter((j) => !j.closedBy).at(-1) ?? conv?.latestJob)?.serviceId);
  const convOrders = orders.filter((o) => o.conversationId === conv?.id);
  // Faixa no topo: serviços combinados; sem nenhum, o do pedido mais recente (para avaliar).
  const latestOrder = convOrders.find((o) => o.id === conv?.latestJob?.orderId);
  const active = convOrders.filter((o) => o.status === 'combinado').sort((a, b) => a.createdAt - b.createdAt);
  const banners = active.length ? active : latestOrder && latestOrder.status === 'concluido' ? [latestOrder] : [];
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

  const dealt = active.length > 0;
  const quick = isPro
    ? dealt
      ? ['Estou a caminho', 'Chego em 15 minutos', 'Serviço finalizado!']
      : ['Pode mandar mais fotos?', 'Consigo ir hoje', 'Qual o melhor horário?']
    : dealt
      ? ['Obrigado!', 'Pode confirmar o horário?', 'Já está a caminho?']
      : ['Qual o valor?', 'Pode vir hoje?', 'Aceita Pix?'];

  // Com mais de um pedido na conversa, propostas e avisos dizem de qual serviço são.
  const multi = conv.jobs.length > 1;
  const jobTitle = (jobId?: string) => getService(conv.jobs.find((j) => j.id === jobId)?.serviceId)?.title;
  // Pedidos ainda sem serviço combinado (nem encerrados): o profissional pode mandar proposta.
  const openJobs = conv.jobs.filter((j) => !j.orderId && !j.closedBy);
  const jobOf = (jobId?: string) => conv.jobs.find((j) => j.id === jobId);
  const close = (jobId: string) => {
    const title = jobTitle(jobId);
    confirm(
      isPro
        ? `Recusar o pedido${title ? ` de ${title.toLowerCase()}` : ''}? O cliente será avisado.`
        : `Cancelar o pedido${title ? ` de ${title.toLowerCase()}` : ''}? O profissional será avisado.`,
      () => closeRequest(jobId).catch((e) => notify(authErrorMessage(e))),
    );
  };
  const proposalJobs = openJobs.map((j) => ({
    id: j.id,
    label: getService(j.serviceId)?.title ?? 'Pedido',
    // Sugestão de "Quando": o horário do pedido.
    defaultWhen: j.request?.when === 'O quanto antes' ? 'Hoje' : (j.request?.when ?? ''),
  }));
  const hasPending = openJobs.length === 1 && !!openJobs[0].pending;
  // Novo pedido ao mesmo profissional: começa no serviço do último pedido (se ele ainda fizer).
  const newRequestService = pro?.serviceIds.includes(conv.latestJob?.serviceId ?? '') ? conv.latestJob?.serviceId : pro?.serviceIds[0];
  const combined = convOrders.some((o) => o.status === 'combinado' || o.status === 'concluido');
  const openCount = openJobs.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Cabeçalho */}
        <View style={styles.head}>
          <IconButton icon="arrow-left" label="Voltar" onPress={goBack} />
          <Pressable
            accessibilityRole={pro ? 'button' : undefined}
            accessibilityLabel={pro ? `Ver perfil de ${conv.other.name}` : undefined}
            disabled={!pro}
            onPress={() => pro && router.push({ pathname: '/profissional/[id]', params: { id: pro.id } })}
            style={styles.who}
          >
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
                    ? openCount > 1
                      ? `${openCount} pedidos em aberto`
                      : openCount
                        ? `${getService(openJobs[0].serviceId)?.short} · pedido de orçamento`
                        : service?.short
                    : `${service?.short}${pro ? ` · responde em ~${pro.replyMin} min` : ''}`}
              </Text>
            </View>
          </Pressable>
          {pro && newRequestService ? (
            <IconButton
              icon="plus"
              label="Novo pedido"
              onPress={() => router.push({ pathname: '/pedido/novo', params: { serviceId: newRequestService, proId: pro.id } })}
            />
          ) : null}
          <IconButton icon="phone" label="Ligar" onPress={() => callOther(conv.id, conv.other.name, combined)} />
        </View>

        {banners.map((order) => (
          <Pressable
            key={order.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/pedido/[id]', params: { id: order.id } })}
            style={({ pressed }) => [styles.deal, pressed && { opacity: 0.9 }]}
          >
            <Icon name="badge-check" size={20} strokeWidth={2.25} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text variant="label" color={colors.onInk} numberOfLines={1}>
                {order.status === 'concluido' ? 'Serviço concluído' : 'Serviço combinado'}
                {multi ? ` · ${getService(order.serviceId)?.short ?? ''}` : ''}
              </Text>
              <Text variant="caption" color={colors.onInkMuted}>
                {formatBRL(order.amount)} · {order.when}
              </Text>
            </View>
            <Text variant="label" color={colors.brand}>
              Ver
            </Text>
          </Pressable>
        ))}

        <ScrollView ref={scroll} style={styles.list} contentContainerStyle={styles.listContent}>
          <SystemNote text="Combine tudo por aqui. Não compartilhe senhas ou códigos." />
          {conv.messages.map((m) => {
            switch (m.kind) {
              case 'request': {
                const job = jobOf(m.jobId);
                const open = !!job && !job.orderId && !job.closedBy;
                return (
                  <RequestCard
                    key={m.id}
                    mine={m.from === 'me'}
                    closed={job?.closedBy ? (job.closedBy === 'cliente' ? 'CANCELADO' : 'RECUSADO') : undefined}
                    action={open ? { label: isPro ? 'Recusar pedido' : 'Cancelar pedido', onPress: () => close(job.id) } : undefined}
                    serviceTitle={m.serviceTitle}
                    description={m.description}
                    when={m.when}
                    address={
                      m.addressPartial
                        ? [m.address.area, m.address.city].filter(Boolean).join(' · ')
                        : addressLine({ line: m.address.line, complement: m.address.complement ?? '', area: m.address.area })
                    }
                    addressHint={m.addressPartial ? 'Endereço completo depois de combinar' : undefined}
                    at={m.at}
                    photos={m.photos.map((p) => photoUrls[p])}
                    onOpenPhoto={(index) => {
                      const uris = m.photos.map((p) => photoUrls[p]).filter((u): u is string => !!u);
                      setViewer({ uris, index: Math.min(index, uris.length - 1) });
                    }}
                  />
                );
              }
              case 'proposal':
                return (
                  <ProposalCard
                    key={m.id}
                    mine={m.from === 'me'}
                    serviceTitle={multi ? jobTitle(m.jobId) : undefined}
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
              case 'system': {
                const title = multi ? jobTitle(m.jobId) : undefined;
                return (
                  <SystemNote key={m.id} text={title ? `${title}: ${m.text}` : m.text} tone={m.text.startsWith('Serviço combinado') ? 'success' : 'muted'} />
                );
              }
              default:
                return <Bubble key={m.id} mine={m.from === 'me'} text={m.text} at={m.at} />;
            }
          })}
          {typing ? <TypingBubble /> : null}
        </ScrollView>

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
          {isPro && openCount ? (
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
          jobs={proposalJobs}
          onClose={() => setProposing(false)}
          onSubmit={(jobId, input) => sendProposal(conv.id, jobId, input)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
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
