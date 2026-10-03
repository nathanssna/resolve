import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Badge, Button, CatalogFallback, Icon, Text } from '@/components';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { useApp, type Conversation, type Job, type Order } from '@/state/app';
import { useAuth } from '@/state/auth';
import { useCatalog } from '@/state/catalog';
import { colors, fonts, radius, shadows, spacing } from '@/theme/tokens';
import { firstName, formatBRL, formatCount, formatDecimal, timeAgo } from '@/utils/format';

/*
 * Painel do profissional, por urgência:
 *   Precisa de você  (amarelo; vermelho se o cliente quer "o quanto antes")
 *   Agenda           (verde: serviços combinados)
 *   Aguardando       (cinza: proposta enviada, a vez é do cliente)
 */

/** Agenda e Aguardando mostram no máximo isto; o resto fica em "Ver todos". */
const MAX = 3;

function SeeAll({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.seeAll, pressed && { opacity: 0.6 }]}>
      <Text variant="label" color={colors.inkBody}>
        {label}
      </Text>
      <Icon name="chevron-right" size={16} color={colors.inkBody} />
    </Pressable>
  );
}

const openChat = (id: string, proposta?: string) => router.push({ pathname: '/chat/[id]', params: proposta ? { id, proposta } : { id } });

/** Título da seção; vazia, mostra "nenhum" ao lado em vez de uma linha a mais. */
function SectionTitle({ title, empty }: { title: string; empty?: boolean }) {
  return (
    <View style={styles.sectionTitle}>
      <Text variant="titleSm" accessibilityRole="header" color={empty ? colors.inkMuted : colors.ink}>
        {title}
      </Text>
      {empty ? (
        <Text variant="bodySm" color={colors.inkMuted}>
          · nenhum
        </Text>
      ) : null}
    </View>
  );
}

/** Pedido novo: o profissional precisa responder. */
function NewRequestCard({ conv, job }: { conv: Conversation; job: Job }) {
  const { getService } = useCatalog();
  const urgent = job.request?.when === 'O quanto antes';
  const service = getService(job.serviceId)?.title ?? 'Pedido';
  const photos = job.request?.photos.length ?? 0;
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${urgent ? 'Urgente' : 'Pedido novo'}: ${service}, de ${conv.other.name}`} onPress={() => openChat(conv.id)} style={{ gap: spacing[2] }}>
        <View style={styles.cardHead}>
          <Badge tone={urgent ? 'danger' : 'brand'} icon={urgent ? 'zap' : 'clipboard-list'}>
            {urgent ? 'URGENTE' : 'PEDIDO NOVO'}
          </Badge>
          <Text variant="caption" color={colors.inkMuted}>
            {timeAgo(job.createdAt)}
          </Text>
        </View>
        <Text variant="labelLg">{service}</Text>
        {job.request ? (
          <Text variant="body" color={colors.inkBody} numberOfLines={2}>
            {job.request.description}
          </Text>
        ) : null}
        <View style={styles.meta}>
          <Icon name="calendar-clock" size={15} color={urgent ? colors.danger : colors.inkMuted} />
          <Text variant="caption" color={urgent ? colors.danger : colors.inkMuted} style={urgent ? styles.bold : undefined}>
            {job.request?.when ?? ''}
          </Text>
          {job.request?.address.area ? (
            <>
              <Icon name="map-pin" size={15} color={colors.inkMuted} />
              <Text variant="caption" color={colors.inkMuted}>
                {job.request.address.area}
              </Text>
            </>
          ) : null}
          {photos ? (
            <>
              <Icon name="image" size={15} color={colors.inkMuted} />
              <Text variant="caption" color={colors.inkMuted}>
                {photos === 1 ? '1 foto' : `${photos} fotos`}
              </Text>
            </>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.cardFoot}>
        <Text variant="bodySm" color={colors.inkBody} numberOfLines={1} style={{ flex: 1 }}>
          {conv.other.name}
        </Text>
        <Button variant="secondary" size="md" iconLeft="receipt" onPress={() => openChat(conv.id, job.id)}>
          Enviar proposta
        </Button>
      </View>
    </View>
  );
}

/** Mensagem do cliente sem resposta (fora de um pedido novo). */
function MessageCard({ conv }: { conv: Conversation }) {
  const { getService } = useCatalog();
  const last = [...conv.messages].reverse().find((m) => m.from === 'them');
  const preview = last?.kind === 'text' ? last.text : 'Nova atualização na conversa';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Mensagem de ${conv.other.name}: ${preview}`}
      onPress={() => openChat(conv.id)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardHead}>
        <Badge tone="ink" icon="message-circle">
          {conv.unread === 1 ? 'MENSAGEM NOVA' : `${conv.unread} MENSAGENS`}
        </Badge>
        <Text variant="caption" color={colors.inkMuted}>
          {last ? timeAgo(last.at) : ''}
        </Text>
      </View>
      <View style={styles.cardFoot}>
        <Avatar size={28} uri={conv.other.avatarUrl} />
        <View style={{ flex: 1 }}>
          <Text variant="label" numberOfLines={1}>
            {conv.other.name}
            <Text variant="caption" color={colors.inkMuted}>
              {conv.latestJob ? ` · ${getService(conv.latestJob.serviceId)?.short ?? ''}` : ''}
            </Text>
          </Text>
          <Text variant="bodySm" color={colors.inkBody} numberOfLines={1}>
            {`“${preview}”`}
          </Text>
        </View>
        <Icon name="chevron-right" size={18} />
      </View>
    </Pressable>
  );
}

/** Serviço combinado: o que fazer e quando. */
function AgendaCard({ order }: { order: Order }) {
  const { getService } = useCatalog();
  const service = getService(order.serviceId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Combinado: ${service?.title}, ${order.when}, com ${order.other.name}, ${formatBRL(order.amount)}`}
      onPress={() => router.push({ pathname: '/pedido/[id]', params: { id: order.id } })}
      style={({ pressed }) => [styles.card, styles.agenda, pressed && styles.pressed]}
    >
      <View style={styles.agendaIcon}>
        <Icon name={service?.icon ?? 'calendar-clock'} size={22} color={colors.success} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="labelLg" numberOfLines={1}>
          {order.when}
        </Text>
        <Text variant="bodySm" color={colors.inkBody} numberOfLines={1}>
          {service?.title} · {firstName(order.other.name)}
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
    <Pressable
      accessibilityRole="button"
      onPress={() => openChat(conv.id)}
      style={({ pressed }) => [styles.waiting, pressed && { backgroundColor: colors.surfaceStrong }]}
    >
      <Icon name="clock" size={18} color={colors.inkMuted} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="label" numberOfLines={1}>
          {getService(job.serviceId)?.title} · {firstName(conv.other.name)}
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

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

type Review = Database['public']['Functions']['get_professional_reviews']['Returns'][number];

/** Seu mês: serviços, valor e nota, com a última avaliação escrita. Sempre no fim da tela. */
function MonthCard({ orders, proId, rating, reviews }: { orders: Order[]; proId: string; rating: number; reviews: number }) {
  const { getService } = useCatalog();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const month = orders.filter((o) => o.status === 'concluido' && (o.completedAt ?? 0) >= start);
  const total = month.reduce((sum, o) => sum + o.amount, 0);

  // Última avaliação com comentário; busca de novo quando chega uma nova (o total muda).
  const key = `${proId}:${reviews}`;
  const [data, setData] = useState<{ key: string; review: Review | null } | null>(null);
  const review = data?.key === key ? data.review : null;
  useEffect(() => {
    let alive = true;
    supabase.rpc('get_professional_reviews', { p_professional_id: proId, p_limit: 1 }).then(({ data: rows }) => {
      // A função põe as avaliações com comentário primeiro.
      if (alive) setData({ key, review: rows?.[0]?.comment ? rows[0] : null });
    });
    return () => {
      alive = false;
    };
  }, [key, proId]);

  return (
    <View style={styles.monthCard}>
      <View style={styles.summary}>
        <View style={styles.summaryCell}>
          <Text variant="titleMd">{formatCount(month.length)}</Text>
          <Text variant="caption" color={colors.inkMuted}>
            {month.length === 1 ? 'serviço' : 'serviços'}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={[styles.summaryCell, { flex: 1.4 }]}>
          <Text variant="titleMd" numberOfLines={1} adjustsFontSizeToFit>
            {formatBRL(total)}
          </Text>
          <Text variant="caption" color={colors.inkMuted}>
            {`em ${MONTHS[now.getMonth()]}`}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryCell}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {reviews ? <Icon name="star" size={16} fill={colors.star} color={colors.star} strokeWidth={1} /> : null}
            <Text variant="titleMd">{reviews ? formatDecimal(rating) : '–'}</Text>
          </View>
          <Text variant="caption" color={colors.inkMuted}>
            nota
          </Text>
        </View>
      </View>
      {review ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Última avaliação, ${review.rating} estrelas: ${review.comment}`}
          onPress={() => router.push({ pathname: '/profissional/[id]', params: { id: proId } })}
          style={({ pressed }) => [styles.review, pressed && styles.pressed]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <View style={{ flexDirection: 'row', gap: 2 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Icon key={n} name="star" size={14} strokeWidth={1.5} fill={n <= review.rating ? colors.star : 'none'} color={n <= review.rating ? colors.star : colors.inkMuted} />
              ))}
            </View>
            <Text variant="caption" color={colors.inkMuted} numberOfLines={1} style={{ flex: 1 }}>
              {[review.client_first_name ?? 'Cliente', getService(review.service_id)?.short, timeAgo(Date.parse(review.created_at))].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Text variant="bodySm" color={colors.inkBody} numberOfLines={2}>
            {`“${review.comment}”`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Início do profissional. */
export function ProHome() {
  const insets = useSafeAreaInsets();
  const { profile, session } = useAuth();
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
  const agenda = orders.filter((o) => o.status === 'combinado').sort((a, b) => a.createdAt - b.createdAt);
  const [showWaiting, setShowWaiting] = useState(false);
  const needs = toAnswer.length + unread.length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const needsText = !needs
    ? 'Tudo respondido'
    : toAnswer.length && unread.length
      ? `${plural(toAnswer.length, 'pedido', 'pedidos')} e ${plural(unread.length, 'mensagem', 'mensagens')} esperando você`
      : toAnswer.length
        ? `${plural(toAnswer.length, 'pedido esperando', 'pedidos esperando')} resposta`
        : `${plural(unread.length, 'mensagem', 'mensagens')} sem resposta`;

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
              {`Olá, ${firstName(profile?.full_name || 'profissional')}!`}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Meu perfil" onPress={() => router.push('/perfil')}>
            <Avatar size={48} uri={profile?.avatar_url ?? undefined} />
          </Pressable>
        </View>
        {/* O único lugar que fala das pendências. Em dia: só um sinal calmo. */}
        {needs ? (
          <View style={styles.statusPill}>
            <Icon name="bell" size={16} strokeWidth={2.5} color={colors.brand} />
            <Text variant="label" color={colors.onInk}>
              {needsText}
            </Text>
          </View>
        ) : (
          <View style={styles.calm}>
            <Icon name="check" size={18} strokeWidth={2.5} />
            <Text variant="label">Tudo em dia</Text>
          </View>
        )}
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
            {/* Seções fixas, sempre na mesma ordem: só o conteúdo muda. */}
            <View style={styles.section}>
              <SectionTitle title="Para responder" empty={!needs} />
              {needs ? (
                <>
                  {toAnswer.map(({ conv, job }) => (
                    <NewRequestCard key={job.id} conv={conv} job={job} />
                  ))}
                  {unread.map((c) => (
                    <MessageCard key={c.id} conv={c} />
                  ))}
                </>
              ) : null}
            </View>

            <View style={styles.section}>
              <SectionTitle title="Próximos serviços" empty={!agenda.length} />
              {agenda.length ? (
                <>
                  {agenda.slice(0, MAX).map((o) => (
                    <AgendaCard key={o.id} order={o} />
                  ))}
                  {agenda.length > MAX ? <SeeAll label={`Ver todos (${agenda.length})`} onPress={() => router.push('/pedidos')} /> : null}
                </>
              ) : null}
            </View>

            <View style={styles.section}>
              <SectionTitle title="Em negociação" empty={!waiting.length} />
              {waiting.length ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showWaiting }}
                    onPress={() => setShowWaiting((v) => !v)}
                    style={({ pressed }) => [styles.waiting, pressed && { backgroundColor: colors.surfaceStrong }]}
                  >
                    <Icon name="clock" size={18} color={colors.inkMuted} />
                    <Text variant="label" style={{ flex: 1 }}>
                      {waiting.length === 1 ? '1 proposta aguardando o cliente' : `${waiting.length} propostas aguardando o cliente`}
                    </Text>
                    <Icon name={showWaiting ? 'chevron-down' : 'chevron-right'} size={18} color={colors.inkMuted} />
                  </Pressable>
                  {showWaiting ? (
                    <View style={{ gap: spacing[2] }}>
                      {waiting.map(({ conv, job }) => (
                        <WaitingRow key={job.id} conv={conv} job={job} />
                      ))}
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>

            {me ? (
              <View style={styles.section}>
                <SectionTitle title="Seu mês" />
                <MonthCard orders={orders} proId={me.id} rating={me.rating} reviews={me.reviews} />
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  hero: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[6],
    gap: spacing[4],
    borderBottomLeftRadius: radius.sheet,
    borderBottomRightRadius: radius.sheet,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  calm: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  monthCard: { borderRadius: radius.lg, backgroundColor: colors.surface, boxShadow: shadows.card, overflow: 'hidden' },
  summary: { flexDirection: 'row' },
  review: { gap: spacing[1], padding: spacing[4], borderTopWidth: 1, borderTopColor: colors.line },
  summaryCell: { flex: 1, paddingVertical: spacing[3], paddingHorizontal: spacing[4], gap: 2 },
  summaryDivider: { width: 1, backgroundColor: colors.line, marginVertical: spacing[3] },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', paddingVertical: spacing[1] },
  body: { paddingHorizontal: spacing[4], paddingTop: spacing[6], gap: spacing[6] },
  section: { gap: spacing[3] },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[1] },
  card: { padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.surface, boxShadow: shadows.card, gap: spacing[3] },
  pressed: { opacity: 0.92 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.line },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  bold: { fontFamily: fonts.bold },
  agenda: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  agendaIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.successTint, alignItems: 'center', justifyContent: 'center' },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  setup: { padding: spacing[4], borderRadius: radius.xl, backgroundColor: colors.brandTint, gap: spacing[2], alignItems: 'flex-start' },
});
