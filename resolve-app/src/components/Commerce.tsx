import { Pressable, StyleSheet, View } from 'react-native';

import { colors, fonts, radius, shadows, spacing } from '@/theme/tokens';
import { formatDecimal } from '@/utils/format';
import { Avatar } from './Avatar';
import { Icon, type IconName } from './Icon';
import { Badge, GoldBadge } from './Surfaces';
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
            <Icon name={icon} size={32} duotone />
            {badge ? (
              <View style={styles.tileBadge}>
                <Text variant="overline" color={colors.onInk} style={{ fontSize: 11, lineHeight: 14 }}>
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
        <Icon name={icon} size={34} color={t.artIcon} />
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
            <Icon name="arrow-right" size={16} color={t.fg} />
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
          { width: `${value <= 0 ? 0 : Math.max(6, Math.min(100, value * 100))}%`, backgroundColor: tone === 'ink' ? colors.ink : colors.brand },
        ]}
      />
    </View>
  );
}

/** Card do pedido em andamento (topo do Início e da aba Pedidos). */
export function ActiveOrderCard({
  title,
  subtitle,
  avatarUrl,
  tile,
  onPress,
}: {
  title: string;
  subtitle: string;
  /** Foto do profissional; sem foto, o bonequinho. */
  avatarUrl?: string;
  /** Bloco amarelo à direita: o dia ("SEX" / "17") ou o valor ("R$" / "180"). Sem ele, a seta. */
  tile?: { top: string; big: string };
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [styles.active, pressed && { opacity: 0.94 }]}
    >
      <Avatar size={52} uri={avatarUrl} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="labelLg" color={colors.onInk} style={{ fontSize: 16, lineHeight: 21 }}>
          {title}
        </Text>
        <Text variant="bodySm" color={colors.onInkMuted}>
          {subtitle}
        </Text>
      </View>
      {tile ? (
        <View style={styles.activeTile}>
          <Text variant="overline">{tile.top}</Text>
          <Text variant="titleMd" style={{ fontFamily: fonts.extrabold }}>
            {tile.big}
          </Text>
        </View>
      ) : (
        <Icon name="chevron-right" size={20} color={colors.onInk} />
      )}
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
  gold,
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
  /** Profissional de Ouro: marca embaixo do nome. */
  gold?: boolean;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: !!selected }}
      aria-checked={!!selected}
      accessibilityLabel={`${name}${gold ? ', Profissional de Ouro' : ''}, ${reviews ? `nota ${formatDecimal(rating)}` : 'novo na Rezolveaê'}, ${aside} ${asideLabel ?? ''}`}
      onPress={onPress}
      style={[styles.option, selected && styles.optionOn]}
    >
      <Avatar size={52} uri={avatarUrl} />
      <View style={{ flex: 1, gap: 3 }}>
        {badge ? <Badge tone={selected ? 'ink' : 'brand'}>{badge}</Badge> : null}
        <Text variant="labelLg">{name}</Text>
        {gold ? <GoldBadge size="sm" /> : null}
        {/* Sem avaliações ainda: "Novo" em vez de uma nota 0,0 que parece ruim. */}
        {reviews ? (
          <View style={styles.optionMeta}>
            <Icon name="star" size={13} fill={colors.star} color={colors.star} strokeWidth={1} />
            <Text variant="bodySm" style={{ fontFamily: fonts.bold }}>
              {formatDecimal(rating)}
            </Text>
            <Text variant="bodySm" color={colors.inkMuted}>
              {reviews === 1 ? '(1 avaliação)' : `(${reviews} avaliações)`}
            </Text>
          </View>
        ) : (
          <View style={styles.optionMeta}>
            <Icon name="sparkles" size={13} />
            <Text variant="bodySm" style={{ fontFamily: fonts.bold }}>
              Novo na Rezolveaê
            </Text>
          </View>
        )}
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
                {s.state === 'done' ? <Icon name="check" size={12} color={colors.onInk} /> : null}
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
  active: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    backgroundColor: colors.ink,
    borderRadius: radius.xl,
    paddingVertical: 14,
    paddingLeft: spacing[4],
    paddingRight: 14,
    boxShadow: shadows.card,
  },
  activeTile: {
    minWidth: 64,
    height: 64,
    paddingHorizontal: spacing[2],
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  // Etapa atual: bolinha amarela com contorno fino, como as outras.
  dotCurrent: { borderColor: colors.ink, backgroundColor: colors.brand },
  rail: { flex: 1, width: 2, backgroundColor: colors.surfaceStrong, marginVertical: 2 },
  railDone: { backgroundColor: colors.ink },
});
