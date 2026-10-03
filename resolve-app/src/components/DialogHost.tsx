import { useEffect, useState, useSyncExternalStore } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { dialogStore } from '@/utils/dialog';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';

/** Mostra os avisos (notify) e as confirmações (confirm) do app. Monte uma vez, no layout raiz. */
export function DialogHost() {
  const { toast, confirm } = useSyncExternalStore(dialogStore.subscribe, dialogStore.get, dialogStore.get);
  const insets = useSafeAreaInsets();
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!toast) return;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [toast, anim]);

  const error = toast?.tone === 'error';
  const success = toast?.tone === 'success';

  return (
    <>
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.toastWrap,
            // No topo: embaixo, cobriria o campo de mensagem e os botões de ação.
            { top: insets.top + spacing[2] },
            { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] },
          ]}
        >
          <Pressable
            key={toast.id}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityHint="Toque para fechar"
            onPress={dialogStore.dismissToast}
            style={[styles.toast, error && styles.toastError]}
          >
            <Icon name={error ? 'info' : success ? 'check' : 'bell'} size={18} strokeWidth={2.25} color={error ? colors.danger : colors.brand} />
            <Text variant="bodySm" color={error ? colors.ink : colors.onInk} style={{ flex: 1 }}>
              {toast.message}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}

      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => dialogStore.answer(false)}>
        <View style={styles.backdrop}>
          {confirm ? (
            <View style={styles.card} accessibilityRole="alert" aria-modal>
              {confirm.title ? (
                <Text variant="titleSm" accessibilityRole="header">
                  {confirm.title}
                </Text>
              ) : null}
              <Text variant="body" color={colors.inkBody}>
                {confirm.message}
              </Text>
              <View style={styles.actions}>
                <View style={{ flex: 1 }}>
                  <Button variant="secondary" size="md" block onPress={() => dialogStore.answer(false)}>
                    {confirm.cancelLabel}
                  </Button>
                </View>
                <View style={{ flex: 1 }}>
                  <Button variant={confirm.danger ? 'dark' : 'primary'} size="md" block onPress={() => dialogStore.answer(true)} style={confirm.danger ? styles.danger : undefined}>
                    {confirm.confirmLabel}
                  </Button>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  toastWrap: { position: 'absolute', left: spacing[4], right: spacing[4], alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    maxWidth: 480,
    width: '100%',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
    boxShadow: shadows.card,
  },
  toastError: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.danger },
  backdrop: { flex: 1, backgroundColor: 'rgba(17,18,19,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing[5] },
  card: { width: '100%', maxWidth: 400, padding: spacing[5], borderRadius: radius.xl, backgroundColor: colors.surface, gap: spacing[4], boxShadow: shadows.card },
  actions: { flexDirection: 'row', gap: spacing[3] },
  danger: { backgroundColor: colors.danger },
});
