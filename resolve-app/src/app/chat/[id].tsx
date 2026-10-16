import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ActionSheet,
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
import { soonestFirst, useApp, type Message } from '@/state/app';
import { useAuth } from '@/state/auth';
import { useCatalog } from '@/state/catalog';
import { addressLine } from '@/state/addresses';
import { useSignedUrls } from '@/state/photoUrls';
import { useTyping } from '@/state/typing';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { formatBRL, formatDayDivider } from '@/utils/format';
import { serviceStage } from '@/utils/serviceStage';
import { supabase } from '@/lib/supabase';
import { confirm, notify } from '@/utils/dialog';

/** Linha da conversa: um separador de dia ou uma mensagem. */
type Item = { key: string; day: string } | { key: string; message: Message };

export default function Chat() {
  // `proposta`: id do pedido para já abrir a proposta (botão do painel do profissional).
  const { id, proposta } = useLocalSearchParams<{ id: string; proposta?: string }>();
  const { status, role, refresh, conversations, orders, sendText, respondProposal, sendProposal, markRead, loadOlder, closeRequest, block, unblock } = useApp();
  const isPro = role === 'profissional';
  const { session } = useAuth();
  const focused = useIsFocused();
  const { getProfessional, getService } = useCatalog();
  const conv = conversations.find((c) => c.id === id);
  // Do lado do cliente, os dados do profissional vêm do catálogo.
  const pro = conv && !isPro ? getProfessional(conv.proId) : undefined;
  const convOrders = orders.filter((o) => o.conversationId === conv?.id);
  // Uma faixa só no topo: o próximo serviço combinado (e quantos há); sem nenhum, o cliente
  // vê o último concluído enquanto não avaliar. Avaliado, a faixa some.
  const latestOrder = convOrders.find((o) => o.id === conv?.latestJob?.orderId);
  const active = convOrders.filter((o) => o.status === 'combinado').sort(soonestFirst);
  const toRate = !isPro && latestOrder?.status === 'concluido' && latestOrder.rating == null ? latestOrder : undefined;
  // Serviço que pede uma resposta (confirmar, nova data…) vem antes na faixa.
  const staged = active.map((o) => ({ o, stage: serviceStage(o, isPro, conv?.other.name.split(' ')[0] ?? '') })).find((x) => x.stage);
  const stage = staged?.stage;
  const insets = useSafeAreaInsets();
  const [prefill, setPrefill] = useState<{ text: string; key: number }>();
  const [busy, setBusy] = useState<string | null>(null);
  const { otherTyping: typing, notifyTyping } = useTyping(conv?.id, session?.user.id);
  const photoPaths = conv?.messages.flatMap((m) => (m.kind === 'request' ? m.photos : [])) ?? [];
  const photoUrls = useSignedUrls(photoPaths);
  const [viewer, setViewer] = useState<{ uris: string[]; index: number } | null>(null);
  const [proposing, setProposing] = useState(!!proposta);
  const [menu, setMenu] = useState(false);

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
  // Mensagens anteriores: ao rolar até o topo ou pelo botão.
  const [loadingOlder, setLoadingOlder] = useState(false);
  const older = () => {
    if (!conv?.hasOlder || loadingOlder) return;
    setLoadingOlder(true);
    loadOlder(conv.id)
      .catch((e) => notify(authErrorMessage(e)))
      .finally(() => setLoadingOlder(false));
  };


  useEffect(() => {
    // Só marca como lido o que está na tela (não com o pedido aberto por cima).
    if (focused && conv?.unread) markRead(conv.id);
  }, [focused, conv?.unread, conv?.id, markRead]);

  // Profissional: histórico do cliente, no pedido em aberto (serviços concluídos, cancelamentos em cima da hora).
  const clientId = isPro ? conv?.clientId : undefined;
  const [record, setRecord] = useState<{ clientId: string; done: number; late: number; phone: boolean; verified: boolean; wrong: number } | null>(null);
  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    supabase.rpc('client_track_record', { p_client_id: clientId }).then(({ data }) => {
      const r = data?.[0];
      if (alive && r) setRecord({ clientId, done: r.done, late: r.late_cancels, phone: r.has_phone, verified: r.identity_verified, wrong: r.wrong_contests });
    });
    return () => {
      alive = false;
    };
  }, [clientId]);
  const clientNote = record && record.clientId === clientId ? describeClient(record) : undefined;

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
      ? ['Estou a caminho', 'Chego em 15 minutos', 'Qual o ponto de referência?']
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
      { confirmLabel: isPro ? 'Recusar' : 'Cancelar', cancelLabel: 'Voltar', danger: true },
    );
  };
  const proposalJobs = openJobs.map((j) => ({
    id: j.id,
    label: getService(j.serviceId)?.title ?? 'Pedido',
    // Sugestão de "Quando": o dia e o período do pedido.
    defaultWhen: j.request?.when ?? '',
    defaultSchedule: j.request?.schedule,
  }));
  const hasPending = openJobs.length === 1 && !!openJobs[0].pending;
  // Novo pedido ao mesmo profissional: começa no serviço do último pedido (se ele ainda fizer).
  const newRequestService = pro?.serviceIds.includes(conv.latestJob?.serviceId ?? '') ? conv.latestJob?.serviceId : pro?.serviceIds[0];
  // Conversa travada: eu bloqueei ou a outra conta foi excluída.
  const locked = conv.blockedByMe || !!conv.other.deleted;
  const otherFirst = conv.other.name.split(' ')[0];
  // Cabeçalho enxuto: só Ligar fica à vista; o resto vai para o menu ⋮.
  const menuActions = [
    ...(pro && newRequestService && !locked
      ? [
          {
            icon: 'plus' as const,
            label: 'Novo pedido',
            onPress: () => router.push({ pathname: '/pedido/novo', params: { serviceId: newRequestService, proId: pro.id } }),
          },
        ]
      : []),
    ...(pro ? [{ icon: 'user-round' as const, label: 'Ver perfil', onPress: () => router.push({ pathname: '/profissional/[id]', params: { id: pro.id } }) }] : []),
    ...(conv.other.deleted
      ? []
      : [
          {
            icon: 'flag' as const,
            label: `Denunciar ${otherFirst}`,
            onPress: () => router.push({ pathname: '/denunciar', params: { userId: conv.other.id, name: conv.other.name, conversationId: conv.id } }),
          },
          conv.blockedByMe
            ? { icon: 'ban' as const, label: `Desbloquear ${otherFirst}`, onPress: () => unblock(conv.other.id).catch((e) => notify(authErrorMessage(e))) }
            : {
                icon: 'ban' as const,
                label: `Bloquear ${otherFirst}`,
                danger: true,
                onPress: () =>
                  confirm(`Bloquear ${conv.other.name}? Vocês não vão mais conseguir trocar mensagens, pedidos ou propostas.`, () =>
                    block(conv.other.id).catch((e) => notify(authErrorMessage(e))),
                    { confirmLabel: 'Bloquear', danger: true },
                  ),
              },
        ]),
  ];
  const combined = convOrders.some((o) => o.status === 'combinado' || o.status === 'concluido');
  const openCount = openJobs.length;
  // Mensagens com um separador a cada dia novo ("Hoje", "Ontem", "Sex, 10/10").
  const items: Item[] = [];
  conv.messages.forEach((m, i) => {
    const prev = conv.messages[i - 1];
    if (!prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString()) items.push({ key: `day-${m.id}`, day: formatDayDivider(m.at) });
    items.push({ key: m.id, message: m });
  });
  // "Visto" embaixo da minha última mensagem, se o outro já abriu a conversa depois dela e ainda não respondeu.
  const lastMine = conv.messages.findLast((m) => m.from !== 'system')?.from === 'me' ? conv.messages.findLast((m) => m.from === 'me') : undefined;
  const seenId = lastMine && conv.otherReadAt >= lastMine.at ? lastMine.id : undefined;

  const renderMessage = (m: Message) => {
    switch (m.kind) {
      case 'request': {
        const job = jobOf(m.jobId);
        const open = !!job && !job.orderId && !job.closedBy;
        return (
          <RequestCard
            mine={m.from === 'me'}
            closed={job?.closedBy ? { cliente: 'CANCELADO', profissional: 'RECUSADO', sistema: 'SEM RESPOSTA' }[job.closedBy] : undefined}
            action={open && !locked ? { label: isPro ? 'Recusar pedido' : 'Cancelar pedido', onPress: () => close(job.id) } : undefined}
            serviceTitle={m.serviceTitle}
            description={m.description}
            when={m.when}
            address={
              m.addressPartial
                ? [m.address.area, m.address.city].filter(Boolean).join(' · ')
                : addressLine({ line: m.address.line, complement: m.address.complement ?? '', area: m.address.area })
            }
            addressHint={m.addressPartial ? 'Endereço completo depois de combinar' : undefined}
            clientNote={open ? clientNote : undefined}
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
        // Combinado e concluído ganham destaque verde; concluído com o ✓.
        const concluded = m.text.startsWith('Serviço concluído') || m.text.endsWith('Serviço concluído.');
        return (
          <SystemNote
            text={title ? `${title}: ${m.text}` : m.text}
            tone={concluded || m.text.startsWith('Serviço combinado') ? 'success' : 'muted'}
            icon={concluded ? 'check' : 'badge-check'}
          />
        );
      }
      default:
        return <Bubble mine={m.from === 'me'} text={m.text} at={m.at} />;
    }
  };

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
              {/* Só o nome; o "digitando…" aparece embaixo quando for o caso. */}
              {typing ? (
                <Text variant="caption" color={colors.success} numberOfLines={1}>
                  digitando…
                </Text>
              ) : null}
            </View>
          </Pressable>
          {!conv.other.deleted ? <IconButton icon="phone" label="Ligar" onPress={() => callOther(conv.id, conv.other.name, combined)} /> : null}
          <IconButton icon="ellipsis-vertical" label="Mais opções" onPress={() => setMenu(true)} />
        </View>

        {active[0] || toRate ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              staged
                ? router.push({ pathname: '/pedido/[id]', params: { id: staged.o.id } })
                : active.length > 1
                  ? router.push('/pedidos')
                  : router.push({ pathname: '/pedido/[id]', params: { id: (active[0] ?? toRate)!.id } })
            }
            style={({ pressed }) => [styles.deal, pressed && { opacity: 0.9 }]}
          >
            <Icon name="badge-check" size={20} strokeWidth={2.25} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text variant="label" color={colors.onInk} numberOfLines={1}>
                {stage ? stage.title : active.length > 1 ? `${active.length} serviços combinados` : active[0] ? 'Serviço combinado' : 'Serviço concluído'}
              </Text>
              <Text variant="caption" color={colors.onInkMuted} numberOfLines={1}>
                {stage
                  ? stage.tone === 'action'
                    ? 'Toque para responder'
                    : (stage.text ?? '')
                  : active[0]
                    ? `${active.length > 1 ? `Próximo: ${getService(active[0].serviceId)?.short ?? ''} · ` : ''}${formatBRL(active[0].amount)} · ${active[0].when}`
                    : 'Toque para avaliar'}
              </Text>
            </View>
            <Text variant="label" color={colors.brand}>
              {stage?.tone === 'action' ? 'Abrir' : active[0] ? 'Ver' : 'Avaliar'}
            </Text>
          </Pressable>
        ) : null}

        {/* Invertida (padrão de chat): abre na mensagem mais recente e só desenha o que está perto da tela. */}
        <FlatList
          inverted
          data={items.toReversed()}
          keyExtractor={(item) => item.key}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          onEndReached={older}
          ListFooterComponent={
            conv.hasOlder ? (
              <Button variant="secondary" size="md" onPress={older} disabled={loadingOlder} style={styles.older}>
                {loadingOlder ? 'Carregando…' : 'Carregar mensagens anteriores'}
              </Button>
            ) : (
              <SystemNote text="Combine tudo por aqui. Não compartilhe senhas ou códigos." />
            )
          }
          renderItem={({ item }) =>
            'day' in item ? (
              <SystemNote text={item.day} />
            ) : (
              <View style={{ gap: spacing[1] }}>
                {renderMessage(item.message)}
                {item.message.id === seenId ? (
                  <Text variant="caption" color={colors.inkMuted} style={styles.seen}>
                    Visto
                  </Text>
                ) : null}
              </View>
            )
          }
          ListHeaderComponent={typing ? <TypingBubble /> : null}
        />

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
          {locked ? (
            <View style={styles.locked}>
              <Icon name="ban" size={18} color={colors.inkMuted} />
              <Text variant="bodySm" color={colors.inkBody} style={{ flex: 1 }}>
                {conv.other.deleted ? 'Esta conta foi excluída. Não é possível enviar mensagens.' : `Você bloqueou ${conv.other.name}.`}
              </Text>
              {conv.blockedByMe && !conv.other.deleted ? (
                <Button variant="secondary" size="md" onPress={() => unblock(conv.other.id).catch((e) => notify(authErrorMessage(e)))}>
                  Desbloquear
                </Button>
              ) : null}
            </View>
          ) : (
            <>
              {isPro && openCount ? (
                <Button variant="secondary" block size="md" iconLeft="receipt" onPress={() => setProposing(true)}>
                  {hasPending ? 'Enviar nova proposta' : 'Enviar proposta'}
                </Button>
              ) : null}
              <Composer quickReplies={quick} prefill={prefill} onSend={send} onTyping={notifyTyping} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
      <PhotoViewer uris={viewer?.uris ?? []} index={viewer ? viewer.index : null} onClose={() => setViewer(null)} />
      <ActionSheet visible={menu} title={conv.other.name} actions={menuActions} onClose={() => setMenu(false)} />
      {isPro ? (
        <ProposalSheet
          visible={proposing}
          jobs={proposalJobs}
          initialJobId={proposta}
          onClose={() => setProposing(false)}
          onSubmit={(jobId, input) => sendProposal(conv.id, jobId, input)}
        />
      ) : null}
    </SafeAreaView>
  );
}

/**
 * O que se sabe do cliente: "Identidade confirmada · telefone informado · 3 serviços concluídos ·
 * 1 cancelamento em cima da hora · 1 contestação indevida" (ou "Cliente novo na Rezolveaê").
 */
function describeClient({ done, late, phone, verified, wrong }: { done: number; late: number; phone: boolean; verified: boolean; wrong: number }) {
  const parts = [
    verified ? 'Identidade confirmada' : null,
    phone ? 'telefone informado' : 'sem telefone',
    done || late ? `${done} ${done === 1 ? 'serviço concluído' : 'serviços concluídos'}` : 'cliente novo na Rezolveaê',
    late ? `${late} ${late === 1 ? 'cancelamento' : 'cancelamentos'} em cima da hora` : null,
    wrong ? `${wrong} ${wrong === 1 ? 'contestação indevida' : 'contestações indevidas'}` : null,
  ].filter(Boolean) as string[];
  const text = parts.join(' · ');
  return { text: text.charAt(0).toUpperCase() + text.slice(1), warn: late > 0 || wrong > 0 };
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  locked: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingBottom: spacing[1] },
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
  seen: { alignSelf: 'flex-end', paddingHorizontal: spacing[4] },
  older: { alignSelf: 'center' },
  listContent: { paddingVertical: spacing[4], gap: spacing[3] },
  composer: { gap: spacing[3], paddingHorizontal: spacing[4], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
});
