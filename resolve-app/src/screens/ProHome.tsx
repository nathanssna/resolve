import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Badge, Button, CatalogFallback, Icon, ProgressBar, SuspendedNotice, Text } from '@/components';
import { supabase } from '@/lib/supabase';
import { soonestFirst, useApp, type Conversation, type Job, type Order } from '@/state/app';
import { useAuth } from '@/state/auth';
import { useCatalog, type Professional } from '@/state/catalog';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import { confirm, notify } from '@/utils/dialog';
import { firstName, formatBRL, formatDay, timeAgo } from '@/utils/format';
import { serviceStage, type ServiceStage } from '@/utils/serviceStage';

/*
 * Painel do profissional: o que ele tem que fazer agora.
 *   Topo:            Recebendo pedidos (interruptor + onde e para quê ele aparece)
 *   Seu perfil:      só enquanto falta algo; mostra o próximo passo
 *   Para responder:  sempre; pedidos novos (urgentes primeiro) e mensagens, ou o bloco vazio
 *   Agenda:          serviços combinados, do mais próximo ao mais longe (só se houver)
 *   Aguardando:      uma linha: propostas e serviços esperando o cliente (só se houver)
 *   O mês:           uma linha que abre o histórico
 */

/** A agenda mostra no máximo isto; o resto fica em Pedidos. */
const MAX = 3;
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const openChat = (id: string, proposta?: string) => router.push({ pathname: '/chat/[id]', params: proposta ? { id, proposta } : { id } });

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.sectionTitle}>
      <Text variant="titleSm" accessibilityRole="header">
        {title}
      </Text>
      {count ? (
        <Text variant="label" color={colors.inkMuted}>
          {count}
        </Text>
      ) : null}
    </View>
  );
}

/** Linha cinza com ícone, texto e seta (negociação, mês). */
function LineRow({ icon, text, onPress, open }: { icon: 'clock' | 'calendar-clock'; text: string; onPress: () => void; open?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={open != null ? { expanded: open } : undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.box, styles.line, pressed && styles.pressed]}
    >
      <Icon name={icon} size={18} color={colors.inkMuted} />
      <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>
        {text}
      </Text>
      <Icon name={open ? 'chevron-down' : 'chevron-right'} size={16} color={colors.inkMuted} />
    </Pressable>
  );
}

/** Pedido novo: o profissional precisa responder. */
function NewRequestCard({ conv, job }: { conv: Conversation; job: Job }) {
  const { getService } = useCatalog();
  const urgent = job.request?.when === 'O quanto antes';
  const service = getService(job.serviceId)?.title ?? 'Pedido';
  const photos = job.request?.photos.length ?? 0;
  const meta = [job.request?.when, job.request?.address.area, photos ? (photos === 1 ? '1 foto' : `${photos} fotos`) : null].filter(Boolean).join(' · ');
  return (
    <View style={[styles.box, styles.req]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${urgent ? 'Urgente' : 'Pedido novo'}: ${service}, de ${conv.other.name}`} onPress={() => openChat(conv.id)} style={{ gap: spacing[1] }}>
        <View style={styles.rowBetween}>
          <Badge tone={urgent ? 'danger' : 'brand'}>{urgent ? 'URGENTE' : 'PEDIDO NOVO'}</Badge>
          <Text variant="caption" color={colors.inkMuted}>
            {timeAgo(job.createdAt)}
          </Text>
        </View>
        <Text variant="labelLg" style={{ marginTop: spacing[1] }}>
          {service}
        </Text>
        {job.request ? (
          <Text variant="bodySm" color={colors.inkBody} numberOfLines={2}>
            {job.request.description}
          </Text>
        ) : null}
        <Text variant="caption" color={urgent ? colors.danger : colors.inkMuted} style={urgent ? styles.bold : undefined}>
          {meta}
        </Text>
      </Pressable>
      <View style={styles.reqFoot}>
        <Text variant="bodySm" color={colors.inkBody} numberOfLines={1} style={{ flex: 1 }}>
          {conv.other.name}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => openChat(conv.id, job.id)} style={({ pressed }) => [styles.whitePill, pressed && styles.pressed]}>
          <Text variant="label">Enviar proposta</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Mensagem do cliente sem resposta (fora de um pedido novo). */
function MessageCard({ conv }: { conv: Conversation }) {
  const last = [...conv.messages].reverse().find((m) => m.from === 'them');
  const preview = last?.kind === 'text' ? last.text : 'Nova atualização na conversa';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Mensagem de ${conv.other.name}: ${preview}`}
      onPress={() => openChat(conv.id)}
      style={({ pressed }) => [styles.box, styles.msg, pressed && styles.pressed]}
    >
      <Avatar size={36} uri={conv.other.avatarUrl} />
      <View style={{ flex: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {conv.other.name}
        </Text>
        <Text variant="bodySm" color={colors.inkBody} numberOfLines={1}>
          {`“${preview}”`}
        </Text>
      </View>
      <View style={styles.count}>
        <Text variant="overline">
          {conv.unread}
        </Text>
      </View>
    </Pressable>
  );
}

/** Serviço combinado que pede resposta dele (dia do serviço, "não foi feito", nova data do cliente). */
function ServiceActionCard({ order, stage }: { order: Order; stage: ServiceStage }) {
  const { getService } = useCatalog();
  const sub = [getService(order.serviceId)?.short, firstName(order.other.name), order.when].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${stage.title}: ${sub}`}
      onPress={() => router.push({ pathname: '/pedido/[id]', params: { id: order.id } })}
      style={({ pressed }) => [styles.box, styles.agenda, pressed && styles.pressed]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="labelLg" numberOfLines={1}>
          {stage.title}
        </Text>
        <Text variant="bodySm" color={colors.inkMuted} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Icon name="chevron-right" size={16} color={colors.inkMuted} />
    </Pressable>
  );
}

/** Serviço esperando o cliente (confirmar se foi feito, responder à nova data). */
function WaitingOrderRow({ order, stage }: { order: Order; stage: ServiceStage }) {
  const { getService } = useCatalog();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/pedido/[id]', params: { id: order.id } })}
      style={({ pressed }) => [styles.box, styles.agenda, pressed && styles.pressed]}
    >
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {getService(order.serviceId)?.short} · {firstName(order.other.name)}
        </Text>
        <Text variant="caption" color={colors.inkMuted} numberOfLines={1}>
          {stage.title}
        </Text>
      </View>
      <Icon name="chevron-right" size={16} color={colors.inkMuted} />
    </Pressable>
  );
}

/** Serviço combinado: quando (em destaque), o quê, quem e onde, e o valor. */
function AgendaCard({ order }: { order: Order }) {
  const { getService } = useCatalog();
  const service = getService(order.serviceId);
  const sub = [service?.short, firstName(order.other.name), order.address.area].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${order.when}: ${sub}, ${formatBRL(order.amount)}`}
      onPress={() => router.push({ pathname: '/pedido/[id]', params: { id: order.id } })}
      style={({ pressed }) => [styles.box, styles.agenda, pressed && styles.pressed]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="labelLg" numberOfLines={1}>
          {order.when}
        </Text>
        <Text variant="bodySm" color={colors.inkMuted} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Text variant="labelLg">{formatBRL(order.amount)}</Text>
    </Pressable>
  );
}

/** Proposta enviada: a vez é do cliente. */
function WaitingRow({ conv, job }: { conv: Conversation; job: Job }) {
  const { getService } = useCatalog();
  const p = job.pending;
  return (
    <Pressable accessibilityRole="button" onPress={() => openChat(conv.id)} style={({ pressed }) => [styles.box, styles.agenda, pressed && styles.pressed]}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {getService(job.serviceId)?.short} · {firstName(conv.other.name)}
        </Text>
        <Text variant="caption" color={colors.inkMuted} numberOfLines={1}>
          {p ? `Proposta de ${formatBRL(p.amount)} · ${p.when}` : 'Proposta enviada'}
        </Text>
      </View>
      <Text variant="caption" color={colors.inkMuted}>
        {p ? timeAgo(p.at) : ''}
      </Text>
    </Pressable>
  );
}

/** Seu perfil: só enquanto falta algo. Mostra o próximo passo e o que vem depois. */
function ProfileSteps({ me }: { me: Professional }) {
  const { profile } = useAuth();
  const steps = [
    { done: me.serviceIds.length > 0 && !!me.role, next: 'Escolha seus serviços e profissão', short: 'serviços', onPress: () => router.push('/profissional/ficha') },
    { done: !!me.area, next: 'Diga onde você atende', short: 'área de atendimento', onPress: () => router.push('/profissional/ficha') },
    { done: !!profile?.avatar_url, next: 'Adicione uma foto', hint: 'mais confiança', short: 'foto', onPress: () => router.push('/perfil') },
    { done: !!me.bio, next: 'Escreva sua apresentação', hint: 'sua experiência', short: 'apresentação', onPress: () => router.push('/profissional/ficha') },
    { done: !!profile?.phone, next: 'Adicione seu telefone', hint: 'para o cliente ligar', short: 'telefone', onPress: () => router.push('/telefone') },
    { done: me.verified, next: 'Peça o selo Verificado', hint: 'documento e selfie', short: 'selo Verificado', onPress: () => router.push('/profissional/verificacao') },
  ];
  const todo = steps.filter((s) => !s.done);
  if (!todo.length) return null;
  const [next, ...later] = todo;
  const done = steps.length - todo.length;
  const laterText = later.map((s) => s.short).join(', ').replace(/, ([^,]*)$/, ' e $1');

  return (
    <View style={styles.section}>
      <View style={styles.sectionTitle}>
        <Text variant="titleSm" accessibilityRole="header">
          Seu perfil
        </Text>
        <Text variant="label" color={colors.inkMuted}>{`${done} de ${steps.length}`}</Text>
      </View>
      <View style={[styles.box, styles.steps]}>
        <ProgressBar value={done / steps.length} tone="brand" />
        <Pressable accessibilityRole="button" onPress={next.onPress} style={({ pressed }) => [styles.nextStep, pressed && styles.pressed]}>
          <Text variant="label" style={{ flex: 1 }}>
            {next.next}
          </Text>
          {next.hint ? (
            <Text variant="caption" color={colors.inkMuted}>
              {next.hint}
            </Text>
          ) : null}
          <Icon name="chevron-right" size={16} color={colors.inkMuted} />
        </Pressable>
        {later.length ? (
          <Text variant="caption" color={colors.inkMuted}>
            {`Depois: ${laterText}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Recebendo pedidos, no topo amarelo: interruptor e onde/para quê ele aparece. */
function Accepting({ me }: { me: Professional }) {
  const { refresh, getService } = useCatalog();
  // Valor que está sendo gravado (o catálogo só muda depois).
  const [saving, setSaving] = useState<boolean | null>(null);
  const paused = saving ?? me.paused;
  // Pausa que o profissional não desfaz: por cancelamentos em cima da hora ou suspensão da moderação.
  const [lock, setLock] = useState<{ paused: boolean; until: number | null; byTeam: boolean } | null>(null);
  const current = lock?.paused === me.paused ? lock : null;
  const until = current?.until ?? null;
  useEffect(() => {
    let alive = true;
    supabase.rpc('my_pause').then(({ data }) => {
      const r = data?.[0];
      // Suspensão sem prazo vem como "infinity".
      if (alive) setLock({ paused: me.paused, until: r ? (r.until === 'infinity' ? Infinity : Date.parse(r.until)) : null, byTeam: !!r?.suspended });
    });
    return () => {
      alive = false;
    };
  }, [me.paused]);

  const save = async (next: boolean) => {
    setSaving(next);
    const { error } = await supabase.from('professionals').update({ paused: next }).eq('id', me.id);
    if (error) notify('Não foi possível mudar agora. Tente de novo.');
    else await refresh({ silent: true });
    setSaving(null);
  };

  // "Encanador e Eletricista · até 10 km de Pituba".
  const names = me.serviceIds.map((id) => getService(id)?.short).filter((n): n is string => !!n);
  const services = names.length > 3 ? `${names.slice(0, 2).join(', ')} e mais ${names.length - 2}` : names.join(', ').replace(/, ([^,]*)$/, ' e $1');
  const where = me.area ? `até ${me.radiusKm} km de ${me.area.split(',')[0]}` : 'área de atendimento não informada';
  const detail = until
    ? current?.byTeam
      ? until === Infinity
        ? 'Conta suspensa pela equipe da Rezolveaê'
        : `Conta suspensa até ${formatDay(until)}`
      : `Pausado até ${formatDay(until)} por cancelamentos em cima da hora`
    : paused
      ? 'Você não aparece nas buscas. O que está combinado continua.'
      : `${services} · ${where}`;
  const on = !paused;
  const disabled = saving !== null || !!until;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel="Recebendo pedidos"
      accessibilityHint={detail}
      accessibilityState={{ checked: on, disabled }}
      aria-checked={on}
      disabled={disabled}
      onPress={() =>
        on ? confirm('Pausar os pedidos? Você some das buscas até voltar a receber. O que já está combinado continua.', () => save(true), { confirmLabel: 'Pausar' }) : save(false)
      }
      style={({ pressed }) => [styles.accepting, pressed && styles.pressed]}
    >
      <View style={{ flex: 1, gap: 1 }}>
        <View style={styles.acceptingTitle}>
          <View style={[styles.dot, { backgroundColor: on ? colors.success : colors.inkMuted }]} />
          <Text variant="label">{on ? 'Recebendo pedidos' : 'Pedidos pausados'}</Text>
        </View>
        <Text variant="caption" color={colors.inkBody}>
          {detail}
        </Text>
      </View>
      <View style={[styles.track, on && styles.trackOn, disabled && { opacity: 0.5 }]}>
        <View style={[styles.knob, on && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

/** Início do profissional. */
export function ProHome() {
  const insets = useSafeAreaInsets();
  const { profile, session, suspendedUntil } = useAuth();
  const { status, refresh, conversations, orders } = useApp();
  const { getProfessional, refreshing, refresh: refreshCatalog } = useCatalog();
  // Só aparece no catálogo quem tem nome e pelo menos um serviço.
  const me = getProfessional(session?.user.id);

  const jobs = conversations.flatMap((conv) => conv.jobs.map((job) => ({ conv, job })));
  // Urgentes primeiro; depois, quem espera há mais tempo.
  const toAnswer = jobs
    .filter(({ job }) => job.state === 'novo')
    .sort((a, b) => Number(b.job.request?.when === 'O quanto antes') - Number(a.job.request?.when === 'O quanto antes') || a.job.createdAt - b.job.createdAt);
  // Mensagens sem resposta só alertam com pedido em aberto ou serviço combinado ("Obrigado!" depois
  // de concluído não cobra nada; fica só o número na aba Mensagens). Pedido novo já tem o próprio cartão.
  const active = (j: Job) => j.state === 'proposta' || j.state === 'recusada' || j.state === 'combinado';
  const unread = conversations.filter((c) => c.unread > 0 && !c.jobs.some((j) => j.state === 'novo') && c.jobs.some(active));
  const waiting = jobs.filter(({ job }) => job.state === 'proposta');
  // Serviços combinados: a vez é dele (Para responder), do cliente (aguardando) ou de ninguém ainda (Agenda).
  const staged = orders
    .filter((o) => o.status === 'combinado')
    .sort(soonestFirst)
    .map((o) => ({ o, stage: serviceStage(o, true, firstName(o.other.name)) }));
  const serviceToAnswer = staged.filter((x) => x.stage?.tone === 'action');
  const serviceWaiting = staged.filter((x) => x.stage?.tone === 'wait');
  const agenda = staged.filter((x) => !x.stage).map((x) => x.o);
  const waitingCount = waiting.length + serviceWaiting.length;
  const [showWaiting, setShowWaiting] = useState(false);
  const needs = toAnswer.length + unread.length + serviceToAnswer.length;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const month = orders.filter((o) => o.status === 'concluido' && (o.completedAt ?? 0) >= monthStart);
  const monthText = `${MONTHS[now.getMonth()]} · ${
    month.length ? `${month.length} ${month.length === 1 ? 'serviço' : 'serviços'} · ${formatBRL(month.reduce((sum, o) => sum + o.amount, 0))}` : 'nenhum serviço ainda'
  }`;

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
      <View style={[styles.hero, { paddingTop: insets.top + spacing[4] }]}>
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text variant="display" accessibilityRole="header" numberOfLines={1}>
              {`Olá, ${firstName(profile?.full_name || 'profissional')}`}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Meu perfil" onPress={() => router.push('/perfil')}>
            <Avatar size={48} uri={profile?.avatar_url ?? undefined} />
          </Pressable>
        </View>
        {me ? <Accepting me={me} /> : null}
      </View>

      <View style={styles.body}>
        {suspendedUntil ? <SuspendedNotice until={suspendedUntil} /> : null}
        {me ? (
          <ProfileSteps me={me} />
        ) : (
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
        )}

        {status === 'loading' || status === 'error' ? <CatalogFallback status={status} onRetry={refresh} /> : null}

        {status === 'ready' ? (
          <>
            <View style={styles.section}>
              <SectionTitle title="Para responder" count={needs} />
              {needs ? (
                <>
                  {serviceToAnswer.map(({ o, stage }) => (
                    <ServiceActionCard key={o.id} order={o} stage={stage!} />
                  ))}
                  {toAnswer.map(({ conv, job }) => (
                    <NewRequestCard key={job.id} conv={conv} job={job} />
                  ))}
                  {unread.map((c) => (
                    <MessageCard key={c.id} conv={c} />
                  ))}
                </>
              ) : (
                <View style={[styles.box, styles.empty]}>
                  <View style={styles.emptyIcon}>
                    <Icon name="bell" size={22} />
                  </View>
                  <Text variant="labelLg">Nenhum pedido no momento</Text>
                  <Text variant="bodySm" color={colors.inkMuted} style={{ textAlign: 'center' }}>
                    {me?.paused
                      ? 'Seus pedidos estão pausados. Ligue “Recebendo pedidos” para voltar a aparecer nas buscas.'
                      : 'Quando um cliente da sua região pedir orçamento, você recebe uma notificação e ele aparece aqui.'}
                  </Text>
                </View>
              )}
            </View>

            {agenda.length ? (
              <View style={styles.section}>
                <SectionTitle title="Agenda" />
                {agenda.slice(0, MAX).map((o) => (
                  <AgendaCard key={o.id} order={o} />
                ))}
                {agenda.length > MAX ? (
                  <Pressable accessibilityRole="button" onPress={() => router.push('/pedidos')} hitSlop={6} style={({ pressed }) => [styles.seeAll, pressed && { opacity: 0.6 }]}>
                    <Text variant="label" color={colors.inkBody}>{`Ver todos (${agenda.length})`}</Text>
                    <Icon name="chevron-right" size={16} color={colors.inkBody} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {waitingCount ? (
              <View style={{ gap: spacing[2] }}>
                <LineRow
                  icon="clock"
                  text={
                    serviceWaiting.length
                      ? `${waitingCount} aguardando o cliente`
                      : waiting.length === 1
                        ? '1 proposta aguardando o cliente'
                        : `${waiting.length} propostas aguardando o cliente`
                  }
                  open={showWaiting}
                  onPress={() => setShowWaiting((v) => !v)}
                />
                {showWaiting ? (
                  <>
                    {serviceWaiting.map(({ o, stage }) => (
                      <WaitingOrderRow key={o.id} order={o} stage={stage!} />
                    ))}
                    {waiting.map(({ conv, job }) => (
                      <WaitingRow key={job.id} conv={conv} job={job} />
                    ))}
                  </>
                ) : null}
              </View>
            ) : null}

            <LineRow icon="calendar-clock" text={monthText} onPress={() => router.push({ pathname: '/pedidos', params: { aba: 'historico' } })} />
          </>
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
    paddingBottom: spacing[5],
    gap: spacing[4],
    borderBottomLeftRadius: radius.sheet,
    borderBottomRightRadius: radius.sheet,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  accepting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  acceptingTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  track: { width: 44, height: 26, borderRadius: radius.pill, backgroundColor: colors.surfaceStrong, padding: 3, justifyContent: 'center' },
  trackOn: { backgroundColor: colors.ink },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surface },
  // Igual ao interruptor do resto do app (Notificações): trilho preto, bolinha branca.
  knobOn: { alignSelf: 'flex-end' },
  body: { paddingHorizontal: spacing[4], paddingTop: spacing[5], gap: spacing[6] },
  section: { gap: spacing[3] },
  sectionTitle: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: spacing[1] },
  // Blocos cinza, sem sombra, como no Início do cliente.
  box: { borderRadius: radius.lg, backgroundColor: colors.surfaceMuted },
  pressed: { opacity: 0.85 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bold: { fontFamily: fonts.bold },
  req: { padding: spacing[4], gap: spacing[3] },
  reqFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.line },
  whitePill: { paddingVertical: spacing[2], paddingHorizontal: spacing[4], borderRadius: radius.pill, backgroundColor: colors.surface },
  msg: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingHorizontal: spacing[4] },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  agenda: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingHorizontal: spacing[4] },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], paddingHorizontal: spacing[4] },
  empty: { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[5], paddingHorizontal: spacing[5] },
  emptyIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[1] },
  steps: { padding: spacing[4], gap: spacing[3] },
  nextStep: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[3], paddingHorizontal: spacing[3], borderRadius: radius.md, backgroundColor: colors.surface },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', paddingVertical: spacing[1] },
  setup: { padding: spacing[4], borderRadius: radius.xl, backgroundColor: colors.brandTint, gap: spacing[2], alignItems: 'flex-start' },
});
