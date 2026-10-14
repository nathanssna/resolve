import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Badge, Button, Text } from '@/components';
import { reportReasonLabel } from '@/content/reports';
import { authErrorMessage } from '@/lib/authErrors';
import { supabase } from '@/lib/supabase';
import { AdminPage, dateBR, Empty, Panel, Row, Section, Stat, Stats, suspension, SuspendSheet, useAdminRpc } from '@/screens/admin/shared';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { confirm, notify } from '@/utils/dialog';
import { formatBRL, formatCount, formatDecimal, formatPhoneBR } from '@/utils/format';

type Person = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'cliente' | 'profissional';
  avatar_url: string | null;
  created_at: string;
  deleted_at: string | null;
  suspended_until: string | null;
  identity_verified_at: string | null;
  verification_required_at: string | null;
  verification_pending: boolean;
  pro: { role_title: string; verified: boolean; rating: number; reviews: number } | null;
  stats: { orders: number; done: number; canceled_late: number; reports_received: number };
  reports: { id: string; reason: string; created_at: string; resolved_at: string | null; resolution: string | null; reporter: string }[];
  orders_recent: { id: string; other: string; amount: number; status: string; created_at: string; completed_at: string | null; canceled_at: string | null; canceled_late: boolean; canceled_by_self: boolean }[];
};

/** Situação de um serviço, do ponto de vista da pessoa da ficha. */
function orderLine(o: Person['orders_recent'][number]) {
  if (o.status === 'concluido') return { text: `Concluído em ${dateBR(o.completed_at)}`, danger: false };
  if (o.status === 'combinado') return { text: `Combinado em ${dateBR(o.created_at)}`, danger: false };
  const who = o.canceled_by_self ? 'Cancelou' : 'A outra pessoa cancelou';
  return { text: `${who}${o.canceled_late ? ' em cima da hora' : ''} · ${dateBR(o.canceled_at)}`, danger: o.canceled_by_self && o.canceled_late };
}

/** Ficha: quem é, histórico em números, denúncias, últimos serviços e suspender. */
export default function AdminPessoa() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, failed, reload } = useAdminRpc('admin_person', { p_id: id });
  const p = data as Person | null;
  const [suspending, setSuspending] = useState(false);

  const suspended = suspension(p?.suspended_until);
  const act = (fn: 'admin_require_verification' | 'admin_waive_verification', question: string, label: string, done: string) =>
    confirm(question, async () => {
      const { error } = await supabase.rpc(fn, { p_user: id });
      if (error) notify(authErrorMessage(error));
      else {
        notify(done, { tone: 'success' });
        reload();
      }
    }, { confirmLabel: label });
  const unsuspend = () =>
    confirm(`Reativar a conta de ${p?.name}?`, async () => {
      const { error } = await supabase.rpc('admin_unsuspend', { p_user: id });
      if (error) notify(authErrorMessage(error));
      else {
        notify('Conta reativada.', { tone: 'success' });
        reload();
      }
    }, { confirmLabel: 'Reativar' });

  return (
    <AdminPage
      title="Pessoa"
      loading={!p && loading}
      failed={!p && failed}
      onRetry={reload}
      footer={
        p && !p.deleted_at ? (
          suspended ? (
            <Button variant="dark" block onPress={unsuspend}>
              Reativar conta
            </Button>
          ) : (
            <Button variant="secondary" block iconLeft="ban" onPress={() => setSuspending(true)}>
              Suspender conta
            </Button>
          )
        ) : undefined
      }
    >
      {p ? (
        <>
          <View style={styles.card}>
            <View style={styles.who}>
              <Avatar size={56} uri={p.avatar_url ?? undefined} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="titleMd">{p.deleted_at ? 'Conta excluída' : p.name || 'Sem nome'}</Text>
                <Text variant="bodySm" color={colors.inkBody}>
                  {[
                    p.role === 'profissional' ? p.pro?.role_title || 'Profissional' : 'Cliente',
                    p.pro?.reviews ? `nota ${formatDecimal(Number(p.pro.rating))}` : null,
                    `desde ${dateBR(p.created_at)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </View>
            <Text variant="bodySm" color={colors.inkMuted} selectable>
              {[p.email, p.phone ? formatPhoneBR(p.phone) : null].filter(Boolean).join(' · ')}
            </Text>
            {suspended || p.pro?.verified || p.identity_verified_at || p.verification_required_at ? (
              <View style={styles.badges}>
                {suspended ? <Badge tone="danger">{`SUSPENSA ${suspended.toUpperCase()}`}</Badge> : null}
                {p.pro?.verified ? (
                  <Badge tone="success" icon="badge-check">VERIFICADO</Badge>
                ) : p.identity_verified_at ? (
                  <Badge tone="success" icon="badge-check">IDENTIDADE CONFIRMADA</Badge>
                ) : null}
                {p.verification_required_at ? <Badge tone="brand">{p.verification_pending ? 'VERIFICAÇÃO EM ANÁLISE' : 'VERIFICAÇÃO PEDIDA'}</Badge> : null}
              </View>
            ) : null}
            {!p.deleted_at && !p.identity_verified_at ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() =>
                  p.verification_required_at
                    ? act('admin_waive_verification', `Dispensar a verificação de ${p.name}?`, 'Dispensar', 'Verificação dispensada.')
                    : act(
                        'admin_require_verification',
                        `Pedir a verificação de identidade de ${p.name}? Até enviar documento e selfie e ser aprovada, a pessoa não faz pedidos nem propostas novos.`,
                        'Pedir',
                        'Verificação pedida. A pessoa foi avisada.',
                      )
                }
              >
                <Text variant="label" style={{ textDecorationLine: 'underline' }}>
                  {p.verification_required_at ? 'Dispensar a verificação' : 'Pedir verificação de identidade'}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Section title="Histórico">
            <Stats columns={3}>
              <Stat value={formatCount(Number(p.stats.done))} label="serviços concluídos" />
              <Stat value={formatCount(Number(p.stats.canceled_late))} label="cancelou em cima da hora" danger={Number(p.stats.canceled_late) > 0} />
              <Stat value={formatCount(Number(p.stats.reports_received))} label="denúncias recebidas" danger={Number(p.stats.reports_received) > 0} />
            </Stats>
          </Section>

          <Section title="Denúncias">
            {p.reports.length ? (
              <Panel>
                {p.reports.map((r, i) => (
                  <Row
                    key={r.id}
                    last={i === p.reports.length - 1}
                    title={reportReasonLabel(r.reason)}
                    sub={[r.reporter, dateBR(r.created_at), r.resolution?.toLowerCase()].filter(Boolean).join(' · ')}
                    badge={r.resolved_at ? <Badge tone="muted">RESOLVIDA</Badge> : <Badge tone="danger">ABERTA</Badge>}
                    onPress={() => router.push({ pathname: '/admin/denuncia/[id]', params: { id: r.id } })}
                  />
                ))}
              </Panel>
            ) : (
              <Empty text="Nenhuma." />
            )}
          </Section>

          <Section title="Últimos serviços">
            {p.orders_recent.length ? (
              <Panel>
                {p.orders_recent.map((o, i) => {
                  const line = orderLine(o);
                  return (
                    <Row
                      key={o.id}
                      last={i === p.orders_recent.length - 1}
                      title={o.other}
                      sub={line.text}
                      subDanger={line.danger}
                      right={
                        <Text variant="label" color={o.status === 'cancelado' ? colors.inkMuted : colors.ink} style={o.status === 'cancelado' ? { textDecorationLine: 'line-through' } : undefined}>
                          {formatBRL(Number(o.amount))}
                        </Text>
                      }
                    />
                  );
                })}
              </Panel>
            ) : (
              <Empty text="Nenhum." />
            )}
            {Number(p.stats.orders) > p.orders_recent.length ? <Empty text={`Mostrando os ${p.orders_recent.length} mais recentes de ${formatCount(Number(p.stats.orders))}.`} /> : null}
          </Section>

          <SuspendSheet visible={suspending} user={p.id} name={p.name} onClose={() => setSuspending(false)} onDone={reload} />
        </>
      ) : null}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.surface, boxShadow: shadows.card, gap: spacing[3] },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1] },
});
