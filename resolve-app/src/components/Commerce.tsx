import { Pressable, StyleSheet, View } from 'react-native';

import { colors, fonts, radius, shadows, spacing } from '@/theme/tokens';
import { formatDecimal } from '@/utils/format';
import { Avatar } from './ProfessionalCard';
import { Icon, type IconName } from './Icon';
import { Badge } from './Surfaces';
import { Text } from './Text';

/** Atalho de serviço da grade do Início: bloco arredondado com ícone duotone. */
export function ServiceTile({
  icon,
  label,
  badge,
  onPress,
}: {
  icon: IconName;
  label: string;
  badge?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.tileWrap}>
      {({ pressed }) => (
        <>
          <View style={[styles.tile, pressed && { transform: [{ scale: 0.95 }] }]}>
            <Icon name={icon} size={32} strokeWidth={2} duotone />
            {badge ? (
              <View style={styles.tileBadge}>
                <Text variant="overline" color={colors.onInk} style={{ fontSize: 9, lineHeight: 12 }}>
                  {badge}
                </Text>
              </View>
            ) : null}
          </View>
          <Text variant="caption" style={styles.tileLabel} numberOfLines={2}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

type PromoTone = 'dark' | 'brand' | 'tint';
const promoTone: Record<PromoTone, { bg: string; fg: string; sub: string; art: string; artIcon: string }> = {
  dark: { bg: colors.ink, fg: colors.onInk, sub: colors.onInkMuted, art: colors.brand, artIcon: colors.onBrand },
  brand: { bg: colors.brand, fg: colors.onBrand, sub: colors.onBrand, art: colors.ink, artIcon: colors.brand },
  tint: { bg: colors.brandTint, fg: colors.ink, sub: colors.inkBody, art: colors.surface, artIcon: colors.ink },
};

/** Banner do carrossel do Início. */
export function PromoCard({
  tone = 'dark',
  icon,
  title,
  text,
  cta,
  onPress,
  width = 300,
}: {
  tone?: PromoTone;
  icon: IconName;
  title: string;
  text: string;
  cta?: string;
  onPress?: () => void;
  width?: number;
}) {
  const t = promoTone[tone];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.promo, { backgroundColor: t.bg, width }, pressed && { opacity: 0.92 }]}
    >
      <View style={[styles.promoArt, { backgroundColor: t.art }]}>
        <Icon name={icon} size={34} strokeWidth={2} color={t.artIcon} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="labelLg" color={t.fg} style={{ fontSize: 16, lineHeight: 21 }}>
          {title}
        </Text>
        <Text variant="bodySm" color={t.sub}>
          {text}
        </Text>
        {cta ? (
          <View style={styles.promoCta}>
            <Text variant="label" color={t.fg}>
              {cta}
            </Text>
            <Icon name="arrow-right" size={16} strokeWidth={2.25} color={t.fg} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Barra de progresso em pílula. */
export function ProgressBar({ value, tone = 'ink' }: { value: number; tone?: 'ink' | 'brand' }) {
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.fill,
          { width: `${Math.max(6, Math.min(100, value * 100))}%`, backgroundColor: tone === 'ink' ? colors.ink : colors.brand },
        ]}
      />
    </View>
  );
}

/** Card do pedido em andamento (topo do Início e da aba Pedidos). */
export function ActiveOrderCard({
  title,
  subtitle,
  progress,
  onPress,
}: {
  title: string;
  subtitle: string;
  progress: number;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.active, pressed && { opacity: 0.94 }]}
    >
      <View style={styles.activeTop}>
        <View style={styles.activeIcon}>
          <Icon name="timer" size={22} strokeWidth={2.25} color={colors.onBrand} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="labelLg" color={colors.onInk}>
            {title}
          </Text>
          <Text variant="bodySm" color={colors.onInkMuted}>
            {subtitle}
          </Text>
        </View>
        <Icon name="chevron-right" size={20} strokeWidth={2.25} color={colors.onInk} />
      </View>
      <View style={styles.activeTrack}>
        <View style={[styles.activeFill, { width: `${Math.max(6, progress * 100)}%` }]} />
      </View>
    </Pressable>
  );
}

/** Opção selecionável de profissional (lista de escolha, como opções de corrida). */
export function ProfessionalOption({
  name,
  avatarUrl,
  rating,
  reviews,
  meta,
  aside,
  asideLabel,
  badge,
  selected,
  onPress,
}: {
  name: string;
  /** Foto do profissional; sem foto, o bonequinho. */
  avatarUrl?: string;
  rating: number;
  reviews: number;
  meta: string;
  /** Destaque à direita, ex.: "~5 min". */
  aside: string;
  /** Legenda do destaque, ex.: "para responder". */
  asideLabel?: string;
  badge?: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: !!selected }}
      accessibilityLabel={`${name}, nota ${formatDecimal(rating)}, ${aside} ${asideLabel ?? ''}`}
      onPress={onPress}
      style={[styles.option, selected && styles.optionOn]}
    >
      <Avatar size={52} uri={avatarUrl} />
      <View style={{ flex: 1, gap: 3 }}>
        {badge ? <Badge tone={selected ? 'ink' : 'brand'}>{badge}</Badge> : null}
        <Text variant="labelLg">{name}</Text>
        <View style={styles.optionMeta}>
          <Icon name="star" size={13} fill={colors.star} color={colors.star} strokeWidth={1} />
          <Text variant="bodySm" style={{ fontFamily: fonts.bold }}>
            {formatDecimal(rating)}
          </Text>
          <Text variant="bodySm" color={colors.inkMuted}>
            ({reviews} avaliações)
          </Text>
        </View>
        <Text variant="bodySm" color={colors.inkMuted}>
          {meta}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text variant="labelLg" style={{ fontSize: 16 }}>
          {aside}
        </Text>
        {asideLabel ? (
          <Text variant="caption" color={colors.inkMuted}>
            {asideLabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export type TimelineStep = { label: string; detail?: string; state: 'done' | 'current' | 'todo' };

/** Linha do tempo do pedido. */
export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <View>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <View key={s.label} style={styles.step}>
            <View style={styles.stepRail}>
              <View
                style={[
                  styles.dot,
                  s.state === 'done' && styles.dotDone,
                  s.state === 'current' && styles.dotCurrent,
                ]}
              >
                {s.state === 'done' ? <Icon name="check" size={12} strokeWidth={3} color={colors.onInk} /> : null}
              </View>
              {!last ? <View style={[styles.rail, s.state === 'done' && styles.railDone]} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : spacing[4], gap: 2 }}>
              <Text variant="label" color={s.state === 'todo' ? colors.inkMuted : colors.ink}>
                {s.label}
              </Text>
              {s.detail ? (
                <Text variant="bodySm" color={colors.inkMuted}>
                  {s.detail}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tileWrap: { width: '25%', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[1] },
  tile: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  tileLabel: { textAlign: 'center', paddingHorizontal: 2 },
  promo: {
    flexDirection: 'row',
    gap: spacing[4],
    padding: spacing[4],
    borderRadius: radius.xl,
    minHeight: 124,
    alignItems: 'center',
  },
  promoArt: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
  },
  promoCta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceStrong, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  active: { backgroundColor: colors.ink, borderRadius: radius.xl, padding: spacing[4], gap: spacing[4], boxShadow: shadows.card },
  activeTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  activeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.inkSoft, overflow: 'hidden' },
  activeFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.brand },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  optionOn: { backgroundColor: colors.brandTint, borderColor: colors.ink },
  optionMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  step: { flexDirection: 'row', gap: spacing[3] },
  stepRail: { alignItems: 'center', width: 22 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.ink, borderColor: colors.ink },
  dotCurrent: { borderColor: colors.ink, borderWidth: 6, backgroundColor: colors.brand },
  rail: { flex: 1, width: 2, backgroundColor: colors.surfaceStrong, marginVertical: 2 },
  railDone: { backgroundColor: colors.ink },
});
