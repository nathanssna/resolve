import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Segmented, Text } from '@/components';
import { AdminPage, Empty, Panel, Row, useAdminRpc } from '@/screens/admin/shared';
import { colors, radius } from '@/theme/tokens';
import { timeAgo } from '@/utils/format';

/** Canal oficial: as conversas com a equipe, as que esperam resposta primeiro. */
export default function AdminAtendimento() {
  const [only, setOnly] = useState<'espera' | 'todas'>('espera');
  const { data, loading, failed, reload } = useAdminRpc('admin_support_threads', { p_waiting: only === 'espera' });
  const list = data ?? [];

  return (
    <AdminPage title="Atendimento" loading={!data && loading} failed={!data && failed} onRetry={reload}>
      <Segmented
        value={only}
        onChange={setOnly}
        options={[
          { id: 'espera', label: 'Sem resposta' },
          { id: 'todas', label: 'Todas' },
        ]}
      />
      {list.length ? (
        <Panel>
          {list.map((t, i) => (
            <Row
              key={t.user_id}
              title={`${t.deleted ? 'Conta excluída' : t.name || 'Sem nome'} · ${t.role === 'profissional' ? 'profissional' : 'cliente'}`}
              sub={`${t.last_from_team ? 'Equipe: ' : ''}${t.last_body} · ${timeAgo(Date.parse(t.last_message_at))}`}
              badge={
                Number(t.unread) ? (
                  <View style={styles.count}>
                    <Text variant="overline" style={{ fontSize: 11 }}>
                      {String(t.unread)}
                    </Text>
                  </View>
                ) : undefined
              }
              onPress={() => router.push({ pathname: '/admin/atendimento/[id]', params: { id: t.user_id } })}
              last={i === list.length - 1}
            />
          ))}
        </Panel>
      ) : !loading ? (
        <Empty text={only === 'espera' ? 'Nenhuma mensagem esperando resposta.' : 'Ninguém escreveu ainda.'} />
      ) : null}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  count: { minWidth: 22, height: 22, borderRadius: radius.pill, paddingHorizontal: 6, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
});
