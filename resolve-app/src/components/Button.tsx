import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { colors, radius, spacing, type } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type Variant = 'primary' | 'dark' | 'secondary' | 'link';

type Props = Omit<PressableProps, 'children'> & {
  /**
   * primary = amarelo (uma por tela) · dark = preto, para fundo amarelo ·
   * secondary = cinza preenchido · link = texto sublinhado
   */
  variant?: Variant;
  size?: 'lg' | 'md';
  /** Ocupa toda a largura disponível. */
  block?: boolean;
  iconLeft?: IconName;
  iconRight?: IconName;
  /** Texto à direita dentro do botão (ex.: preço). */
  trailing?: string;
  children: string;
};

const look: Record<Exclude<Variant, 'link'>, { bg: string; fg: string }> = {
  primary: { bg: colors.brand, fg: colors.onBrand },
  dark: { bg: colors.ink, fg: colors.onInk },
  secondary: { bg: colors.surfaceMuted, fg: colors.ink },
};

export function Button({ variant = 'primary', size = 'lg', block, iconLeft, iconRight, trailing, children, style, disabled, ...rest }: Props) {
  if (variant === 'link') {
    return (
      <Pressable accessibilityRole="button" hitSlop={12} disabled={disabled} {...rest} style={style}>
        <Text variant="labelLg" style={styles.link}>
          {children}
        </Text>
      </Pressable>
    );
  }

  const { bg, fg } = look[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      {...rest}
      style={(state) => [
        styles.base,
        size === 'md' && styles.md,
        { backgroundColor: bg },
        block && styles.block,
        trailing ? styles.split : null,
        state.pressed && styles.pressed,
        disabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      <View style={styles.row}>
        {iconLeft ? <Icon name={iconLeft} size={20} strokeWidth={2} color={fg} /> : null}
        <Text variant="labelLg" color={fg} style={size === 'lg' ? styles.lgText : undefined}>
          {children}
        </Text>
        {iconRight ? <Icon name={iconRight} size={20} strokeWidth={2} color={fg} /> : null}
      </View>
      {trailing ? (
        <Text variant="labelLg" color={fg} style={styles.lgText}>
          {trailing}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 56,
    paddingHorizontal: spacing[6],
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
  },
  md: { height: 44, paddingHorizontal: spacing[5] },
  block: { alignSelf: 'stretch' },
  split: { justifyContent: 'space-between' },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  lgText: { fontSize: 16 },
  link: { ...type.labelLg, fontSize: 14, textDecorationLine: 'underline', color: colors.ink },
});
