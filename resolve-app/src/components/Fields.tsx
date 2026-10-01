import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fonts, radius, shadows, spacing } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

const webNoOutline = { outlineStyle: 'none' } as object;

type FieldProps = Omit<TextInputProps, 'style'> & {
  icon?: IconName;
  /** Rótulo acima do campo. */
  label?: string;
  /** Botão "x" para limpar quando há texto. */
  onClear?: () => void;
};

/** Campo preenchido (cinza, sem borda). Ao focar ganha borda `focus`. */
export const Field = forwardRef<TextInput, FieldProps>(function Field({ icon, label, onClear, multiline, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  const hasValue = typeof rest.value === 'string' && rest.value.length > 0;
  return (
    <View style={{ gap: spacing[2] }}>
      {label ? (
        <Text variant="label" color={colors.ink}>
          {label}
        </Text>
      ) : null}
      <View style={[styles.box, multiline && styles.multi, focused && styles.focused]}>
        {icon ? <Icon name={icon} size={20} strokeWidth={2} color={colors.ink} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel={label ?? rest.placeholder}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, multiline && styles.inputMulti, webNoOutline]}
        />
        {onClear && hasValue ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Limpar" onPress={onClear} hitSlop={10} style={styles.clear}>
            <Icon name="x" size={14} strokeWidth={2.5} color={colors.surface} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

/** Campo de busca usado como botão (abre a tela de busca). Fica sobre o topo amarelo. */
export function SearchTrigger({
  placeholder = 'O que você precisa?',
  onPress,
  onPressWhen,
  whenLabel = 'Agora',
}: {
  placeholder?: string;
  onPress?: () => void;
  onPressWhen?: () => void;
  whenLabel?: string;
}) {
  return (
    <View style={styles.trigger}>
      <Pressable accessibilityRole="search" accessibilityLabel={placeholder} onPress={onPress} style={styles.triggerMain}>
        <Icon name="search" size={22} strokeWidth={2.25} />
        <Text variant="labelLg" style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>
          {placeholder}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Quando: ${whenLabel}`}
        onPress={onPressWhen ?? onPress}
        style={({ pressed }) => [styles.when, pressed && { opacity: 0.8 }]}
      >
        <Icon name="clock" size={16} strokeWidth={2.25} />
        <Text variant="label">{whenLabel}</Text>
        <Icon name="chevron-down" size={14} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  multi: { alignItems: 'flex-start', paddingVertical: spacing[3], minHeight: 104 },
  focused: { borderColor: colors.focus, backgroundColor: colors.surface },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.ink, paddingVertical: 0 },
  inputMulti: { minHeight: 76, lineHeight: 21 },
  clear: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.inkMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 60,
    paddingLeft: spacing[5],
    paddingRight: spacing[2],
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    boxShadow: shadows.float,
  },
  triggerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3], height: '100%' },
  when: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
});
