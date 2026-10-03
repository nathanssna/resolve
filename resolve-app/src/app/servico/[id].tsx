import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, CatalogFallback, CheckItem, EmptyState, Icon, InfoBanner, Rating, SectionHeader, StickyFooter, Text, TopBar } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { useApp } from '@/state/app';
import { useCatalog } from '@/state/catalog';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { notify } from '@/utils/dialog';

const howItWorks = [
  { n: '1', title: 'Conte o que precisa', text: 'Descreva o problema e quando quer o serviço.' },
  { n: '2', title: 'Converse e receba propostas', text: 'O profissional responde pelo chat com valor e horário.' },
  { n: '3', title: 'Combine e pronto', text: 'Aceite a proposta e acompanhe tudo por aqui.' },
];

export default function ServicoDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getService, getProfessionals, status, refresh } = useCatalog();
  const service = getService(id);
  const { status: appStatus, isFavorite, toggleFavorite } = useApp();
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
  const pros = getProfessionals(service.id);

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing[6] }}>
        <View style={[styles.hero, { paddingTop: insets.top }]}>
          <TopBar
            floating
            actions={[
              { icon: 'heart', label: fav ? 'Remover dos favoritos' : 'Favoritar', filled: fav, onPress: () => favorite(service.id) },
              { icon: 'share', label: 'Compartilhar', onPress: () => Share.share({ message: `${service.title} no Resolve` }).catch(() => {}) },
            ]}
          />
          <View style={styles.heroBody}>
            <View style={styles.bigIcon}>
              <Icon name={service.icon} size={52} strokeWidth={2} duotone />
            </View>
            <Text variant="titleLg" accessibilityRole="header">
              {service.title}
            </Text>
            <View style={styles.heroMeta}>
              <Rating value={service.rating} count={service.reviews} suffix="avaliações" size={16} onBrand />
              <View style={styles.dotSep} />
              <Text variant="label">{service.area}</Text>
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
              <CheckItem key={item}>{item}</CheckItem>
            ))}
          </View>

          <View style={styles.how}>
            <Text variant="titleSm">Como funciona</Text>
            {howItWorks.map((s) => (
              <View key={s.n} style={styles.howRow}>
                <View style={styles.howN}>
                  <Text variant="labelLg">{s.n}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label">{s.title}</Text>
                  <Text variant="bodySm" color={colors.inkMuted}>
                    {s.text}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <InfoBanner title="Profissionais verificados" description="Documentos e avaliações conferidos." />
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
  how: { gap: spacing[4], padding: spacing[4], borderRadius: radius.xl, backgroundColor: colors.brandTint },
  howRow: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' },
  howN: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
});
