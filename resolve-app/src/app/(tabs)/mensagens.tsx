import { router } from 'expo-router';
import { Fragment, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, CatalogFallback, ConversationRow, EmptyState, Icon, Text } from '@/components';
import { useApp, type Message } from '@/state/app';
import { useCatalog } from '@/state/catalog';
import { useSupport } from '@/state/support';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import { formatBRL, formatDay } from '@/utils/format';

/** Para a busca: minúsculas e sem acento ("João" acha "joao"). */
const plain = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function preview(m: Message) {
  switch (m.kind) {
    case 'request':
      // Quem pede é o cliente: para o profissional, o pedido é fala do outro.
      return m.from === 'me' ? `Você: ${m.description}` : m.description;
    case 'proposal':
      return `Proposta: ${formatBRL(m.amount)} · ${m.when}`;
    case 'system':
      return m.text;
    default:
      return m.from === 'me' ? `Você: ${m.text}` : m.text;
  }
}

export default function Mensagens() {
  const { getService, getProfessional } = useCatalog();
  const { status, role, refresh, conversations } = useApp();
  const support = useSupport();
  const [query, setQuery] = useState('');
  const lastSupport = support.messages.at(-1);
  // Já vem ordenado pela última mensagem.
  const sorted = conversations;

  // Conversas e o canal da Rezolveaê (quando já tem mensagem) juntos, pela última mensagem.
  const rows = [
    ...(lastSupport
      ? [
          {
            key: 'suporte',
            at: lastSupport.at,
            text: `Rezolveaê ${lastSupport.body}`,
            node: (
              <ConversationRow
                name="Rezolveaê"
                avatarUrl={support.avatarUrl}
                verified
                preview={lastSupport.fromTeam ? lastSupport.body : `Você: ${lastSupport.body}`}
                time={formatDay(lastSupport.at)}
                unread={support.unread}
                onPress={() => router.push('/suporte')}
              />
            ),
          },
        ]
      : []),
    ...sorted.map((c) => {
      const last = c.messages.at(-1)!;
      // Uma linha por pessoa: mostra o pedido mais recente (e quantos há).
      const service = getService(c.latestJob?.serviceId)?.title ?? '';
      const more = c.jobs.length > 1 ? ` · ${c.jobs.length} pedidos` : '';
      return {
        key: c.id,
        at: last.at,
        text: `${c.other.name} ${service} ${preview(last)}`,
        node: (
          <ConversationRow
            name={c.other.name}
            avatarUrl={c.other.avatarUrl}
            verified={getProfessional(c.other.id)?.verified}
            // Profissional: só nome e última mensagem (o nome do serviço daria a entender que é a profissão do cliente).
            service={role === 'profissional' ? undefined : service + more}
            preview={preview(last)}
            time={formatDay(last.at)}
            unread={c.unread}
            done={c.latestJob?.state === 'concluido'}
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
          />
        ),
      };
    }),
  ].sort((a, b) => b.at - a.at);
  const q = plain(query.trim());
  const shown = q ? rows.filter((r) => plain(r.text).includes(q)) : rows;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <Text variant="titleLg" accessibilityRole="header">
          Mensagens
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing[6] }}>
        {rows.length ? (
          <View style={styles.searchWrap}>
            <View style={styles.search}>
              <Icon name="search" size={18} strokeWidth={2.25} color={colors.inkMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar conversa"
                placeholderTextColor={colors.inkMuted}
                accessibilityLabel="Buscar conversa"
                returnKeyType="search"
                autoCorrect={false}
                style={styles.searchInput}
              />
              {query ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" hitSlop={8} onPress={() => setQuery('')}>
                  <Icon name="x" size={18} strokeWidth={2.25} color={colors.inkMuted} />
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
        {q && !shown.length ? (
          <Text variant="bodySm" color={colors.inkMuted} style={{ textAlign: 'center', padding: spacing[5] }}>
            Nenhuma conversa encontrada.
          </Text>
        ) : null}
        {shown.map((row, i) => (
          <Fragment key={row.key}>
            {/* Linha fina entre conversas, começando no nome (depois da foto). */}
            {i > 0 ? <View style={styles.divider} /> : null}
            {row.node}
          </Fragment>
        ))}
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
        {status === 'ready' && sorted.length === 0 && !lastSupport ? (
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
  // Margem = recuo da linha (20) + foto (52) + espaço até o nome (12).
  divider: { height: 1, backgroundColor: colors.line, marginLeft: spacing[5] + 52 + spacing[3] },
  searchWrap: { paddingHorizontal: spacing[5], paddingBottom: spacing[2] },
  // Campo cinza, sem sombra nem borda (como os blocos do app).
  search: { height: 44, flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[4], borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.ink, paddingVertical: 0, outlineStyle: 'none' } as never,
  head: { paddingHorizontal: spacing[5], paddingTop: spacing[4], paddingBottom: spacing[3] },
});
