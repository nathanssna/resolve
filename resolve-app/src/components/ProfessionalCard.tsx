import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';
import { Card } from './Card';
import { Tag } from './Chips';
import { Icon } from './Icon';
import { Rating } from './Rating';
import { Text } from './Text';

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

type Props = {
  name: string;
  rating: number;
  count?: number;
  distance?: string;
  role?: string;
  experience?: string;
  tags?: string[];
  avatarUri?: string;
  onPress?: () => void;
};

export function ProfessionalCard({ name, rating, count, distance, role, experience, tags, avatarUri, onPress }: Props) {
  return (
    <Card onPress={onPress} accessibilityLabel={`${name}, ${role ?? ''}`} style={styles.card}>
      <View style={styles.head}>
        <Avatar uri={avatarUri} />
        <View style={styles.id}>
          <Text variant="labelLg">{name}</Text>
          <Rating value={rating} count={count} size={13} />
          {distance ? (
            <Text variant="bodySm" color={colors.inkMuted}>
              {distance}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron-right" size={18} strokeWidth={2} />
      </View>
      {role || experience ? (
        <View style={styles.meta}>
          {role ? (
            <Text variant="bodySm" color={colors.inkMuted}>
              {role}
            </Text>
          ) : null}
          {role && experience ? <View style={styles.sep} /> : null}
          {experience ? (
            <Text variant="bodySm" color={colors.inkMuted}>
              {experience}
            </Text>
          ) : null}
        </View>
      ) : null}
      {tags?.length ? (
        <View style={styles.tags}>
          {tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </View>
      ) : null}
    </Card>
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
  card: { gap: spacing[3], paddingTop: spacing[4] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  id: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' },
  sep: { width: 1, height: 14, backgroundColor: colors.inkMuted, opacity: 0.6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
});
