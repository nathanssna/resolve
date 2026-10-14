/**
 * Peças do painel de moderação (/admin): página com largura limitada (para o
 * navegador do computador), números e a leitura das funções admin_* do banco.
 */
import { router, useIsFocused } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet, CatalogFallback, Icon, StickyFooter, Text, TopBar } from '@/components';
import { reportReasonLabel } from '@/content/reports';
import { authErrorMessage } from '@/lib/authErrors';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { GateScreen, useAdminGate } from './gate';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { confirm, notify } from '@/utils/dialog';
import { timeAgo } from '@/utils/format';

type Fns = Database['public']['Functions'];
type AdminFn = Extract<keyof Fns, `admin_${string}`>;

/**
 * Chama uma função admin_* e recarrega quando a tela volta a aparecer.
 * Enquanto os novos dados não chegam (ex.: trocou o filtro), mostra os anteriores.
 */
export function useAdminRpc<N extends AdminFn>(fn: N, args?: Fns[N]['Args']) {
  const key = JSON.stringify(args ?? {});
  const focused = useIsFocused();
  // Só lê depois do acesso liberado (administrador + segundo fator).
  const { gate } = useAdminGate();
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<{ key: string; data: Fns[N]['Returns'] | null; failed: boolean } | null>(null);

  useEffect(() => {
    if (!focused || gate !== 'ok') return;
    let alive = true;
    // Nome da função variável: chama pelo próprio cliente (rpc usa `this`).
    const client = supabase as unknown as { rpc: (fn: string, args: object) => PromiseLike<{ data: unknown; error: unknown }> };
    client.rpc(fn, JSON.parse(key)).then(({ data, error }) => {
      if (alive) setState({ key, data: error ? null : (data as Fns[N]['Returns']), failed: !!error });
    });
    return () => {
      alive = false;
    };
  }, [fn, key, focused, tick, gate]);

  return {
    data: state?.data ?? null,
    failed: state?.key === key && state.failed,
    loading: state?.key !== key,
    reload: () => setTick((t) => t + 1),
  };
}

/** Sem acesso liberado (não é administrador, falta o código do autenticador): a tela do portão. */
export function GatedPage({ children }: { children: ReactNode }) {
  const { gate, recheck } = useAdminGate();
  if (gate === 'ok') return <>{children}</>;
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surface }]} edges={['top']}>
      <TopBar title="Moderação" />
      <ScrollView contentContainerStyle={styles.gate}>
        <GateScreen gate={gate} recheck={recheck} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** Página do painel: barra superior, conteúdo com largura limitada e, opcional, ações fixas embaixo. */
export function AdminPage({
  title,
  right,
  children,
  footer,
  loading,
  failed,
  onRetry,
  surface,
}: {
  title: string;
  right?: string;
  children?: ReactNode;
  footer?: ReactNode;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  /** Fundo branco (telas de decisão); sem ele, cinza com cartões. */
  surface?: boolean;
}) {
  const ready = !failed && !loading;
  return (
    <GatedPage>
      <SafeAreaView style={[styles.safe, surface && { backgroundColor: colors.surface }]} edges={['top']}>
        <View style={styles.bar}>
          <View style={{ flex: 1 }}>
            <TopBar title={title} />
          </View>
          {right ? (
            <Text variant="label" color={colors.inkMuted} style={styles.right}>
              {right}
            </Text>
          ) : null}
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.page}>
            {failed ? <CatalogFallback status="error" onRetry={onRetry ?? (() => {})} /> : loading ? <CatalogFallback status="loading" onRetry={() => {}} /> : children}
          </View>
        </ScrollView>
        {footer && ready ? (
          <StickyFooter>
            <View style={styles.footer}>{footer}</View>
          </StickyFooter>
        ) : null}
      </SafeAreaView>
    </GatedPage>
  );
}

/** Título de seção (com ação opcional à direita). */
export function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: ReactNode }) {
  return (
    <View style={{ gap: spacing[3] }}>
      <View style={styles.sectionHead}>
        <Text variant="titleSm" accessibilityRole="header">
          {title}
        </Text>
        {action ? (
          <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
            <Text variant="label" color={colors.inkBody}>
              {action}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** Linha discreta para seção vazia (a seção continua no lugar). */
export function Empty({ text }: { text: string }) {
  return (
    <Text variant="bodySm" color={colors.inkMuted} style={{ paddingHorizontal: spacing[1] }}>
      {text}
    </Text>
  );
}

// ----- Fila "Para resolver" -----

/** Prazo das denúncias (os termos prometem análise em até 24 h). */
const REPORT_SLA = 24 * 3_600_000;

export type QueueItem = {
  key: string;
  kind: 'denuncia' | 'selo';
  at: number;
  title: string;
  sub: string;
  late: boolean;
  open: () => void;
};

/** Denúncias abertas (mais antigas primeiro) e depois os pedidos de selo (por ordem de chegada). */
export function useQueue() {
  const reports = useAdminRpc('admin_reports', { p_open: true, p_limit: 200 });
  const seals = useAdminRpc('admin_verifications');
  // Hora de referência para "atrasada" (fixa enquanto a tela está aberta).
  const [now] = useState(() => Date.now());
  const items: QueueItem[] = [
    ...[...(reports.data ?? [])]
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .map((r) => ({
        key: `d:${r.id}`,
        kind: 'denuncia' as const,
        at: Date.parse(r.created_at),
        title: reportReasonLabel(r.reason),
        sub: `${r.reporter_name} denunciou ${r.reported_name}`,
        late: now - Date.parse(r.created_at) > REPORT_SLA,
        open: () => router.push({ pathname: '/admin/denuncia/[id]', params: { id: r.id } }),
      })),
    ...(seals.data ?? []).map((v) => ({
      key: `s:${v.id}`,
      kind: 'selo' as const,
      at: Date.parse(v.created_at),
      title: `${v.name || 'Sem nome'} pediu o selo`,
      sub: [v.role_title, 'documento e selfie'].filter(Boolean).join(' · '),
      late: false,
      open: () => router.push({ pathname: '/admin/selo', params: { id: v.id } }),
    })),
  ];
  return {
    items,
    loading: !reports.data || !seals.data,
    failed: reports.failed || seals.failed,
    reload: () => {
      reports.reload();
      seals.reload();
    },
  };
}

export function QueueCard({ item }: { item: QueueItem }) {
  const report = item.kind === 'denuncia';
  return (
    <Pressable accessibilityRole="button" onPress={item.open} style={({ pressed }) => [styles.card, styles.queue, pressed && { opacity: 0.92 }]}>
      <View style={[styles.queueIcon, { backgroundColor: report ? colors.dangerTint : colors.brandTint }]}>
        <Icon name={report ? 'flag' : 'badge-check'} size={22} color={report ? colors.danger : colors.ink} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="overline" color={report ? colors.danger : colors.inkMuted}>
          {`${report ? 'DENÚNCIA' : 'SELO VERIFICADO'} · ${item.late ? 'ATRASADA, ' : ''}${timeAgo(item.at).toUpperCase()}`}
        </Text>
        <Text variant="labelLg" numberOfLines={2}>
          {item.title}
        </Text>
        <Text variant="bodySm" color={colors.inkBody} numberOfLines={1}>
          {item.sub}
        </Text>
      </View>
      <Icon name="chevron-right" size={18} color={colors.inkMuted} />
    </Pressable>
  );
}

// ----- Suspender (denúncia e ficha) -----

/** Menu de suspender: escolhe o prazo, confirma e chama admin_suspend. */
export function SuspendSheet({ visible, user, name, onClose, onDone }: { visible: boolean; user: string; name: string; onClose: () => void; onDone: () => void }) {
  const run = (days: number | null, label: string) =>
    confirm(
      `Suspender ${name} ${label}? A pessoa é avisada e não consegue pedir, propor nem mandar mensagens.`,
      async () => {
        const { error } = await supabase.rpc('admin_suspend', days ? { p_user: user, p_days: days } : { p_user: user });
        if (error) notify(authErrorMessage(error));
        else {
          notify('Conta suspensa.', { tone: 'success' });
          onDone();
        }
      },
      { confirmLabel: 'Suspender', danger: true },
    );
  return (
    <ActionSheet
      visible={visible}
      title={`Suspender ${name} por quanto tempo?`}
      onClose={onClose}
      actions={[
        { icon: 'clock', label: '7 dias', onPress: () => run(7, 'por 7 dias') },
        { icon: 'clock', label: '30 dias', onPress: () => run(30, 'por 30 dias') },
        { icon: 'ban', label: 'Sem prazo', danger: true, onPress: () => run(null, 'sem prazo') },
      ]}
    />
  );
}

/** Número de um bloco de números: valor, rótulo e uma linha de apoio. */
export function Stat({ value, label, sub, danger }: { value: string; label: string; sub?: string; danger?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text variant="titleLg" color={danger ? colors.danger : colors.ink}>
        {value}
      </Text>
      <Text variant="bodySm" color={colors.inkBody}>
        {label}
      </Text>
      {sub ? (
        <Text variant="caption" color={colors.inkMuted}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/** Números lado a lado num cartão, com divisórias (`columns` por linha). */
export function Stats({ children, columns = 2 }: { children: ReactNode[]; columns?: number }) {
  return (
    <View style={[styles.card, styles.stats]}>
      {children.map((child, i) => (
        <View
          key={i}
          style={[
            { width: `${100 / columns}%` },
            (i + 1) % columns !== 0 && styles.divRight,
            i < children.length - columns && styles.divBottom,
          ]}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

/** Cartão branco (listas). */
export function Panel({ children }: { children: ReactNode }) {
  return <View style={[styles.card, styles.panel]}>{children}</View>;
}

/** Linha de lista dentro de um Panel. */
export function Row({ title, sub, subDanger, right, badge, onPress, last }: { title: string; sub?: string; subDanger?: boolean; right?: ReactNode; badge?: ReactNode; onPress?: () => void; last?: boolean }) {
  const body = (
    <>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" numberOfLines={2}>
          {title}
        </Text>
        {sub ? (
          <Text variant="caption" color={subDanger ? colors.danger : colors.inkMuted}>
            {sub}
          </Text>
        ) : null}
      </View>
      {badge}
      {right}
      {onPress ? <Icon name="chevron-right" size={18} color={colors.inkMuted} /> : null}
    </>
  );
  const style = [styles.row, !last && styles.divBottom];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [...style, pressed && { backgroundColor: colors.surfaceMuted }]}>
      {body}
    </Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}

/** "13/10/2026". */
export function dateBR(iso: string | null | undefined) {
  if (!iso || iso === 'infinity') return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Suspensa agora? E até quando ("sem prazo" para infinity). */
export function suspension(until: string | null | undefined) {
  if (!until) return null;
  if (until === 'infinity') return 'sem prazo';
  return Date.parse(until) > Date.now() ? `até ${dateBR(until)}` : null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  bar: { flexDirection: 'row', alignItems: 'center' },
  right: { paddingRight: spacing[5] },
  scroll: { paddingBottom: spacing[8] },
  gate: { padding: spacing[5], paddingTop: spacing[2] },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: spacing[4], paddingTop: spacing[2], gap: spacing[6] },
  footer: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: spacing[3] },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: spacing[1] },
  card: { borderRadius: radius.lg, backgroundColor: colors.surface, boxShadow: shadows.card },
  queue: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4] },
  queueIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' },
  stat: { padding: spacing[4], gap: 2 },
  divRight: { borderRightWidth: 1, borderRightColor: colors.line },
  divBottom: { borderBottomWidth: 1, borderBottomColor: colors.line },
  panel: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], paddingHorizontal: spacing[4] },
});
