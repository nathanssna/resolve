import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, Text, TopBar } from '@/components';
import { LEGAL } from '@/content/legal';
import { colors, spacing } from '@/theme/tokens';

/** Termos de uso (/legal/termos) e Política de privacidade (/legal/privacidade). */
export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const content = doc === 'termos' || doc === 'privacidade' ? LEGAL[doc] : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title={content?.title ?? 'Documento'} />
      <ScrollView contentContainerStyle={styles.content}>
        {content ? (
          <>
            <Text variant="caption" color={colors.inkMuted}>
              {`Última atualização: ${content.updated}`}
            </Text>
            <Text variant="body" color={colors.inkBody}>
              {content.intro}
            </Text>
            {content.sections.map((s) => (
              <View key={s.title} style={{ gap: spacing[2] }}>
                <Text variant="titleSm" accessibilityRole="header">
                  {s.title}
                </Text>
                {s.body.map((p) => (
                  <Text key={p.slice(0, 40)} variant="body" color={colors.inkBody}>
                    {p}
                  </Text>
                ))}
              </View>
            ))}
          </>
        ) : (
          <EmptyState icon="file-text" title="Documento não encontrado" />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[5], paddingTop: spacing[2], gap: spacing[5], paddingBottom: spacing[8] },
});
