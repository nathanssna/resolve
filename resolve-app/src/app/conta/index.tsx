import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Button, ListRow, Text, TopBar } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/state/app';
import { useAuth } from '@/state/auth';
import { colors, radius, spacing } from '@/theme/tokens';
import { notify } from '@/utils/dialog';

type Person = { id: string; name: string; avatarUrl?: string };

/** Conta e privacidade: documentos, pessoas bloqueadas e excluir conta. */
export default function Conta() {
  const { session } = useAuth();
  const { blocked, unblock } = useApp();
  const [people, setPeople] = useState<{ key: string; list: Person[] } | null>(null);
  const key = blocked.join();
  const list = people?.key === key ? people.list : blocked.map((id): Person => ({ id, name: '…' }));

  // Nomes de quem eu bloqueei (o profile é legível: profissional ou alguém com quem conversei).
  useEffect(() => {
    if (!key) return;
    let alive = true;
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', key.split(','))
      .then(({ data }) => {
        if (!alive || !data) return;
        const byId = new Map(data.map((p) => [p.id, p]));
        setPeople({
          key,
          list: key.split(',').map((id) => ({ id, name: byId.get(id)?.full_name.trim() || 'Usuário', avatarUrl: byId.get(id)?.avatar_url ?? undefined })),
        });
      });
    return () => {
      alive = false;
    };
  }, [key]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Conta e privacidade" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.group}>
          <ListRow icon="file-text" value="Termos de uso" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'termos' } })} />
          <ListRow icon="shield-check" value="Política de privacidade" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacidade' } })} />
        </View>

        {session ? (
          <View style={{ gap: spacing[3] }}>
            <Text variant="titleSm" accessibilityRole="header">
              Pessoas bloqueadas
            </Text>
            {list.length === 0 ? (
              <Text variant="bodySm" color={colors.inkMuted}>
                Ninguém. Para bloquear alguém, use o menu ⋮ da conversa.
              </Text>
            ) : (
              list.map((p) => (
                <View key={p.id} style={styles.person}>
                  <Avatar size={40} uri={p.avatarUrl} />
                  <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Button variant="secondary" size="md" onPress={() => unblock(p.id).catch((e) => notify(authErrorMessage(e)))}>
                    Desbloquear
                  </Button>
                </View>
              ))
            )}
          </View>
        ) : null}

        {session ? (
          <View style={styles.group}>
            <ListRow icon="trash-2" value="Excluir minha conta" danger onPress={() => router.push('/conta/excluir')} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[4], paddingTop: spacing[2], gap: spacing[6], paddingBottom: spacing[8] },
  group: { gap: 2 },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.surfaceMuted },
});
