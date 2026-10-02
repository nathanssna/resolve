import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/theme/tokens';
import { Icon } from './Icon';
import { Text } from './Text';

/**
 * Miniaturas de foto. `uris[i]` vazio = ainda carregando (bloco cinza).
 * `onRemove`: mostra o "x" (formulário). `onOpen`: toque amplia (chat).
 */
export function PhotoThumbs({
  uris,
  size = 72,
  onOpen,
  onRemove,
}: {
  uris: (string | undefined)[];
  size?: number;
  onOpen?: (index: number) => void;
  onRemove?: (index: number) => void;
}) {
  return (
    <View style={styles.thumbs}>
      {uris.map((uri, i) => (
        <View key={`${i}-${uri ?? ''}`} style={{ width: size, height: size }}>
          <Pressable
            accessibilityRole={onOpen ? 'imagebutton' : 'image'}
            accessibilityLabel={`Foto ${i + 1} de ${uris.length}`}
            disabled={!onOpen || !uri}
            onPress={() => onOpen?.(i)}
            style={[styles.thumb, { width: size, height: size }]}
          >
            {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
          </Pressable>
          {onRemove ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remover foto ${i + 1}`}
              hitSlop={8}
              onPress={() => onRemove(i)}
              style={styles.remove}
            >
              <Icon name="x" size={14} strokeWidth={2.75} color={colors.onInk} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** Fotos em tela cheia, deslizando para os lados. */
export function PhotoViewer({ uris, index, onClose }: { uris: string[]; index: number | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const open = index !== null;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} onShow={() => setPage(index ?? 0)}>
      <View style={styles.viewer}>
        {open ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: (index ?? 0) * width, y: 0 }}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {uris.map((uri) => (
              <Image key={uri} source={{ uri }} style={{ width, height }} contentFit="contain" accessibilityIgnoresInvertColors />
            ))}
          </ScrollView>
        ) : null}
        <View style={[styles.viewerBar, { top: insets.top + spacing[2] }]}>
          <Text variant="label" color={colors.onInk}>
            {uris.length > 1 ? `${page + 1} de ${uris.length}` : ''}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar foto" onPress={onClose} hitSlop={8} style={styles.close}>
            <Icon name="x" size={22} strokeWidth={2.5} color={colors.onInk} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  thumb: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceStrong },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  viewer: { flex: 1, backgroundColor: colors.ink },
  viewerBar: { position: 'absolute', left: spacing[4], right: spacing[4], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
});
