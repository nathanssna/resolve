import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, CatalogFallback, ConversationRow, EmptyState, Text } from '@/components';
import { useApp, type Message } from '@/state/app';
import { useCatalog } from '@/state/catalog';
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
  const { getService } = useCatalog();
  const { status, role, refresh, conversations } = useApp();
  // Já vem ordenado pela última mensagem.
  const sorted = conversations;

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
          // Uma linha por pessoa: mostra o pedido mais recente (e quantos há).
          const service = getService(c.latestJob?.serviceId)?.title ?? '';
          const more = c.jobs.length > 1 ? ` · ${c.jobs.length} pedidos` : '';
          return (
            <ConversationRow
              key={c.id}
              name={c.other.name}
              avatarUrl={c.other.avatarUrl}
              service={service + more}
              preview={preview(last)}
              time={formatDay(last.at)}
              unread={c.unread}
              done={c.latestJob?.state === 'concluido'}
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
            />
          );
        })}
        {status === 'idle' ? (
          <View style={{ padding: spacing[5], gap: spacing[4] }}>
            <EmptyState icon="message-circle" title="Entre para ver suas conversas" description="Seus pedidos de orçamento e as conversas com os profissionais ficam aqui." />
            <Button variant="primary" block onPress={() => router.push('/entrar')}>
              Entrar ou criar conta
            </Button>
          </View>
        ) : null}
        {status === 'loading' || status === 'error' ? (
          <View style={{ padding: spacing[5] }}>
            <CatalogFallback status={status} onRetry={refresh} />
          </View>
        ) : null}
        {status === 'ready' && sorted.length === 0 ? (
          <View style={{ padding: spacing[5], gap: spacing[4] }}>
            {role === 'profissional' ? (
              <EmptyState icon="message-circle" title="Nenhuma conversa ainda" description="Quando um cliente pedir um orçamento, a conversa aparece aqui." />
            ) : (
              <>
                <EmptyState icon="message-circle" title="Nenhuma conversa ainda" description="Peça um orçamento e a conversa com o profissional aparece aqui." />
                <Button variant="primary" block onPress={() => router.push('/buscar')}>
                  Encontrar um serviço
                </Button>
              </>
            )}
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
