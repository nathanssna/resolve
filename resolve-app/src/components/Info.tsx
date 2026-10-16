import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { colors, fonts, radius, spacing } from '@/theme/tokens';
import { formatDay } from '@/utils/format';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Item da lista "Serviços disponíveis". */
/** `success`: check verde, para o que está incluído (ex.: "O que dá pra resolver"). */
export function CheckItem({ children, tone = 'brand' }: { children: string; tone?: 'brand' | 'success' }) {
  const ok = tone === 'success';
  return (
    <View style={styles.check}>
      <View style={[styles.dot, ok && { backgroundColor: colors.successTint }]}>
        <Icon name="check" size={13} color={ok ? colors.success : colors.onBrand} />
      </View>
      <Text variant="body" color={colors.inkBody} style={styles.checkText}>
        {children}
      </Text>
    </View>
  );
}

/** Faixa de garantia — uma por tela, acima do botão principal. */
export function InfoBanner({ icon = 'shield-check', title, description }: { icon?: IconName; title: string; description?: string }) {
  return (
    <View style={styles.banner}>
      <Icon name={icon} size={28} />
      <View style={{ flex: 1 }}>
        <Text variant="labelLg" style={{ fontSize: 14, lineHeight: 18 }}>
          {title}
        </Text>
        {description ? (
          <Text variant="caption" color={colors.inkMuted} style={{ fontFamily: fonts.regular }}>
            {description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Conta suspensa pela moderação: o que vale enquanto isso e o caminho para falar com a equipe. */
export function SuspendedNotice({ until, compact = false }: { until: number; compact?: boolean }) {
  return (
    <View style={styles.suspended} accessibilityRole="alert">
      <View style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' }}>
        <Icon name="ban" size={22} color={colors.danger} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="labelLg" color={colors.danger}>
            {`Sua conta está suspensa${until === Infinity ? '' : ` até ${formatDay(until)}`}`}
          </Text>
          {!compact ? (
            <Text variant="bodySm" color={colors.inkBody}>
              Enquanto isso, você não faz pedidos nem envia propostas ou mensagens. Se acha que foi um engano, fale com a equipe.
            </Text>
          ) : null}
        </View>
      </View>
      <Button variant="dark" size="md" iconLeft="message-circle" onPress={() => router.push('/suporte')} style={{ alignSelf: 'flex-start' }}>
        Falar com a Rezolveaê
      </Button>
    </View>
  );
}

/** Estado vazio na voz da marca. */
export function EmptyState({ icon, title, description }: { icon: IconName; title: string; description?: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={28} />
      </View>
      <Text variant="labelLg" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {description ? (
        <Text variant="bodySm" color={colors.inkMuted} style={{ textAlign: 'center' }}>
          {description}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  dot: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { flex: 1, fontSize: 14, lineHeight: 20 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    padding: spacing[4],
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  suspended: { gap: spacing[3], padding: spacing[4], borderRadius: radius.md, backgroundColor: colors.dangerTint },
  empty: {
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[8],
    paddingHorizontal: spacing[6],
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[1],
  },
});
