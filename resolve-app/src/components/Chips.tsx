import { Pressable, StyleSheet, View } from 'react-native';

import { colors, fonts, radius, spacing } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type ChipProps = { active?: boolean; onPress?: () => void; children: string };

/** Chip de filtro de escolha única — exatamente um ativo. */
export function FilterChip({ active, onPress, children }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      aria-selected={!!active}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.85 }]}
    >
      <Text variant="caption" color={active ? colors.onBrand : colors.ink} style={[styles.chipText, active && { fontFamily: fonts.bold }]}>
        {children}
      </Text>
    </Pressable>
  );
}

/** Etiqueta de especialidade (não clicável). `icon` vai antes do texto. */
export function Tag({ children, icon }: { children: string; icon?: IconName }) {
  return (
    <View style={styles.tag}>
      {icon ? <Icon name={icon} size={14} /> : null}
      <Text variant="caption">{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 38,
    paddingHorizontal: spacing[4],
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.brand },
  chipText: { fontSize: 13 },
  tag: {
    height: 26,
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
});
