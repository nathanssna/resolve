import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, CatalogFallback, EmptyState, FilterChip, Icon, ProfessionalOption, StickyFooter, Text, TopBar } from '@/components';
import { useCatalog, type Professional } from '@/state/catalog';
import { colors, radius, spacing } from '@/theme/tokens';
import { firstName, formatCount, formatExperience } from '@/utils/format';

// Sem 'Mais próximos' até o endereço do usuário ter coordenadas.
type Sort = 'recomendados' | 'avaliados' | 'rapidos';

const FILTERS: { id: Sort; label: string }[] = [
  { id: 'recomendados', label: 'Recomendados' },
  { id: 'avaliados', label: 'Mais bem avaliados' },
  { id: 'rapidos', label: 'Respondem rápido' },
];

/** Recomendação simples: nota, volume e rapidez. */
const score = (p: Professional) => p.rating * 20 + Math.min(p.jobs, 500) / 50 - p.replyMin / 5;

function sortList(list: Professional[], sort: Sort) {
  const copy = [...list];
  if (sort === 'recomendados') copy.sort((a, b) => score(b) - score(a));
  if (sort === 'avaliados') copy.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
  if (sort === 'rapidos') copy.sort((a, b) => a.replyMin - b.replyMin);
  return copy;
}

export default function Profissionais() {
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const { getService, getProfessionals, status, refresh } = useCatalog();
  const service = getService(serviceId);
  const all = useMemo(() => getProfessionals(serviceId), [getProfessionals, serviceId]);
  const [sort, setSort] = useState<Sort>('recomendados');
  const list = useMemo(() => sortList(all, sort), [all, sort]);
  const best = useMemo(() => sortList(all, 'recomendados')[0]?.id, [all]);
  const fastest = useMemo(() => sortList(all, 'rapidos')[0]?.id, [all]);
  // Começa no recomendado (também quando a lista chega depois de abrir a tela).
  const [picked, setSelected] = useState<string>();
  const selected = picked ?? best;
  const chosen = all.find((p) => p.id === selected);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Escolha um profissional" />
      <Text variant="bodySm" color={colors.inkMuted} style={styles.sub}>
        {service?.title} · {all.length === 1 ? '1 profissional' : `${all.length} profissionais`}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.filters}>
        {FILTERS.map((f) => (
          <FilterChip key={f.id} active={f.id === sort} onPress={() => setSort(f.id)}>
            {f.label}
          </FilterChip>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.note}>
          <Icon name="message-circle" size={18} />
          <Text variant="bodySm" color={colors.inkBody} style={{ flex: 1 }}>
            O valor é combinado direto com o profissional pelo chat. Pedir orçamento não tem custo.
          </Text>
        </View>

        {list.map((p) => (
          <ProfessionalOption
            key={p.id}
            name={p.name}
            avatarUrl={p.avatarUrl}
            rating={p.rating}
            reviews={p.reviews}
            meta={`${formatExperience(p.years)} · ${formatCount(p.jobs)} serviços`}
            aside={`~${p.replyMin} min`}
            asideLabel="para responder"
            badge={p.id === best ? 'RECOMENDADO' : p.id === fastest ? 'RESPONDE RÁPIDO' : undefined}
            selected={p.id === selected}
            onPress={() => setSelected(p.id)}
          />
        ))}

        {status !== 'ready' ? <CatalogFallback status={status} onRetry={refresh} /> : null}
        {status === 'ready' && list.length === 0 ? (
          <EmptyState icon="user-round" title="Ainda não há profissionais" description="Estamos chegando na sua região. Volte em breve." />
        ) : null}
      </ScrollView>

      {chosen ? (
        <StickyFooter>
          <Button
            variant="link"
            onPress={() => router.push({ pathname: '/profissional/[id]', params: { id: chosen.id, serviceId } })}
            style={{ alignSelf: 'center', marginBottom: spacing[2] }}
          >
            {`Ver perfil e avaliações de ${firstName(chosen.name)}`}
          </Button>
          <Button
            variant="primary"
            block
            iconLeft="message-circle"
            onPress={() => router.push({ pathname: '/pedido/novo', params: { serviceId, proId: chosen.id } })}
          >
            {`Pedir orçamento a ${firstName(chosen.name)}`}
          </Button>
        </StickyFooter>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  sub: { paddingHorizontal: spacing[5], marginTop: -spacing[2] },
  filters: { paddingHorizontal: spacing[5], paddingVertical: spacing[4], gap: spacing[2] },
  list: { paddingHorizontal: spacing[4], paddingBottom: spacing[6], gap: spacing[2] },
  note: {
    flexDirection: 'row',
    gap: spacing[3],
    alignItems: 'center',
    padding: spacing[3],
    marginHorizontal: spacing[1],
    marginBottom: spacing[2],
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
});
