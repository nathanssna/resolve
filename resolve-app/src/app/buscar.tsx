import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CatalogFallback, EmptyState, Field, Icon, IconButton, goBack, SectionHeader, Text } from '@/components';
import { supabase } from '@/lib/supabase';
import { useCatalog } from '@/state/catalog';
import { colors, radius, spacing } from '@/theme/tokens';

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Buscar() {
  const { services, status, refresh, getService } = useCatalog();
  const [q, setQ] = useState('');
  const text = q.trim();
  const query = normalize(text);
  // Resposta da busca por frase no banco (search_services), para o texto `q`.
  const [found, setFound] = useState<{ q: string; ids: string[] } | null>(null);
  const [offline, setOffline] = useState(false);

  // Espera a pessoa parar de digitar (250 ms) antes de perguntar ao banco.
  useEffect(() => {
    if (!text) return;
    let alive = true;
    const t = setTimeout(() => {
      supabase.rpc('search_services', { p_query: text }).then(({ data, error }) => {
        if (!alive) return;
        setOffline(!!error);
        if (!error) setFound({ q: text, ids: data.map((r) => r.service_id) });
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [text]);

  // Busca local (texto contido): enquanto o banco não responde, sem internet
  // e no começo de palavra curta ("chu"), que a busca por frase não cobre.
  const local = useMemo(
    () => (query ? services.filter((s) => normalize([s.title, s.subtitle, s.area, ...s.examples, ...s.includes].join(' ')).includes(query)) : services),
    [query, services],
  );
  const remote = found && !offline ? found.ids.flatMap((id) => getService(id) ?? []) : [];
  const results = query && remote.length ? remote : local;
  // "Nada encontrado" só depois da resposta do banco (ou sem internet).
  const settled = offline || found?.q === text;

  const suggestions = services.flatMap((s) => s.examples.slice(0, 1).map((e) => ({ text: e, id: s.id })));
  const open = (id: string) => router.push({ pathname: '/servico/[id]', params: { id } });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <IconButton icon="arrow-left" label="Voltar" onPress={goBack} />
        <View style={{ flex: 1 }}>
          <Field icon="search" placeholder="Ex.: instalar um chuveiro" value={q} onChangeText={setQ} onClear={() => setQ('')} autoFocus returnKeyType="search" />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {status !== 'ready' ? <CatalogFallback status={status} onRetry={refresh} /> : null}
        {status === 'ready' && !query ? (
          <View style={{ gap: spacing[3] }}>
            <SectionHeader title="Buscas comuns" />
            <View style={styles.chips}>
              {suggestions.map((s) => (
                <Pressable key={s.text} accessibilityRole="button" onPress={() => open(s.id)} style={({ pressed }) => [styles.chip, pressed && { backgroundColor: colors.surfaceStrong }]}>
                  <Icon name="clock" size={14} color={colors.inkMuted} />
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
          {status === 'ready' && results.length === 0 && settled ? (
            <EmptyState icon="search" title="Nada encontrado" description="Conte de outro jeito, como “cano vazando” ou “montar guarda-roupa”." />
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
