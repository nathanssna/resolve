import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Painel branco com topo arredondado que sobe sobre o topo amarelo. */
export function Sheet({ children, style, handle }: { children: ReactNode; style?: StyleProp<ViewStyle>; handle?: boolean }) {
  return (
    <View style={[styles.sheet, style]}>
      {handle ? <View style={styles.handle} /> : null}
      {children}
    </View>
  );
}

/** Título de seção com ação opcional à direita ("Ver todos"). */
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHead}>
      <Text variant="titleSm" accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onAction} style={styles.sectionAction}>
          <Text variant="label">{action}</Text>
          <Icon name="chevron-right" size={16} strokeWidth={2.25} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Rodapé fixo com sombra para a ação principal da tela. */
export function StickyFooter({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>{children}</View>;
}

/** Linha de lista: ícone, rótulo, valor e chevron (Endereço, Pagamento…). */
export function ListRow({
  icon,
  label,
  value,
  onPress,
  trailing,
  danger,
}: {
  icon: IconName;
  label?: string;
  value: string;
  onPress?: () => void;
  trailing?: ReactNode;
  danger?: boolean;
}) {
  const content = (
    <>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={20} strokeWidth={2} color={danger ? colors.danger : colors.ink} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        {label ? (
          <Text variant="caption" color={colors.inkMuted}>
            {label}
          </Text>
        ) : null}
        <Text variant="label" color={danger ? colors.danger : colors.ink} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {trailing ?? (onPress ? <Icon name="chevron-right" size={18} strokeWidth={2} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      {content}
    </Pressable>
  );
}

type BadgeTone = 'brand' | 'ink' | 'success' | 'muted';
const badgeTone: Record<BadgeTone, { bg: string; fg: string }> = {
  brand: { bg: colors.brand, fg: colors.onBrand },
  ink: { bg: colors.ink, fg: colors.onInk },
  success: { bg: colors.successTint, fg: colors.success },
  muted: { bg: colors.surfaceMuted, fg: colors.ink },
};

/** Etiqueta curta: "Novo", "Recomendado", "Concluído". */
export function Badge({ tone = 'brand', icon, children }: { tone?: BadgeTone; icon?: IconName; children: string }) {
  const t = badgeTone[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {icon ? <Icon name={icon} size={12} strokeWidth={2.5} color={t.fg} /> : null}
      <Text variant="overline" color={t.fg}>
        {children}
      </Text>
    </View>
  );
}

/** Botão redondo com rótulo embaixo (Mensagem, Ligar, Compartilhar…). */
export function ActionButton({ icon, label, onPress }: { icon: IconName; label: string; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.action}>
      {({ pressed }) => (
        <>
          <View style={[styles.actionCircle, pressed && { backgroundColor: colors.surfaceStrong }]}>
            <Icon name={icon} size={22} strokeWidth={2} />
          </View>
          <Text variant="caption">{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Controle segmentado (Agora/Agendar, Pix/Cartão/Dinheiro). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <View style={styles.segment} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.id)}
            style={[styles.segmentItem, on && styles.segmentOn]}
          >
            {o.icon ? <Icon name={o.icon} size={18} strokeWidth={2} /> : null}
            <Text variant="label" style={on ? undefined : { color: colors.inkMuted }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Chip de escolha (dias, horários). */
export function OptionChip({
  label,
  sublabel,
  active,
  onPress,
}: {
  label: string;
  sublabel?: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[styles.optChip, sublabel ? styles.optTall : null, active && styles.optOn]}
    >
      {sublabel ? (
        <Text variant="caption" color={active ? colors.onBrand : colors.inkMuted}>
          {sublabel}
        </Text>
      ) : null}
      <Text variant="label" color={colors.ink}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    boxShadow: shadows.sheet,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    marginTop: spacing[2],
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  footer: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    backgroundColor: colors.surface,
    boxShadow: shadows.sheet,
    gap: spacing[3],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    borderRadius: radius.md,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    height: 22,
    borderRadius: radius.pill,
  },
  action: { alignItems: 'center', gap: 6, minWidth: 64 },
  actionCircle: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segment: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  segmentItem: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segmentOn: { backgroundColor: colors.surface, boxShadow: shadows.card },
  optChip: {
    minWidth: 64,
    height: 44,
    paddingHorizontal: spacing[4],
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  optTall: { height: 60, minWidth: 68, gap: 2 },
  optOn: { backgroundColor: colors.brandTint, borderColor: colors.ink },
});
