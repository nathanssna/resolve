import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionSheet, Badge, Segmented, Text } from '@/components';
import { AdminPage, dateBR, Panel, useAdminRpc } from '@/screens/admin/shared';
import { colors, radius, spacing } from '@/theme/tokens';
import { formatBRL } from '@/utils/format';
import { formatSchedule, fromScheduledAt } from '@/utils/schedule';

const FILTERS = [
  { id: 'combinado', label: 'Combinados' },
  { id: 'concluido', label: 'Concluídos' },
  { id: 'cancelado', label: 'Cancelados' },
] as const;

/** Serviços combinados, do mais recente; tocar abre o cliente ou o profissional. */
export default function AdminPedidos() {
  const [status, setStatus] = useState<(typeof FILTERS)[number]['id']>('combinado');
  const { data, loading, failed, reload } = useAdminRpc('admin_orders', { p_status: status, p_limit: 100 });
  const [picked, setPicked] = useState<{ client: [string, string]; pro: [string, string] } | null>(null);

  return (
    <AdminPage title="Pedidos e serviços" failed={!data && failed} onRetry={reload}>
      <Segmented value={status} onChange={setStatus} options={FILTERS.map((f) => ({ id: f.id, label: f.label }))} />
      <Panel>
        {(data ?? []).map((o) => (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            onPress={() => setPicked({ client: [o.client_id, o.client_name], pro: [o.professional_id, o.pro_name] })}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}
          >
            <View style={styles.top}>
              <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>
                {o.service}
              </Text>
              <Text variant="label">{formatBRL(Number(o.amount))}</Text>
            </View>
            <Text variant="caption" color={colors.inkBody} numberOfLines={1}>
              {`${o.client_name} → ${o.pro_name}`}
            </Text>
            <Text variant="caption" color={colors.inkMuted}>
              {`${o.scheduled_at ? formatSchedule(fromScheduledAt(Date.parse(o.scheduled_at))) : o.scheduled_label} · combinado em ${dateBR(o.created_at)}`}
            </Text>
            {o.canceled_late ? (
              <View style={{ gap: 2 }}>
                <Badge tone="danger">EM CIMA DA HORA</Badge>
                {o.cancel_reason ? (
                  <Text variant="caption" color={colors.inkBody}>
                    {o.cancel_reason}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </Pressable>
        ))}
        {data && !data.length ? (
          <Text variant="bodySm" color={colors.inkMuted} style={styles.empty}>
            {loading ? 'Carregando…' : 'Nenhum.'}
          </Text>
        ) : null}
        {!data && loading ? (
          <Text variant="bodySm" color={colors.inkMuted} style={styles.empty}>
            Carregando…
          </Text>
        ) : null}
      </Panel>
      <ActionSheet
        visible={!!picked}
        onClose={() => setPicked(null)}
        actions={
          picked
            ? [
                { icon: 'user-round', label: `Cliente: ${picked.client[1]}`, onPress: () => router.push({ pathname: '/admin/pessoa/[id]', params: { id: picked.client[0] } }) },
                { icon: 'briefcase', label: `Profissional: ${picked.pro[1]}`, onPress: () => router.push({ pathname: '/admin/pessoa/[id]', params: { id: picked.pro[0] } }) },
              ]
            : []
        }
      />
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2, paddingVertical: spacing[3], paddingHorizontal: spacing[2], borderRadius: radius.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  empty: { padding: spacing[3] },
});
