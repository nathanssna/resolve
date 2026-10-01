import { Pressable, StyleSheet, View } from 'react-native';

import { colors, fonts, radius, shadows } from '@/theme/tokens';
import { Icon } from './Icon';
import { Text } from './Text';

type Props = { label?: string; value: string; onPress?: () => void };

/** Bairro atual do usuário, no topo do Início. */
export function LocationPill({ label = 'Sua localização', value, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Trocar endereço`}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.8 }]}
    >
      <Icon name="map-pin" size={18} fill={colors.ink} color={colors.surface} strokeWidth={1.5} />
      <View>
        <Text variant="caption" color={colors.inkMuted} style={styles.label}>
          {label}
        </Text>
        <Text variant="caption" style={styles.value}>
          {value}
        </Text>
      </View>
      <Icon name="chevron-right" size={14} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    boxShadow: shadows.card,
  },
  label: { fontSize: 10, lineHeight: 12 },
  value: { fontSize: 12, lineHeight: 16, fontFamily: fonts.bold },
});
