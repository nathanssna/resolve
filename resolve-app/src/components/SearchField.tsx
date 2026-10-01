import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fonts, radius, spacing } from '@/theme/tokens';
import { Icon } from './Icon';

type Props = Omit<TextInputProps, 'style'>;

export function SearchField({ placeholder = 'O que você precisa resolver hoje?', ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.box, focused && styles.focused]}>
      <Icon name="search" size={20} strokeWidth={2} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={colors.inkMuted}
        accessibilityLabel={placeholder}
        returnKeyType="search"
        autoCorrect={false}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  focused: { borderColor: colors.focus },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.ink, paddingVertical: 0, outlineStyle: 'none' } as never,
});
