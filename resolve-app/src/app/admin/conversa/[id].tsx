import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { AdminPage, dateBR, useAdminRpc } from '@/screens/admin/shared';
import { colors, radius, spacing } from '@/theme/tokens';
import { formatTime } from '@/utils/format';

/** Conversa de uma denúncia (só leitura; o acesso fica registrado). Em vermelho, quem foi denunciado. */
export default function AdminConversa() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, failed, reload } = useAdminRpc('admin_report_conversation', { p_report_id: id });

  return (
    <AdminPage title="Conversa denunciada" loading={!data && loading} failed={!data && failed} onRetry={reload}>
      <Text variant="caption" color={colors.inkMuted}>
        Só leitura. Este acesso fica registrado.
      </Text>
      {(data ?? []).map((m) =>
        m.kind === 'system' ? (
          <Text key={m.id} variant="caption" color={colors.inkMuted} style={styles.system}>
            {m.body}
          </Text>
        ) : (
          <View key={m.id} style={[styles.msg, m.from_reported && styles.reported]}>
            <Text variant="caption" color={m.from_reported ? colors.danger : colors.inkMuted}>
              {`${m.sender_name} · ${dateBR(m.created_at)} ${formatTime(Date.parse(m.created_at))}${m.kind === 'request' ? ' · pedido' : m.kind === 'proposal' ? ' · proposta' : ''}`}
            </Text>
            <Text variant="body" color={colors.ink} selectable>
              {m.body ?? ''}
            </Text>
          </View>
        ),
      )}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  msg: { padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.surface, gap: 2 },
  reported: { backgroundColor: colors.dangerTint },
  system: { alignSelf: 'center', textAlign: 'center' },
});
