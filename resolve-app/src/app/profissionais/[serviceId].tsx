import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, CatalogFallback, EmptyState, FilterChip, Icon, ProfessionalOption, StickyFooter, Text, TopBar } from '@/components';
import { useAddresses } from '@/state/addresses';
import { useApp } from '@/state/app';
import { useDistances, type Distance } from '@/state/distances';
import { useCatalog, type Professional } from '@/state/catalog';
import { colors, radius, spacing } from '@/theme/tokens';
import { firstName, formatCount, formatExperience } from '@/utils/format';

type Sort = 'recomendados' | 'proximos' | 'avaliados' | 'rapidos';

const FILTERS: { id: Sort; label: string }[] = [
  { id: 'recomendados', label: 'Recomendados' },
  // Só com o endereço do cliente localizado.
  { id: 'proximos', label: 'Mais próximos' },
  { id: 'avaliados', label: 'Mais bem avaliados' },
  { id: 'rapidos', label: 'Respondem rápido' },
];

/** Recomendação simples: nota, volume e rapidez. */
const score = (p: Professional) => p.rating * 20 + Math.min(p.jobs, 500) / 50 - p.replyMin / 5;

function sortList(list: Professional[], sort: Sort, dist?: Map<string, Distance> | null) {
  const copy = [...list];
  if (sort === 'recomendados') copy.sort((a, b) => score(b) - score(a));
  if (sort === 'proximos') copy.sort((a, b) => (dist?.get(a.id)?.km ?? 999) - (dist?.get(b.id)?.km ?? 999));
  if (sort === 'avaliados') copy.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
  if (sort === 'rapidos') copy.sort((a, b) => a.replyMin - b.replyMin);
  return copy;
}

export default function Profissionais() {
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const { getService, getProfessionals, status, refresh } = useCatalog();
  const service = getService(serviceId);
  const { blocked, status: appStatus } = useApp();
  const { primary } = useAddresses();
  // Distância até o endereço principal (quando o celular conseguiu localizá-lo).
  const dist = useDistances(primary?.coords);
  // Quem eu bloqueei não aparece; com distância, só quem atende o endereço (e, no fim, quem não informou a área).
  const everyone = useMemo(() => getProfessionals(serviceId).filter((p) => !blocked.includes(p.id)), [getProfessionals, serviceId, blocked]);
  const all = useMemo(() => (dist ? everyone.filter((p) => dist.get(p.id)?.inRange) : everyone), [everyone, dist]);
  const noArea = useMemo(() => (dist ? everyone.filter((p) => !dist.has(p.id)) : []), [everyone, dist]);
  const [picked, setSort] = useState<Sort>('recomendados');
  const sort = picked === 'proximos' && !dist ? 'recomendados' : picked;
  const list = useMemo(() => [...sortList(all, sort, dist), ...sortList(noArea, sort === 'proximos' ? 'recomendados' : sort)], [all, noArea, sort, dist]);
  const best = useMemo(() => sortList(all, 'recomendados')[0]?.id, [all]);
  const fastest = useMemo(() => sortList(all, 'rapidos')[0]?.id, [all]);
  // Começa no recomendado (também quando a lista chega depois de abrir a tela).
  const [pickedPro, setSelected] = useState<string>();
  const selected = pickedPro ?? best ?? list[0]?.id;
  const chosen = list.find((p) => p.id === selected);
  const where = primary?.area || 'seu endereço';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Escolha um profissional" />
      <Text variant="bodySm" color={colors.inkMuted} style={styles.sub}>
        {service?.title} ·{' '}
        {dist ? (all.length === 1 ? `1 atende ${where}` : `${all.length} atendem ${where}`) : all.length === 1 ? '1 profissional' : `${all.length} profissionais`}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.filters}>
        {FILTERS.filter((f) => f.id !== 'proximos' || dist).map((f) => (
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

        {appStatus !== 'idle' && !primary ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/enderecos')} style={styles.note}>
            <Icon name="map-pin" size={18} />
            <Text variant="bodySm" color={colors.inkBody} style={{ flex: 1 }}>
              Adicione seu endereço para ver quem atende perto de você.
            </Text>
            <Icon name="chevron-right" size={18} />
          </Pressable>
        ) : null}

        {dist && !all.length ? (
          <EmptyState icon="map-pin" title={`Ninguém atende ${where} ainda`} description={noArea.length ? 'Abaixo, quem ainda não informou onde atende.' : 'Estamos chegando na sua região. Volte em breve.'} />
        ) : null}

        {list.map((p, i) => (
          <View key={p.id} style={{ gap: spacing[2] }}>
            {dist && noArea.length > 0 && i === all.length ? (
              <Text variant="label" color={colors.inkMuted} style={{ marginTop: spacing[3], marginHorizontal: spacing[1] }}>
                Área não informada
              </Text>
            ) : null}
            <ProfessionalOption
              name={p.name}
              avatarUrl={p.avatarUrl}
              rating={p.rating}
              reviews={p.reviews}
              meta={[dist?.get(p.id) ? `${dist.get(p.id)!.km} km` : null, formatExperience(p.years), `${formatCount(p.jobs)} serviços`].filter(Boolean).join(' · ')}
              aside={`~${p.replyMin} min`}
              asideLabel="para responder"
              badge={p.id === best ? 'RECOMENDADO' : p.id === fastest ? 'RESPONDE RÁPIDO' : undefined}
              selected={p.id === selected}
              onPress={() => setSelected(p.id)}
            />
          </View>
        ))}

        {status !== 'ready' ? <CatalogFallback status={status} onRetry={refresh} /> : null}
        {status === 'ready' && list.length === 0 && !dist ? (
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
