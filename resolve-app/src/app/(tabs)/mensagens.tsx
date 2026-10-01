import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ConversationRow, EmptyState, Text } from '@/components';
import { getProfessional, getService } from '@/data/catalog';
import { useApp, type Message } from '@/state/app';
import { colors, spacing } from '@/theme/tokens';
import { formatBRL, formatDay } from '@/utils/format';

function preview(m: Message) {
  switch (m.kind) {
    case 'request':
      return `Você: ${m.description}`;
    case 'proposal':
      return `Proposta: ${formatBRL(m.amount)} · ${m.when}`;
    case 'system':
      return m.text;
    default:
      return m.from === 'me' ? `Você: ${m.text}` : m.text;
  }
}

export default function Mensagens() {
  const { conversations, orders } = useApp();
  const sorted = [...conversations].sort((a, b) => (b.messages.at(-1)?.at ?? 0) - (a.messages.at(-1)?.at ?? 0));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <Text variant="titleLg" accessibilityRole="header">
          Mensagens
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing[6] }}>
        {sorted.map((c) => {
          const last = c.messages.at(-1)!;
          const order = orders.find((o) => o.id === c.orderId);
          return (
            <ConversationRow
              key={c.id}
              name={getProfessional(c.proId)?.name ?? ''}
              service={getService(c.serviceId)?.title ?? ''}
              preview={preview(last)}
              time={formatDay(last.at)}
              unread={c.unread}
              typing={c.typing}
              done={order?.status === 'concluido'}
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
            />
          );
        })}
        {sorted.length === 0 ? (
          <View style={{ padding: spacing[5], gap: spacing[4] }}>
            <EmptyState icon="message-circle" title="Nenhuma conversa ainda" description="Peça um orçamento e a conversa com o profissional aparece aqui." />
            <Button variant="primary" block onPress={() => router.push('/buscar')}>
              Encontrar um serviço
            </Button>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: { paddingHorizontal: spacing[5], paddingTop: spacing[4], paddingBottom: spacing[3] },
});
