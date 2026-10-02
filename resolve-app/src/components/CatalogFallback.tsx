import { ActivityIndicator, View } from 'react-native';

import { colors, spacing } from '@/theme/tokens';
import { Button } from './Button';
import { EmptyState } from './Info';
import { Text } from './Text';

/** No lugar do conteúdo enquanto o catálogo carrega pela primeira vez, ou se falhar. */
export function CatalogFallback({ status, onRetry }: { status: 'loading' | 'error'; onRetry: () => void }) {
  if (status === 'loading') {
    return (
      <View style={{ alignItems: 'center', gap: spacing[3], paddingVertical: spacing[8] }} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.ink} />
        <Text variant="bodySm" color={colors.inkMuted}>
          Carregando…
        </Text>
      </View>
    );
  }
  return (
    <View style={{ alignItems: 'center', gap: spacing[3] }}>
      <EmptyState icon="info" title="Não foi possível carregar" description="Confira sua internet e tente de novo." />
      <Button variant="secondary" size="md" onPress={onRetry}>
        Tentar de novo
      </Button>
    </View>
  );
}
