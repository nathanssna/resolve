import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type Props = { icon: IconName; label: string; active?: boolean; onPress?: () => void };

/** Atalho de categoria. Só uma ativa por vez. */
export function CategoryTile({ icon, label, active, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.box, active && styles.boxActive]}>
        <Icon name={icon} size={26} color={active ? colors.onBrand : colors.ink} />
      </View>
      <Text variant="caption" style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 68, alignItems: 'center', gap: spacing[2] },
  box: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { backgroundColor: colors.brand },
  label: { textAlign: 'center', lineHeight: 15 },
});
