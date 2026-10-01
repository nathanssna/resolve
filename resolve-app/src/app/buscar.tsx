import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, Field, Icon, IconButton, goBack, SectionHeader, Text } from '@/components';
import { services } from '@/data/catalog';
import { colors, radius, spacing } from '@/theme/tokens';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Buscar() {
  const [q, setQ] = useState('');
  const query = normalize(q.trim());

  const results = useMemo(() => {
    if (!query) return services;
    return services.filter((s) => normalize([s.title, s.subtitle, s.area, ...s.examples, ...s.includes].join(' ')).includes(query));
  }, [query]);

  const suggestions = services.flatMap((s) => s.examples.slice(0, 1).map((e) => ({ text: e, id: s.id })));
  const open = (id: string) => router.push({ pathname: '/servico/[id]', params: { id } });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <IconButton icon="arrow-left" label="Voltar" onPress={goBack} />
        <View style={{ flex: 1 }}>
          <Field icon="search" placeholder="Ex.: torneira pingando" value={q} onChangeText={setQ} onClear={() => setQ('')} autoFocus returnKeyType="search" />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!query ? (
          <View style={{ gap: spacing[3] }}>
            <SectionHeader title="Buscas comuns" />
            <View style={styles.chips}>
              {suggestions.map((s) => (
                <Pressable key={s.text} accessibilityRole="button" onPress={() => open(s.id)} style={({ pressed }) => [styles.chip, pressed && { backgroundColor: colors.surfaceStrong }]}>
                  <Icon name="clock" size={14} strokeWidth={2.25} color={colors.inkMuted} />
                  <Text variant="label">{s.text}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ gap: spacing[1] }}>
          <SectionHeader title={query ? 'Resultados' : 'Todos os serviços'} />
          {results.map((s) => (
            <Pressable key={s.id} accessibilityRole="button" onPress={() => open(s.id)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}>
              <View style={styles.rowIcon}>
                <Icon name={s.icon} size={24} duotone />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text variant="labelLg">{s.title}</Text>
                <Text variant="bodySm" color={colors.inkMuted} numberOfLines={1}>
                  {s.subtitle}
                </Text>
              </View>
              <Icon name="chevron-right" size={18} />
            </Pressable>
          ))}
          {results.length === 0 ? (
            <EmptyState icon="search" title="Nada encontrado" description="Tente outra palavra, como “vazamento” ou “montar”." />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  content: { padding: spacing[5], gap: spacing[6] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], paddingHorizontal: spacing[2], borderRadius: radius.md },
  rowIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
});
