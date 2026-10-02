import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/theme/tokens';
import { Text } from './Text';
import { goBack, IconButton } from './TopBar';
import { StickyFooter } from './Surfaces';

type Props = {
  title: string;
  subtitle?: ReactNode;
  /** Padrão: voltar na pilha. `false` esconde a seta. */
  onBack?: (() => void) | false;
  children: ReactNode;
  /** Ação principal, fixa no rodapé. */
  footer: ReactNode;
};

/** Telas de login: topo amarelo com título, corpo branco e botão no rodapé. */
export function AuthLayout({ title, subtitle, onBack, children, footer }: Props) {
  const insets = useSafeAreaInsets();
  const back = onBack === false ? null : onBack ?? goBack;

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={[styles.hero, { paddingTop: insets.top + spacing[3] }]}>
            {back ? <IconButton icon="arrow-left" label="Voltar" floating onPress={back} /> : <View style={{ height: 44 }} />}
            <View style={{ gap: spacing[2] }}>
              <Text variant="display" accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? (
                <Text variant="body" color={colors.onBrand}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.body}>{children}</View>
        </ScrollView>
        <StickyFooter>{footer}</StickyFooter>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[8],
    gap: spacing[5],
    borderBottomLeftRadius: radius.sheet,
    borderBottomRightRadius: radius.sheet,
  },
  body: { padding: spacing[5], paddingTop: spacing[6], gap: spacing[5] },
});
