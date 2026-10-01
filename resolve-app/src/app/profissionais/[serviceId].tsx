import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, EmptyState, FilterChip, Icon, ProfessionalOption, StickyFooter, Text, TopBar } from '@/components';
import { getProfessionals, getService, type Professional } from '@/data/catalog';
import { colors, radius, spacing } from '@/theme/tokens';
import { firstName, formatCount, formatDecimal } from '@/utils/format';

type Sort = 'recomendados' | 'avaliados' | 'proximos' | 'rapidos';

const FILTERS: { id: Sort; label: string }[] = [
  { id: 'recomendados', label: 'Recomendados' },
  { id: 'avaliados', label: 'Mais bem avaliados' },
  { id: 'proximos', label: 'Mais próximos' },
  { id: 'rapidos', label: 'Respondem rápido' },
];

/** Recomendação simples: nota, volume e rapidez. */
const score = (p: Professional) => p.rating * 20 + Math.min(p.jobs, 500) / 50 - p.replyMin / 5 - p.distanceKm;

function sortList(list: Professional[], sort: Sort) {
  const copy = [...list];
  if (sort === 'recomendados') copy.sort((a, b) => score(b) - score(a));
  if (sort === 'avaliados') copy.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
  if (sort === 'proximos') copy.sort((a, b) => a.distanceKm - b.distanceKm);
  if (sort === 'rapidos') copy.sort((a, b) => a.replyMin - b.replyMin);
  return copy;
}

export default function Profissionais() {
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const service = getService(serviceId);
  const all = getProfessionals(serviceId);
  const [sort, setSort] = useState<Sort>('recomendados');
  const list = useMemo(() => sortList(all, sort), [all, sort]);
  const [selected, setSelected] = useState<string | undefined>(() => sortList(all, 'recomendados')[0]?.id);
  const chosen = all.find((p) => p.id === selected);

  const best = sortList(all, 'recomendados')[0]?.id;
  const fastest = sortList(all, 'rapidos')[0]?.id;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Escolha um profissional" />
      <Text variant="bodySm" color={colors.inkMuted} style={styles.sub}>
        {service?.title} · {all.length} perto de você
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
            rating={p.rating}
            reviews={p.reviews}
            meta={`${formatDecimal(p.distanceKm)} km · ${formatCount(p.jobs)} serviços`}
            aside={`~${p.replyMin} min`}
            asideLabel="para responder"
            badge={p.id === best ? 'RECOMENDADO' : p.id === fastest ? 'RESPONDE RÁPIDO' : undefined}
            selected={p.id === selected}
            onPress={() => setSelected(p.id)}
          />
        ))}

        {list.length === 0 ? (
          <EmptyState icon="user-round" title="Ainda não há profissionais" description="Estamos chegando na sua região. Volte em breve." />
        ) : null}
      </ScrollView>

      {chosen ? (
        <StickyFooter>
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
