import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type TopBarAction = { icon: IconName; label: string; onPress?: () => void; filled?: boolean };

type Props = {
  title?: string;
  /** Padrão: voltar na pilha. `false` esconde a seta. */
  onBack?: (() => void) | false;
  actions?: TopBarAction[];
  /** Botões em círculo branco com sombra — para usar sobre o topo amarelo. */
  floating?: boolean;
};

export function IconButton({ icon, label, onPress, filled, floating }: TopBarAction & { floating?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={filled != null ? { selected: filled } : undefined}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconBtn,
        floating && styles.iconBtnFloating,
        pressed && { backgroundColor: floating ? colors.surfaceMuted : colors.surfaceMuted },
      ]}
    >
      <Icon name={icon} size={22} strokeWidth={2.25} fill={filled ? colors.brand : 'none'} />
    </Pressable>
  );
}

export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/inicio');
}

/** Barra superior das telas internas. */
export function TopBar({ title, onBack, actions = [], floating }: Props) {
  const back = onBack === false ? null : onBack ?? goBack;
  return (
    <View style={styles.bar}>
      {back ? <IconButton icon="arrow-left" label="Voltar" onPress={back} floating={floating} /> : null}
      {title ? (
        <Text variant="titleMd" accessibilityRole="header" style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <View style={styles.actions}>
        {actions.map((a) => (
          <IconButton key={a.icon} {...a} floating={floating} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 60, flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[4] },
  title: { flex: 1, paddingLeft: spacing[1] },
  actions: { flexDirection: 'row', gap: spacing[2] },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  iconBtnFloating: { backgroundColor: colors.surface, boxShadow: shadows.card },
});
