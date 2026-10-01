import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, shadows, spacing } from '@/theme/tokens';

type Props = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> };

/** Superfície clicável dos cards: borda `line`, raio `md`, sombra `card`. */
export function Card({ style, children, ...rest }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing[3],
    boxShadow: shadows.card,
  },
  pressed: { transform: [{ scale: 0.99 }], opacity: 0.92 },
});
