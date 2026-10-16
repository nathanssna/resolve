import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme/tokens';
import { Icon } from './Icon';

/** Foto redonda; sem foto, ícone de pessoa sobre `surfaceStrong`. */
export function Avatar({ size = 52, uri }: { size?: number; uri?: string }) {
  return (
    <View style={[styles.avatar, { width: size, height: size }]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Icon name="user-round" size={Math.round(size * 0.55)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
