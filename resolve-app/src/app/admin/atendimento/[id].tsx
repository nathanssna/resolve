import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Avatar, Bubble, Composer, SystemNote, Text } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { supabase } from '@/lib/supabase';
import { AdminPage, useAdminRpc } from '@/screens/admin/shared';
import { colors, spacing } from '@/theme/tokens';
import { notify } from '@/utils/dialog';
import { formatDayDivider } from '@/utils/format';

type Conversation = {
  person: { id: string; name: string; role: string; avatar_url: string | null; deleted: boolean };
  messages: { id: string; from_team: boolean; body: string; created_at: string }[];
};

/** A conversa de uma pessoa com a equipe: o que a equipe escreve chega como "Rezolveaê". Abrir fica registrado. */
export default function AdminAtendimentoConversa() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, failed, reload } = useAdminRpc('admin_support_messages', { p_user: id });
  const c = data as Conversation | null;

  const send = async (text: string) => {
    const { error } = await supabase.rpc('admin_send_support', { p_user: id, p_body: text });
    if (error) notify(authErrorMessage(error));
    else reload();
  };

  return (
    <AdminPage
      title="Atendimento"
      surface
      loading={!c && loading}
      failed={!c && failed}
      onRetry={reload}
      footer={c && !c.person.deleted ? <Composer onSend={send} placeholder={`Responder como Rezolveaê`} /> : undefined}
    >
      {c ? (
        <>
          <View style={styles.who}>
            <Avatar size={48} uri={c.person.avatar_url ?? undefined} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                variant="labelLg"
                style={styles.link}
                onPress={() => router.push({ pathname: '/admin/pessoa/[id]', params: { id: c.person.id } })}
              >
                {c.person.deleted ? 'Conta excluída' : c.person.name || 'Sem nome'}
              </Text>
              <Text variant="caption" color={colors.inkMuted}>
                {c.person.role === 'profissional' ? 'Profissional' : 'Cliente'} · fica registrado que você abriu
              </Text>
            </View>
          </View>
          <View style={{ gap: spacing[3] }}>
            {c.messages.length ? (
              c.messages.map((m, i) => {
                const at = Date.parse(m.created_at);
                const prev = c.messages[i - 1];
                const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(at).toDateString();
                return (
                  <View key={m.id} style={{ gap: spacing[3] }}>
                    {newDay ? <SystemNote text={formatDayDivider(at)} /> : null}
                    {/* Do lado da equipe: o que ela escreveu fica à direita. */}
                    <Bubble mine={m.from_team} text={m.body} at={at} />
                  </View>
                );
              })
            ) : (
              <Text variant="bodySm" color={colors.inkMuted}>
                Nenhuma mensagem ainda. O que você escrever chega para a pessoa como Rezolveaê.
              </Text>
            )}
          </View>
        </>
      ) : null}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  link: { textDecorationLine: 'underline' },
});
