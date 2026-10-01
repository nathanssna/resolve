import { StyleSheet, View } from 'react-native';

import { colors, fonts, spacing } from '@/theme/tokens';
import { formatCount, formatDecimal } from '@/utils/format';
import { Icon } from './Icon';
import { Text } from './Text';

type Props = { value: number; count?: number; suffix?: string; size?: number; /** Sobre fundo amarelo. */ onBrand?: boolean };

/** Estrela + nota em negrito + contagem. A nota numérica nunca é omitida. */
export function Rating({ value, count, suffix, size = 14, onBrand }: Props) {
  const big = size >= 18;
  const fontSize = big ? 16 : 13;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`Nota ${formatDecimal(value)}${count != null ? `, ${formatCount(count)} avaliações` : ''}`}
    >
      <Icon name="star" size={size} fill={colors.star} color={colors.star} strokeWidth={1} />
      <Text variant="bodySm" style={{ fontFamily: fonts.bold, fontSize }}>
        {formatDecimal(value)}
      </Text>
      {count != null ? (
        <Text variant="bodySm" color={onBrand ? colors.inkBody : colors.inkMuted} style={{ fontSize }}>
          ({formatCount(count)}
          {suffix ? ` ${suffix}` : ''})
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
});
