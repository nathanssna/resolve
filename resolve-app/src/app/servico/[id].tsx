import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, CatalogFallback, CheckItem, EmptyState, Icon, Rating, SectionHeader, StickyFooter, Text, TopBar } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { useAddresses } from '@/state/addresses';
import { useApp } from '@/state/app';
import { useCatalog, type Professional } from '@/state/catalog';
import { useDistances } from '@/state/distances';
import { colors, fonts, radius, shadows, spacing } from '@/theme/tokens';
import { notify } from '@/utils/dialog';
import { formatDecimal } from '@/utils/format';
import { sortProfessionals } from '@/utils/rankProfessionals';

/** Linha de "Quem atende": toque abre o perfil. */
function ProRow({ pro, serviceId }: { pro: Professional; serviceId: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pro.name}${pro.verified ? ', verificado' : ''}, ${pro.reviews ? `nota ${formatDecimal(pro.rating)}` : 'novo na Rezolveaê'}, responde em cerca de ${pro.replyMin} minutos`}
      onPress={() => router.push({ pathname: '/profissional/[id]', params: { id: pro.id, serviceId } })}
      style={({ pressed }) => [styles.pro, pressed && { opacity: 0.7 }]}
    >
      <Avatar size={44} uri={pro.avatarUrl} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.proName}>
          <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
            {pro.name}
          </Text>
          {pro.verified ? <Icon name="badge-check" size={16} fill={colors.brand} /> : null}
        </View>
        <View style={styles.proName}>
          {/* Sem avaliações ainda: "Novo" em vez de uma nota 0,0. */}
          {pro.reviews ? <Rating value={pro.rating} count={pro.reviews} size={13} /> : <Text variant="bodySm" style={{ fontFamily: fonts.bold }}>Novo</Text>}
          <Text variant="bodySm" color={colors.inkMuted}>
            {`· responde em ~${pro.replyMin} min`}
          </Text>
        </View>
      </View>
      <Icon name="chevron-right" size={18} />
    </Pressable>
  );
}

export default function ServicoDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getService, getProfessionals, status, refresh } = useCatalog();
  const service = getService(id);
  const { status: appStatus, isFavorite, toggleFavorite, blocked } = useApp();
  const { primary } = useAddresses();
  const dist = useDistances(primary?.coords);
  // Mesmo critério da lista de profissionais: sem bloqueados; com distância, quem atende o endereço
  // (recomendados primeiro) e, no fim, quem não informou a área.
  const pros = useMemo(() => {
    const everyone = getProfessionals(id).filter((p) => !blocked.includes(p.id));
    if (!dist) return sortProfessionals(everyone, 'recomendados');
    return [
      ...sortProfessionals(everyone.filter((p) => dist.get(p.id)?.inRange), 'recomendados'),
      ...sortProfessionals(everyone.filter((p) => !dist.has(p.id)), 'recomendados'),
    ];
  }, [getProfessionals, id, blocked, dist]);
  // Favoritos ficam na conta: sem login, entra primeiro.
  const favorite = (sid: string) =>
    appStatus === 'idle' ? router.push('/entrar') : toggleFavorite(sid).catch((e) => notify(`Não foi possível salvar o favorito. ${authErrorMessage(e)}`));
  const insets = useSafeAreaInsets();

  if (!service) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <TopBar />
        <View style={{ padding: spacing[5] }}>
          {status === 'ready' ? <EmptyState icon="search" title="Serviço não encontrado" /> : <CatalogFallback status={status} onRetry={refresh} />}
        </View>
      </SafeAreaView>
    );
  }

  const fav = isFavorite(service.id);

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing[6] }}>
        <View style={[styles.hero, { paddingTop: insets.top }]}>
          <TopBar
            floating
            actions={[
              { icon: 'heart', label: fav ? 'Remover dos favoritos' : 'Favoritar', filled: fav, onPress: () => favorite(service.id) },
              { icon: 'share', label: 'Compartilhar', onPress: () => Share.share({ message: `${service.title} na Rezolveaê` }).catch(() => {}) },
            ]}
          />
          <View style={styles.heroBody}>
            <View style={styles.bigIcon}>
              <Icon name={service.icon} size={52} duotone />
            </View>
            <Text variant="titleLg" accessibilityRole="header">
              {service.title}
            </Text>
            <View style={styles.heroMeta}>
              <Text variant="label">{service.area}</Text>
              <View style={styles.dotSep} />
              <Text variant="label">
                {pros.length === 0 ? 'nenhum profissional ainda' : pros.length === 1 ? '1 profissional' : `${pros.length} profissionais`}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.sheet}>
          <Text variant="body" color={colors.inkBody}>
            {service.description}
          </Text>

          <View style={{ gap: 14 }}>
            <SectionHeader title="O que dá pra resolver" />
            {service.includes.map((item) => (
              <CheckItem key={item} tone="success">
                {item}
              </CheckItem>
            ))}
          </View>

          <View style={{ gap: spacing[2] }}>
            <SectionHeader title="Quem atende" />
            {pros.length ? (
              pros.slice(0, 3).map((p) => <ProRow key={p.id} pro={p} serviceId={service.id} />)
            ) : (
              <Text variant="bodySm" color={colors.inkMuted}>
                · nenhum ainda na sua região
              </Text>
            )}
          </View>
        </View>
      </ScrollView>

      <StickyFooter>
        <Button
          variant="primary"
          block
          iconRight="arrow-right"
          disabled={pros.length === 0}
          onPress={() => router.push({ pathname: '/profissionais/[serviceId]', params: { serviceId: service.id } })}
        >
          {pros.length ? `Ver ${pros.length} ${pros.length === 1 ? 'profissional' : 'profissionais'}` : 'Em breve na sua região'}
        </Button>
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { backgroundColor: colors.brand, paddingBottom: 56 },
  heroBody: { paddingHorizontal: spacing[5], paddingTop: spacing[2], gap: spacing[3] },
  bigIcon: {
    width: 96,
    height: 96,
    borderRadius: 30,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadows.float,
    marginBottom: spacing[1],
    transform: [{ rotate: '-4deg' }],
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' },
  dotSep: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.ink },
  sheet: {
    marginTop: -32,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: spacing[5],
    paddingTop: spacing[6],
    gap: spacing[6],
  },
  pro: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] },
  proName: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
});
