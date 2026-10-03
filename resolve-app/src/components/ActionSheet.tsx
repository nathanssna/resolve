import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type SheetAction = { icon: IconName; label: string; onPress: () => void; danger?: boolean };

/** Menu de ações que sobe da parte de baixo (ex.: ⋮ do chat). */
export function ActionSheet({ visible, title, actions, onClose }: { visible: boolean; title?: string; actions: SheetAction[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
        <View style={styles.handle} />
        {title ? (
          <Text variant="label" color={colors.inkMuted} style={{ paddingHorizontal: spacing[2] }}>
            {title}
          </Text>
        ) : null}
        {actions.map((a) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              // No iOS, outro modal (ex.: confirmação) só abre depois que este fechou.
              if (Platform.OS === 'ios') setTimeout(a.onPress, 350);
              else a.onPress();
            }}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}
          >
            <Icon name={a.icon} size={22} strokeWidth={2} color={a.danger ? colors.danger : colors.ink} />
            <Text variant="labelLg" color={a.danger ? colors.danger : colors.ink}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,18,19,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: spacing[4], gap: spacing[1] },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceStrong, marginBottom: spacing[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], paddingHorizontal: spacing[2], borderRadius: radius.md },
});
