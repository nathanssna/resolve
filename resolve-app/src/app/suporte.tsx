import { router, useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Bubble, Button, Composer, EmptyState, goBack, Icon, IconButton, SystemNote, Text, TopBar } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { useAuth } from '@/state/auth';
import { useSupport, type SupportMessage } from '@/state/support';
import { colors, spacing } from '@/theme/tokens';
import { notify } from '@/utils/dialog';
import { formatDayDivider } from '@/utils/format';

type Item = { key: string; day: string } | { key: string; message: SupportMessage };

/** Canal oficial: a conversa de quem está logado com a equipe da Rezolveaê. */
export default function Suporte() {
  const { session } = useAuth();
  const { avatarUrl, messages, unread, send, markRead } = useSupport();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();

  // Na tela, o que chega já fica lido.
  useEffect(() => {
    if (focused && unread) markRead();
  }, [focused, unread, markRead]);

  if (!session) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <TopBar title="Rezolveaê" />
        <View style={{ padding: spacing[5], gap: spacing[4] }}>
          <EmptyState icon="message-circle" title="Entre para falar com a Rezolveaê" />
          <Button variant="primary" block onPress={() => router.push('/entrar')}>
            Entrar
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  // Um separador a cada dia novo, como no chat dos pedidos.
  const items: Item[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    if (!prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString()) items.push({ key: `day-${m.id}`, day: formatDayDivider(m.at) });
    items.push({ key: m.id, message: m });
  });

  const onSend = (text: string) => send(text).catch((e) => notify(`Mensagem não enviada. ${authErrorMessage(e)}`));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.head}>
          <IconButton icon="arrow-left" label="Voltar" onPress={goBack} />
          <Avatar size={44} uri={avatarUrl} />
          <View style={{ flex: 1, gap: 1 }}>
            <View style={styles.name}>
              <Text variant="labelLg">Rezolveaê</Text>
              <Icon name="badge-check" size={16} strokeWidth={2.25} fill={colors.brand} label="Verificado" />
            </View>
            <Text variant="caption" color={colors.inkMuted}>
              Equipe Rezolveae
            </Text>
          </View>
        </View>

        <FlatList
          inverted
          data={items.toReversed()}
          keyExtractor={(item) => item.key}
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          ListFooterComponent={
            <View style={{ gap: spacing[3] }}>
              <SystemNote text="Canal oficial da Rezolveaê. Nunca pedimos senha, código ou pagamento." />
              {!messages.length ? (
                <Text variant="bodySm" color={colors.inkMuted} style={styles.hint}>
                  Conte o que aconteceu ou tire sua dúvida. A equipe responde por aqui.
                </Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) =>
            'day' in item ? (
              <SystemNote text={item.day} />
            ) : (
              <Bubble mine={!item.message.fromTeam} text={item.message.body} at={item.message.at} />
            )
          }
        />

        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
          <Composer onSend={onSend} placeholder="Escreva para a equipe" />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  name: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  list: { paddingVertical: spacing[4], gap: spacing[3] },
  hint: { textAlign: 'center', paddingHorizontal: spacing[6] },
  composer: { paddingHorizontal: spacing[4], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
});
