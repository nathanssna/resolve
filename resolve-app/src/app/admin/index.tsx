import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge, Field, Icon, IconButton, goBack, Text } from '@/components';
import { Empty, GatedPage, Panel, QueueCard, Row, Section, Stat, Stats, suspension, useAdminRpc, useQueue } from '@/screens/admin/shared';
import { colors, radius, spacing } from '@/theme/tokens';
import { formatBRL, formatCount } from '@/utils/format';

type Overview = {
  clients_new: number;
  pros_new: number;
  requests: number;
  requests_converted: number;
  orders_done: number;
  volume_done: number;
  orders_canceled: number;
  orders_canceled_late: number;
};

/** Quantos itens da fila aparecem aqui; o resto fica em "Ver todos". */
const QUEUE_MAX = 5;

/** Painel de moderação: o que precisa de decisão, os números da semana e a busca de pessoas. */
export default function AdminHome() {
  return (
    <GatedPage>
      <Home />
    </GatedPage>
  );
}

function Home() {
  const insets = useSafeAreaInsets();
  const queue = useQueue();
  const [days, setDays] = useState<7 | 30>(7);
  const { data } = useAdminRpc('admin_overview', { p_days: days });
  const o = data as Overview | null;
  const n = (v: number | undefined) => formatCount(Number(v ?? 0));

  // Busca quando a pessoa para de digitar.
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const people = useAdminRpc('admin_people', { p_query: query, p_filter: 'todos', p_limit: 5 });

  const pending = queue.items.length;
  const conversion = o?.requests ? Math.round((Number(o.requests_converted) / Number(o.requests)) * 100) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={{ paddingBottom: spacing[8] }}>
      <View style={[styles.hero, { paddingTop: insets.top + spacing[3] }]}>
        <View style={styles.page}>
          <View style={styles.heroTop}>
            <IconButton icon="arrow-left" label="Voltar" onPress={goBack} floating />
            <Text variant="display" accessibilityRole="header">
              Moderação
            </Text>
          </View>
          {queue.loading ? null : pending ? (
            <View style={styles.pill}>
              <Icon name="bell" size={16} color={colors.brand} />
              <Text variant="label" color={colors.onInk}>
                {pending === 1 ? '1 coisa para resolver' : `${n(pending)} coisas para resolver`}
              </Text>
            </View>
          ) : (
            <View style={styles.calm}>
              <Icon name="check" size={18} />
              <Text variant="label">Tudo em dia</Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.page, styles.body]}>
        <Section title="Para resolver" action={pending > QUEUE_MAX ? `Ver todos (${n(pending)})` : undefined} onAction={() => router.push('/admin/pendencias')}>
          {queue.items.slice(0, QUEUE_MAX).map((item) => (
            <QueueCard key={item.key} item={item} />
          ))}
          {!queue.loading && !pending ? <Empty text="Nenhuma denúncia, pedido de selo ou mensagem esperando." /> : null}
        </Section>

        <Section title={`Últimos ${days} dias`} action={days === 7 ? 'Ver o mês' : 'Ver a semana'} onAction={() => setDays(days === 7 ? 30 : 7)}>
          <Stats>
            <Stat value={o ? n(o.clients_new + o.pros_new) : '–'} label="cadastros novos" sub={o ? `${n(o.clients_new)} clientes · ${n(o.pros_new)} profissionais` : undefined} />
            <Stat value={o ? n(o.requests) : '–'} label="pedidos de orçamento" sub={o ? `${n(o.requests_converted)} viraram serviço (${conversion}%)` : undefined} />
            <Stat value={o ? n(o.orders_done) : '–'} label="serviços concluídos" sub={o ? `${formatBRL(Number(o.volume_done))} no total` : undefined} />
            <Stat value={o ? n(o.orders_canceled) : '–'} label="cancelamentos" sub={o ? `${n(o.orders_canceled_late)} em cima da hora` : undefined} />
          </Stats>
        </Section>

        <Section title="Buscar pessoa">
          <Field icon="search" placeholder="Nome ou e-mail" value={text} onChangeText={setText} onClear={() => setText('')} autoCapitalize="none" accessibilityLabel="Buscar pessoa" />
          {query ? (
            <Panel>
              {(people.data ?? []).map((p, i, all) => {
                const suspended = suspension(p.suspended_until);
                return (
                  <Row
                    key={p.id}
                    last={i === all.length - 1}
                    title={p.deleted ? 'Conta excluída' : p.name || 'Sem nome'}
                    sub={[p.role === 'profissional' ? p.role_title || 'Profissional' : 'Cliente', p.email].filter(Boolean).join(' · ')}
                    badge={
                      suspended ? (
                        <Badge tone="danger">SUSPENSA</Badge>
                      ) : p.reports_received ? (
                        <Badge tone="danger">{`${p.reports_received} ${Number(p.reports_received) === 1 ? 'DENÚNCIA' : 'DENÚNCIAS'}`}</Badge>
                      ) : p.verified ? (
                        <Badge tone="success" icon="badge-check">VERIFICADO</Badge>
                      ) : undefined
                    }
                    onPress={() => router.push({ pathname: '/admin/pessoa/[id]', params: { id: p.id } })}
                  />
                );
              })}
              {people.data && !people.data.length && !people.loading ? <Row title="Ninguém encontrado" last /> : null}
            </Panel>
          ) : null}
          <Panel>
            <Row title="Atendimento (canal oficial)" onPress={() => router.push('/admin/atendimento')} />
            <Row title="Todos os serviços combinados" last onPress={() => router.push('/admin/pedidos')} />
          </Panel>
        </Section>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[6],
    borderBottomLeftRadius: radius.sheet,
    borderBottomRightRadius: radius.sheet,
  },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: spacing[4] },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  calm: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  body: { padding: spacing[4], paddingTop: spacing[6], gap: spacing[6] },
});
