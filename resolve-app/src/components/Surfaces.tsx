import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, radius, shadows, spacing } from '@/theme/tokens';
import { Button } from './Button';
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
          <Icon name="chevron-right" size={16} />
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
        <Icon name={icon} size={20} color={danger ? colors.danger : colors.ink} />
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
      {trailing ?? (onPress ? <Icon name="chevron-right" size={18} /> : null)}
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

/** Linha com interruptor (liga/desliga): a linha inteira é o controle. */
export function ToggleRow({
  icon,
  title,
  description,
  value,
  onChange,
  disabled,
}: {
  icon: IconName;
  title: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      aria-checked={value}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }, disabled && { opacity: 0.5 }]}
    >
      <View style={styles.rowIcon}>
        <Icon name={icon} size={20} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="label">{title}</Text>
        {description ? (
          <Text variant="caption" color={colors.inkMuted}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={[styles.track, value && styles.trackOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

type BadgeTone = 'brand' | 'ink' | 'success' | 'muted' | 'danger';
const badgeTone: Record<BadgeTone, { bg: string; fg: string }> = {
  brand: { bg: colors.brand, fg: colors.onBrand },
  ink: { bg: colors.ink, fg: colors.onInk },
  success: { bg: colors.successTint, fg: colors.success },
  muted: { bg: colors.surfaceMuted, fg: colors.ink },
  danger: { bg: colors.danger, fg: colors.onInk },
};

/** Etiqueta curta: "Novo", "Recomendado", "Concluído". */
export function Badge({ tone = 'brand', icon, children }: { tone?: BadgeTone; icon?: IconName; children: string }) {
  const t = badgeTone[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {icon ? <Icon name={icon} size={12} color={t.fg} /> : null}
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
            <Icon name={icon} size={22} />
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
            aria-checked={on}
            onPress={() => onChange(o.id)}
            style={[styles.segmentItem, on && styles.segmentOn]}
          >
            {o.icon ? <Icon name={o.icon} size={18} /> : null}
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
      aria-selected={!!active}
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
  track: { width: 46, height: 28, borderRadius: radius.pill, backgroundColor: colors.surfaceStrong, padding: 3, justifyContent: 'center' },
  trackOn: { backgroundColor: colors.ink },
  knob: { width: 22, height: 22, borderRadius: radius.pill, backgroundColor: colors.surface, boxShadow: shadows.card },
  knobOn: { alignSelf: 'flex-end' },
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
    // Branco: o atalho fica sobre o cartão cinza do pedido.
    backgroundColor: colors.surface,
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

/** Profissional de Ouro: aulas + 10 serviços + nota 4,7 + pontualidade. `sm` nas listas, `md` no perfil.
 * Tocar abre a explicação para o cliente; `explain={false}` onde a tela já explica (aulas, convite). */
export function GoldBadge({ size = 'md', explain = true }: { size?: 'sm' | 'md'; explain?: boolean }) {
  const sm = size === 'sm';
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const badge = (
    <View style={[goldStyles.badge, sm && goldStyles.sm]}>
      <Text variant={sm ? 'caption' : 'label'} color={colors.onBrand} style={goldStyles.text}>
        Profissional de Ouro
      </Text>
    </View>
  );
  if (!explain) return badge;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Profissional de Ouro"
        accessibilityHint="Mostra o que a marca quer dizer"
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [{ alignSelf: sm ? 'flex-start' : 'center' }, pressed && { opacity: 0.7 }]}
      >
        {badge}
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={goldStyles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Fechar" />
        <View style={[goldStyles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
          <View style={goldStyles.handle} />
          <View style={{ alignSelf: 'flex-start' }}>{badge}</View>
          <Text variant="body" color={colors.inkBody}>
            Este profissional cumpre as quatro etapas da Rezolveaê:
          </Text>
          <View style={{ gap: spacing[2] }}>
            {[
              'Concluiu as aulas sobre orçamento, atendimento e data combinada',
              'Já fez pelo menos 10 serviços pela Rezolveaê',
              'Tem nota 4,7 ou mais',
              'Chega no horário, segundo os clientes, e quase nunca cancela em cima da hora',
            ].map((t) => (
              <View key={t} style={goldStyles.item}>
                <Icon name="check" size={18} color={colors.success} />
                <Text variant="bodySm" color={colors.inkBody} style={{ flex: 1 }}>
                  {t}
                </Text>
              </View>
            ))}
          </View>
          <Text variant="caption" color={colors.inkMuted}>
            Se deixar de cumprir, a marca sai. Ela não é um certificado e não garante a qualidade do serviço: veja também as avaliações.
          </Text>
          <Button variant="dark" block onPress={() => setOpen(false)} style={{ marginTop: spacing[2] }}>
            Entendi
          </Button>
        </View>
      </Modal>
    </>
  );
}

const goldStyles = StyleSheet.create({
  badge: {
    paddingVertical: 5,
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignSelf: 'center',
  },
  sm: { paddingVertical: 2, paddingHorizontal: 9, alignSelf: 'flex-start' },
  text: { fontFamily: fonts.bold },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  backdrop: { flex: 1, backgroundColor: 'rgba(17,18,19,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: spacing[5], paddingTop: spacing[3], gap: spacing[3] },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceStrong, marginBottom: spacing[1] },
});
