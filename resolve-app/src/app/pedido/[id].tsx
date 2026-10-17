import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ActionButton,
  Avatar,
  Badge,
  Button,
  DoneSheet,
  EmptyState,
  Field,
  Icon,
  ListRow,
  PhotoViewer,
  Rating,
  RescheduleSheet,
  ServicePanel,
  Text,
  Timeline,
  TopBar,
  type TimelineStep,
} from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { callOther } from '@/lib/contact';
import { useApp } from '@/state/app';
import { useSignedUrls } from '@/state/photoUrls';
import { addressLine } from '@/state/addresses';
import { useCatalog } from '@/state/catalog';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import { firstName, formatBRL } from '@/utils/format';
import { cancelIsLate } from '@/utils/schedule';
import { serviceStage, type ServiceAction } from '@/utils/serviceStage';
import { notify, confirm } from '@/utils/dialog';

export default function PedidoDetalhe() {
  // `acao`: botão do lembrete do dia ("confirmar" ou "remarcar").
  const { id, acao } = useLocalSearchParams<{ id: string; acao?: string }>();
  const { role, orders, markDone, confirmDone, requestReschedule, respondReschedule, disputeOrder, askTeam, cancelOrder, rateOrder, rateClient, confirmDay } = useApp();
  const isPro = role === 'profissional';
  const { getProfessional, getService } = useCatalog();
  const order = orders.find((o) => o.id === id);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(acao === 'remarcar');
  const [viewer, setViewer] = useState<number | null>(null);
  const donePhotos = useSignedUrls(order?.donePhotos ?? [], 'done-photos');
  const run = (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    action()
      .catch((e) => notify(authErrorMessage(e)))
      .finally(() => setBusy(false));
  };

  // Botão "Confirmar" do lembrete: confirma uma vez, assim que o serviço carrega.
  const autoConfirmed = useRef(acao !== 'confirmar');
  useEffect(() => {
    if (autoConfirmed.current || !order) return;
    autoConfirmed.current = true;
    confirmDay(order.id).catch((e) => notify(authErrorMessage(e)));
  }, [order, confirmDay]);

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
  // Do lado do cliente, nota e profissão vêm do catálogo; o outro lado (nome, foto) vem do pedido.
  const pro = isPro ? undefined : getProfessional(order.proId);
  const name = firstName(order.other.name);
  const done = order.status === 'concluido';
  const canceled = order.status === 'cancelado';

  const steps: TimelineStep[] = [
    { label: 'Pedido enviado', detail: isPro ? `${name} pediu um orçamento` : `Você pediu um orçamento a ${name}`, state: 'done' },
    { label: 'Proposta aceita', detail: `${formatBRL(order.amount)} combinados no chat`, state: 'done' },
    { label: 'Dia do serviço', detail: order.when, state: done ? 'done' : canceled ? 'todo' : 'current' },
    {
      label: canceled ? (order.canceledLate ? 'Cancelado em cima da hora' : 'Cancelado') : 'Concluído',
      detail: done ? 'Tudo resolvido' : canceled ? order.cancelReason : order.doneAt ? 'Aguardando a confirmação do cliente' : undefined,
      state: done ? 'done' : canceled ? 'current' : 'todo',
    },
  ];

  const stage = serviceStage(order, isPro, name);
  const photoUris = order.donePhotos.map((p) => donePhotos[p]);
  // Enquanto o serviço está só combinado (sem esperar resposta nem análise): Remarcar no cartão do topo, Cancelar discreto embaixo.
  const open = !done && !canceled && !order.doneAt && !order.disputed;
  const canReschedule = open && stage?.primary !== 'reschedule' && stage?.secondary !== 'reschedule' && !order.reschedule;
  const act = (a: ServiceAction) => {
    const id = order.id;
    if (a === 'done') return setDoneOpen(true);
    if (a === 'confirmDay') return run(() => confirmDay(id));
    if (a === 'reschedule') return setRescheduleOpen(true);
    if (a === 'confirm') return run(() => confirmDone(id, true));
    if (a === 'deny')
      return confirm(`O serviço não foi feito? ${name} será avisado e vocês poderão remarcar ou cancelar.`, () => run(() => confirmDone(id, false)), {
        confirmLabel: 'Confirmar',
      });
    if (a === 'acceptReschedule') return run(() => respondReschedule(id, true));
    if (a === 'declineReschedule' || a === 'withdrawReschedule') return run(() => respondReschedule(id, false));
    if (a === 'dispute')
      return confirm('Discordar? A equipe da Rezolveaê vai ler a conversa, ver as fotos e decidir.', () => run(() => disputeOrder(id)), { confirmLabel: 'Discordar' });
    if (a === 'askTeam')
      return confirm(`Pedir ajuda à equipe? Ela vai ler a conversa e pode concluir o serviço por ${name}.`, () => run(() => askTeam(id)), { confirmLabel: 'Pedir' });
  };

  const headline = canceled ? 'Serviço cancelado' : done ? 'Tudo resolvido' : `Combinado para ${order.when.toLowerCase()}`;

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
            {[service?.title, order.address.line].filter(Boolean).join(' · ')}
          </Text>
          {canReschedule ? (
            <Button variant="dark" size="md" iconLeft="calendar" style={styles.reschedule} onPress={() => setRescheduleOpen(true)}>
              Remarcar
            </Button>
          ) : null}
        </View>

        {stage ? <ServicePanel stage={stage} photoUris={photoUris} busy={busy} onAction={act} onOpenPhoto={setViewer} /> : null}

        <View style={styles.proCard}>
          <View style={styles.proTop}>
            <Avatar size={56} uri={order.other.avatarUrl} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.nameRow}>
                <Text variant="labelLg" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {order.other.name}
                </Text>
                {pro?.verified ? <Icon name="badge-check" size={18} fill={colors.brand} label="Verificado" /> : null}
              </View>
              {pro ? (
                <View style={styles.nameRow}>
                  {/* Sem avaliações ainda: "Novo" em vez de uma nota 0,0. */}
                  {pro.reviews ? (
                    <Rating value={pro.rating} size={13} />
                  ) : (
                    <Text variant="bodySm" style={{ fontFamily: fonts.bold }}>
                      Novo
                    </Text>
                  )}
                  {pro.role ? (
                    <Text variant="bodySm" color={colors.inkMuted} numberOfLines={1} style={{ flexShrink: 1 }}>
                      {`· ${pro.role}`}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text variant="bodySm" color={colors.inkMuted}>
                  Cliente
                </Text>
              )}
            </View>
          </View>
          <View style={styles.actions}>
            <ActionButton icon="message-circle" label="Mensagem" onPress={() => router.push({ pathname: '/chat/[id]', params: { id: order.conversationId } })} />
            <ActionButton icon="phone" label="Ligar" onPress={() => callOther(order.conversationId, name, !canceled)} />
            <ActionButton icon="share" label="Compartilhar" onPress={() => Share.share({ message: `${service?.title} com ${order.other.name} · ${order.when}` }).catch(() => {})} />
            <ActionButton icon="circle-help" label="Ajuda" onPress={() => router.push('/ajuda')} />
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
            <ListRow icon="map-pin" label="Onde" value={addressLine({ line: order.address.line, complement: order.address.complement ?? '', area: order.address.area }) || 'Não informado'} />
            <ListRow icon="banknote" label={isPro ? 'Valor combinado · pago direto a você' : 'Valor combinado · pago direto ao profissional'} value={formatBRL(order.amount)} />
          </View>
        </View>

        {done && isPro ? (
          <View style={[styles.block, styles.rate]}>
            <Text variant="titleSm">{order.rating ? 'Avaliação do cliente' : 'O cliente ainda não avaliou'}</Text>
            {order.rating ? (
              <View style={styles.stars} accessibilityLabel={`Nota do cliente: ${order.rating} de 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Icon key={n} name="star" size={32} fill={n <= (order.rating ?? 0) ? colors.star : 'none'} color={n <= (order.rating ?? 0) ? colors.star : colors.inkMuted} />
                ))}
              </View>
            ) : null}
            {order.comment ? (
              <Text variant="body" color={colors.inkBody} style={styles.quote}>
                {`“${order.comment}”`}
              </Text>
            ) : null}
          </View>
        ) : null}

        {done && !isPro ? (
          <View style={[styles.block, styles.rate]}>
            <Text variant="titleSm">{order.rating ? 'Obrigado pela avaliação' : `Como foi o serviço de ${name}?`}</Text>
            <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel={`Nota: ${order.rating ?? stars} de 5`}>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = n <= (order.rating ?? stars);
                return (
                  <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} estrelas`} disabled={!!order.rating} onPress={() => setStars(n)} hitSlop={6}>
                    <Icon name="star" size={36} fill={on ? colors.star : 'none'} color={on ? colors.star : colors.inkMuted} />
                  </Pressable>
                );
              })}
            </View>
            {order.rating && order.comment ? (
              <Text variant="body" color={colors.inkBody} style={styles.quote}>
                {`“${order.comment}”`}
              </Text>
            ) : null}
            {!order.rating ? (
              <>
                {stars ? (
                  <View style={{ alignSelf: 'stretch' }}>
                    <Field
                      label="Conte como foi (opcional)"
                      placeholder={`Ex.: ${name} chegou no horário e deixou tudo limpo`}
                      value={comment}
                      onChangeText={setComment}
                      multiline
                      maxLength={500}
                    />
                  </View>
                ) : null}
                <Button variant="dark" block disabled={!stars || busy} onPress={() => run(() => rateOrder(order.id, stars, comment))}>
                  Enviar avaliação
                </Button>
                {stars ? (
                  <Text variant="caption" color={colors.inkMuted} style={{ textAlign: 'center' }}>
                    A avaliação aparece no perfil do profissional, com seu primeiro nome.
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}

        {done && isPro ? (
          <View style={[styles.block, styles.rate]}>
            <Text variant="titleSm">{order.clientRating ? 'Avaliação enviada' : `Como foi atender ${name}?`}</Text>
            <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel={`Nota: ${order.clientRating ?? stars} de 5`}>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = n <= (order.clientRating ?? stars);
                return (
                  <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} estrelas`} disabled={!!order.clientRating} onPress={() => setStars(n)} hitSlop={6}>
                    <Icon name="star" size={36} fill={on ? colors.star : 'none'} color={on ? colors.star : colors.inkMuted} />
                  </Pressable>
                );
              })}
            </View>
            {!order.clientRating ? (
              <Button variant="dark" block disabled={!stars || busy} onPress={() => run(() => rateClient(order.id, stars))}>
                Enviar avaliação
              </Button>
            ) : null}
            <Text variant="caption" color={colors.inkMuted} style={{ textAlign: 'center' }}>
              {`${name} não vê a sua nota: só a média de todas, depois de 3 avaliações.`}
            </Text>
          </View>
        ) : null}

        {open ? (
          <View style={styles.links}>
            <Pressable
              accessibilityRole="button"
              hitSlop={12}
              onPress={() =>
                // Em cima da hora: tela própria, com motivo. No prazo: só confirma.
                cancelIsLate(order.schedule, { pro: isPro, contested: order.doneBlocked })
                  ? router.push({ pathname: '/pedido/cancelar', params: { id: order.id } })
                  : confirm(isPro ? 'Cancelar este serviço? Avise o cliente pelo chat.' : 'Cancelar este serviço? Avise o profissional pelo chat.', () => run(() => cancelOrder(order.id)), {
                      confirmLabel: 'Cancelar',
                      danger: true,
                    })
              }
            >
              <Text variant="label" color={colors.inkMuted} style={styles.cancel}>
                Cancelar serviço
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <DoneSheet
        visible={doneOpen}
        client={name}
        onClose={() => setDoneOpen(false)}
        onSubmit={(photos, onProgress) => markDone(order.id, photos, onProgress)}
      />
      <RescheduleSheet
        visible={rescheduleOpen}
        other={name}
        current={order.schedule}
        onClose={() => setRescheduleOpen(false)}
        onSubmit={(schedule) => requestReschedule(order.id, schedule)}
      />
      <PhotoViewer uris={photoUris.filter((u): u is string => !!u)} index={viewer} onClose={() => setViewer(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[5], paddingTop: spacing[2], gap: spacing[5], paddingBottom: spacing[8] },
  status: { padding: spacing[5], borderRadius: radius.xl, backgroundColor: colors.brand, gap: spacing[2] },
  proCard: { padding: spacing[4], borderRadius: radius.xl, backgroundColor: colors.surfaceMuted, gap: spacing[4] },
  proTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  block: { gap: spacing[3] },
  rate: { padding: spacing[4], borderRadius: radius.xl, backgroundColor: colors.brandTint, alignItems: 'center' },
  stars: { flexDirection: 'row', gap: spacing[2], paddingVertical: spacing[2] },
  quote: { textAlign: 'center', fontStyle: 'italic' },
  reschedule: { alignSelf: 'flex-start', marginTop: spacing[2] },
  links: { flexDirection: 'row', justifyContent: 'center' },
  cancel: { textDecorationLine: 'underline' },
});
