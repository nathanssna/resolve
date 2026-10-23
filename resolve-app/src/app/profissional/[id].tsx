import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Button, GoldBadge, CatalogFallback, EmptyState, Icon, Rating, SectionHeader, StickyFooter, Tag, Text, TopBar } from '@/components';
import type { Database } from '@/lib/database.types';
import { GENERIC_PLACE } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/state/app';
import { useAuth } from '@/state/auth';
import { useCatalog } from '@/state/catalog';
import { colors, radius, spacing } from '@/theme/tokens';
import { firstName, formatCount, formatExperience } from '@/utils/format';

type Review = Database['public']['Functions']['get_professional_reviews']['Returns'][number];

/** Taxa alta de cancelamento em cima da hora (90 dias): pelo menos 2, e 10% dos serviços. */
const LATE_MIN = 2;
const LATE_RATE = 0.1;

/** "12/03/2026". */
const date = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

function Stars({ value }: { value: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessible accessibilityLabel={`${value} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={14} fill={n <= value ? colors.star : 'none'} color={n <= value ? colors.star : colors.inkMuted} />
      ))}
    </View>
  );
}

/** Perfil público do profissional: ficha, serviços e avaliações. `serviceId` = de onde o cliente veio. */
export default function PerfilProfissional() {
  const { id, serviceId } = useLocalSearchParams<{ id: string; serviceId?: string }>();
  const { getProfessional, getService, status, refresh } = useCatalog();
  const { session } = useAuth();
  const { role, blocked } = useApp();
  const pro = getProfessional(id);
  const [reviews, setReviews] = useState<{ id: string; list: Review[] | null } | null>(null);
  const list = reviews?.id === id ? reviews.list : undefined;

  useEffect(() => {
    if (!id) return;
    let alive = true;
    supabase.rpc('get_professional_reviews', { p_professional_id: id }).then(({ data, error }) => {
      if (alive) setReviews({ id, list: error ? null : data });
    });
    return () => {
      alive = false;
    };
  }, [id]);

  // Cancelamentos em cima da hora nos últimos 90 dias: só aparece quando a taxa é alta.
  const [reliability, setReliability] = useState<{ id: string; orders: number; late: number } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    supabase.rpc('professional_reliability', { p_professional_id: id }).then(({ data }) => {
      const r = data?.[0];
      if (alive && r) setReliability({ id, orders: r.orders_90d, late: r.late_cancels_90d });
    });
    return () => {
      alive = false;
    };
  }, [id]);
  const lateRate = reliability?.id === id && reliability.late >= LATE_MIN && reliability.late / Math.max(reliability.orders, 1) >= LATE_RATE ? reliability : null;

  if (!pro) {
    return (
      <SafeAreaView style={styles.safe}>
        <TopBar title="Profissional" />
        <View style={{ padding: spacing[5] }}>
          {status === 'ready' ? <EmptyState icon="user-round" title="Profissional não encontrado" /> : <CatalogFallback status={status} onRetry={refresh} />}
        </View>
      </SafeAreaView>
    );
  }

  const isMe = session?.user.id === pro.id;
  // Pedir orçamento: no serviço de onde o cliente veio (se ele faz), senão no primeiro.
  const requestService = serviceId && pro.approvedIds.includes(serviceId) ? serviceId : pro.approvedIds[0];
  const written = list?.filter((r) => r.comment) ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title={isMe ? 'Como os clientes veem você' : undefined} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <Avatar size={88} uri={pro.avatarUrl} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="titleLg" accessibilityRole="header" style={{ flexShrink: 1, textAlign: 'center' }}>
              {pro.name}
            </Text>
            {pro.verified ? <Icon name="badge-check" size={22} fill={colors.brand} label="Verificado" /> : null}
          </View>
          {pro.gold ? <GoldBadge /> : null}
          {pro.role ? (
            <Text variant="body" color={colors.inkMuted}>
              {pro.role}
            </Text>
          ) : null}
          {pro.area && pro.area !== GENERIC_PLACE ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="map-pin" size={14} color={colors.inkMuted} />
              <Text variant="bodySm" color={colors.inkMuted}>
                {`Atende ${pro.area.split(',')[0]} e até ${pro.radiusKm} km`}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            {pro.reviews ? (
              <Rating value={pro.rating} size={18} />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="sparkles" size={16} />
                <Text variant="label">Novo</Text>
              </View>
            )}
            <Text variant="caption" color={colors.inkMuted} style={styles.statLabel}>
              {pro.reviews === 1 ? '1 avaliação' : pro.reviews ? `${formatCount(pro.reviews)} avaliações` : 'na Rezolveaê'}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="titleSm">{formatCount(pro.jobs)}</Text>
            <Text variant="caption" color={colors.inkMuted} style={styles.statLabel}>
              {pro.jobs === 1 ? 'serviço feito' : 'serviços feitos'}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="titleSm">~{pro.replyMin} min</Text>
            <Text variant="caption" color={colors.inkMuted} style={styles.statLabel}>
              para responder
            </Text>
          </View>
        </View>

        {lateRate ? (
          <View style={styles.lateRate}>
            <Icon name="info" size={18} color={colors.danger} />
            <Text variant="bodySm" color={colors.inkBody} style={{ flex: 1 }}>
              {`Cancelou ${lateRate.late} de ${lateRate.orders} serviços em cima da hora nos últimos 90 dias.`}
            </Text>
          </View>
        ) : null}

        {pro.bio ? (
          <View style={styles.block}>
            <SectionHeader title="Sobre" />
            <Text variant="body" color={colors.inkBody}>
              {pro.bio}
            </Text>
            {pro.years ? (
              <Text variant="bodySm" color={colors.inkMuted}>
                {formatExperience(pro.years)}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.block}>
          <SectionHeader title="Serviços" />
          <View style={styles.tags}>
            {/* Só as áreas aprovadas: é o que o cliente vê (as outras ainda não aparecem). O escudo diferencia das palavras que o profissional escreveu. */}
            {pro.approvedIds.map((sid) => (
              <Tag key={sid} icon="shield-check">
                {getService(sid)?.title ?? sid}
              </Tag>
            ))}
            {pro.tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </View>
          {pro.approvedIds.length ? (
            <View style={styles.approvedNote}>
              <Icon name="shield-check" size={14} color={colors.inkMuted} />
              <Text variant="caption" color={colors.inkMuted} style={{ flex: 1 }}>
                Aprovado no teste de conhecimento da Rezolveaê
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.block}>
          <SectionHeader title="Avaliações" />
          {list === undefined ? (
            <ActivityIndicator color={colors.ink} style={{ alignSelf: 'flex-start' }} />
          ) : list === null ? (
            <Text variant="bodySm" color={colors.inkMuted}>
              Não foi possível carregar as avaliações.
            </Text>
          ) : list.length === 0 ? (
            <Text variant="bodySm" color={colors.inkMuted}>
              {`${firstName(pro.name)} ainda não recebeu avaliações na Rezolveaê.`}
            </Text>
          ) : (
            <>
              {written.map((r) => (
                <View key={r.id} style={styles.review}>
                  <View style={styles.reviewHead}>
                    <Stars value={r.rating} />
                    <Text variant="caption" color={colors.inkMuted}>
                      {date(r.created_at)}
                    </Text>
                  </View>
                  <Text variant="body" color={colors.inkBody}>
                    {r.comment}
                  </Text>
                  <Text variant="caption" color={colors.inkMuted}>
                    {[r.client_first_name ?? 'Cliente', getService(r.service_id)?.title].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              ))}
              {list.length > written.length ? (
                <Text variant="bodySm" color={colors.inkMuted}>
                  {written.length
                    ? `Mais ${list.length - written.length} ${list.length - written.length === 1 ? 'avaliação' : 'avaliações'} só com nota.`
                    : `${list.length === 1 ? '1 avaliação' : `${list.length} avaliações`} só com nota, sem comentário.`}
                </Text>
              ) : null}
            </>
          )}
        </View>

        {session && !isMe ? (
          <Button
            variant="link"
            onPress={() => router.push({ pathname: '/denunciar', params: { userId: pro.id, name: pro.name } })}
            style={{ alignSelf: 'center' }}
          >
            Denunciar este perfil
          </Button>
        ) : null}
      </ScrollView>

      {!isMe && role !== 'profissional' && requestService && !blocked.includes(pro.id) ? (
        <StickyFooter>
          <Button
            variant="primary"
            block
            iconLeft={pro.paused ? 'clock' : 'message-circle'}
            disabled={pro.paused}
            onPress={() => router.push({ pathname: '/pedido/novo', params: { serviceId: requestService, proId: pro.id } })}
          >
            {pro.paused ? 'Não está recebendo pedidos agora' : `Pedir orçamento a ${firstName(pro.name)}`}
          </Button>
        </StickyFooter>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[5], paddingTop: spacing[2], gap: spacing[6], paddingBottom: spacing[8] },
  head: { alignItems: 'center', gap: spacing[2] },
  stats: { flexDirection: 'row', gap: spacing[2] },
  statLabel: { textAlign: 'center' },
  stat: { flex: 1, padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.surfaceMuted, gap: 2, alignItems: 'center' },
  lateRate: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.dangerTint },
  block: { gap: spacing[3] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  approvedNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -spacing[1] },
  review: { padding: spacing[4], borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, gap: spacing[2] },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
