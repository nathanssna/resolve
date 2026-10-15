import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme/tokens';
import { Card } from './Card';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type Props = {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
};

/** Linha da lista de serviços: ícone, título, subtítulo e chevron. */
export function ServiceCard({ icon, title, subtitle, onPress }: Props) {
  return (
    <Card onPress={onPress} accessibilityLabel={`${title}. ${subtitle ?? ''}`} style={styles.card}>
      <View style={styles.iconBox}>
        <Icon name={icon} size={26} duotone />
      </View>
      <View style={styles.body}>
        <Text variant="labelLg" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySm" color={colors.inkMuted} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-right" size={18} strokeWidth={2} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  iconBox: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
});
