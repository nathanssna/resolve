import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Button, CatalogFallback, EmptyState, Icon, Rating, SectionHeader, StickyFooter, Tag, Text, TopBar } from '@/components';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/state/app';
import { useAuth } from '@/state/auth';
import { useCatalog } from '@/state/catalog';
import { colors, radius, spacing } from '@/theme/tokens';
import { firstName, formatCount, formatExperience } from '@/utils/format';

type Review = Database['public']['Functions']['get_professional_reviews']['Returns'][number];

/** "12/03/2026". */
const date = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

function Stars({ value }: { value: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessible accessibilityLabel={`${value} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={14} strokeWidth={1.5} fill={n <= value ? colors.star : 'none'} color={n <= value ? colors.star : colors.inkMuted} />
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
  const requestService = serviceId && pro.serviceIds.includes(serviceId) ? serviceId : pro.serviceIds[0];
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
            {pro.verified ? <Icon name="badge-check" size={22} strokeWidth={2.25} fill={colors.brand} label="Verificado" /> : null}
          </View>
          {pro.role ? (
            <Text variant="body" color={colors.inkMuted}>
              {pro.role}
            </Text>
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
            <Text variant="caption" color={colors.inkMuted}>
              {pro.reviews === 1 ? '1 avaliação' : pro.reviews ? `${formatCount(pro.reviews)} avaliações` : 'no Resolve'}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="titleSm">{formatCount(pro.jobs)}</Text>
            <Text variant="caption" color={colors.inkMuted}>
              {pro.jobs === 1 ? 'serviço feito' : 'serviços feitos'}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text variant="titleSm">~{pro.replyMin} min</Text>
            <Text variant="caption" color={colors.inkMuted}>
              para responder
            </Text>
          </View>
        </View>

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
            {pro.serviceIds.map((sid) => (
              <Tag key={sid}>{getService(sid)?.title ?? sid}</Tag>
            ))}
            {pro.tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </View>
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
              {`${firstName(pro.name)} ainda não recebeu avaliações no Resolve.`}
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
            iconLeft="message-circle"
            onPress={() => router.push({ pathname: '/pedido/novo', params: { serviceId: requestService, proId: pro.id } })}
          >
            {`Pedir orçamento a ${firstName(pro.name)}`}
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
  stat: { flex: 1, padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.surfaceMuted, gap: 2, alignItems: 'center' },
  block: { gap: spacing[3] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  review: { padding: spacing[4], borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, gap: spacing[2] },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
