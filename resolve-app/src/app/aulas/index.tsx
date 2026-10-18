import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, ProgressBar, Text, TopBar } from '@/components';
import { LESSONS, type Lesson } from '@/content/lessons';
import { lessonProgress, lessonSpots, lessonsWhySeen, markLessonsWhySeen, topicsOf, type LessonSpot } from '@/lib/lessons';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

const open = (l: Lesson) => router.push({ pathname: '/aulas/[id]', params: { id: l.id } });
const TOTAL_MIN = LESSONS.reduce((m, l) => m + l.minutes, 0);

/** Por que as aulas existem: abre sozinha na primeira visita e depois pelo "Por quê?". */
function WhySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
        <View style={styles.handle} />
        <Text variant="titleMd" accessibilityRole="header">
          Por que as aulas?
        </Text>
        <Text variant="body" color={colors.inkBody}>
          Pense no último serviço que você fez bem feito. O cliente ficou satisfeito, elogiou, talvez até tirou foto.
        </Text>
        <Text variant="body" color={colors.inkBody}>
          Agora pense no que veio em volta dele: o preço que você deu, o horário que combinou, a mensagem que respondeu, a nota que
          ele pediu. Ninguém ensina essa parte. E é ela que decide se sobra dinheiro no fim do mês e se o cliente te chama de novo.
        </Text>
        <Text variant="body" color={colors.inkBody}>
          É disso que as aulas falam. Todo profissional da Rezolveaê passa por elas.
        </Text>
        <View style={styles.facts}>
          <View style={styles.fact}>
            <Icon name="clock" size={18} color={colors.inkBody} />
            <Text variant="label" color={colors.inkBody} style={{ flex: 1 }}>{`São ${TOTAL_MIN} minutos, uma vez só.`}</Text>
          </View>
          <View style={styles.fact}>
            <Icon name="check" size={18} color={colors.inkBody} />
            <Text variant="label" color={colors.inkBody} style={{ flex: 1 }}>
              Não é prova: errou, é só tentar de novo.
            </Text>
          </View>
          <View style={styles.fact}>
            <Icon name="book-open" size={18} color={colors.inkBody} />
            <Text variant="label" color={colors.inkBody} style={{ flex: 1 }}>
              Dá para parar e continuar depois.
            </Text>
          </View>
        </View>
        <Button variant="dark" block onPress={onClose} style={{ marginTop: spacing[2] }}>
          Entendi
        </Button>
      </View>
    </Modal>
  );
}

/**
 * As cinco aulas da Rezolveaê: obrigatórias para aparecer aos clientes; depois, ficam para reler.
 * Vão em ordem: cada uma abre depois de concluir a anterior. Topo com o quanto falta, a aula da vez em
 * destaque (com "Continuar" se parou no meio) e a lista enxuta.
 */
export default function Aulas() {
  const [done, setDone] = useState<string[] | null>(null);
  const [spots, setSpots] = useState<Record<string, LessonSpot>>({});
  const [why, setWhy] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      lessonProgress().then(
        async (ids) => {
          if (!alive) return;
          setDone(ids);
          // Primeira visita com aulas pendentes: mostra o porquê uma vez.
          if (ids.length < LESSONS.length && !(await lessonsWhySeen()) && alive) {
            markLessonsWhySeen();
            setWhy(true);
          }
        },
        () => alive && setDone([]),
      );
      lessonSpots().then((s) => alive && setSpots(s));
      return () => {
        alive = false;
      };
    }, []),
  );

  const isDone = (l: Lesson) => !!done?.includes(l.id);
  const pending = LESSONS.filter((l) => !isDone(l));
  const finished = LESSONS.length - pending.length;
  // A aula da vez é a primeira que falta; as seguintes ficam fechadas até ela ser concluída.
  const next = pending[0];
  const nextSpot = next ? spots[next.id] : undefined;
  const nextTopics = next ? topicsOf(next).length : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Aulas da Rezolveaê" />
      {done ? (
        <ScrollView contentContainerStyle={styles.content}>
          {next ? (
            <View style={{ gap: spacing[3] }}>
              <View style={styles.summaryRow}>
                <Text variant="titleMd" style={styles.strong}>{`${finished} de ${LESSONS.length} concluídas`}</Text>
                <Text variant="label" color={colors.inkMuted}>{`faltam ${pending.reduce((m, l) => m + l.minutes, 0)} min`}</Text>
              </View>
              <ProgressBar value={finished / LESSONS.length} tone="brand" />
              <View style={styles.required}>
                <Icon name="shield-check" size={16} color={colors.inkBody} />
                <Text variant="bodySm" color={colors.inkBody}>
                  Obrigatórias para aparecer aos clientes ·
                </Text>
                <Pressable accessibilityRole="button" onPress={() => setWhy(true)} hitSlop={10}>
                  <Text variant="bodySm" style={styles.whyLink}>
                    Por quê?
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.allDone}>
              <View style={styles.allDoneIcon}>
                <Icon name="check" size={24} color={colors.success} strokeWidth={2.6} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="titleMd" style={styles.strong}>{`Você concluiu as ${LESSONS.length} aulas`}</Text>
                <Text variant="label" color={colors.inkMuted}>
                  Elas ficam aqui para reler quando quiser.
                </Text>
              </View>
            </View>
          )}

          {next ? (
            <View style={styles.featured}>
              <Text variant="overline" color={colors.inkMuted}>
                {`${nextSpot ? 'CONTINUE DE ONDE PAROU · AULA' : 'PRÓXIMA AULA ·'} ${LESSONS.indexOf(next) + 1} DE ${LESSONS.length}`}
              </Text>
              <Text variant="titleLg" style={styles.featuredTitle}>
                {next.title}
              </Text>
              <Text variant="body" color={colors.inkBody}>
                {next.summary}
              </Text>
              {nextSpot ? (
                <View style={styles.topicRow}>
                  <View style={styles.topics} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                    {Array.from({ length: nextTopics }, (_, i) => (
                      <View key={i} style={[styles.topic, i <= nextSpot.page && { backgroundColor: colors.ink }]} />
                    ))}
                  </View>
                  <Text variant="label" style={styles.strong}>{`Tópico ${nextSpot.page + 1} de ${nextTopics}`}</Text>
                </View>
              ) : (
                <Text variant="label" color={colors.inkMuted}>{`${next.minutes} min · ${nextTopics} tópicos`}</Text>
              )}
              <Button variant="primary" block iconRight="arrow-right" onPress={() => open(next)} style={{ marginTop: spacing[2] }}>
                {nextSpot ? 'Continuar' : 'Começar a aula'}
              </Button>
            </View>
          ) : null}

          <View style={{ gap: spacing[1] }}>
            <Text variant="label" color={colors.inkMuted} style={styles.listTitle}>
              {next ? 'Todas as aulas' : 'Para reler'}
            </Text>
            {LESSONS.map((l, i) => {
              const ok = isDone(l);
              const now = l === next;
              const closed = !ok && !now;
              const spot = ok ? undefined : spots[l.id];
              const where = spot ? `tópico ${spot.page + 1} de ${topicsOf(l).length}` : `${l.minutes} min`;
              return (
                <Pressable
                  key={l.id}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: closed }}
                  disabled={closed}
                  onPress={() => open(l)}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.num, ok && { backgroundColor: colors.successTint }, now && { backgroundColor: colors.ink }]}>
                    {ok ? (
                      <Icon name="check" size={18} color={colors.success} strokeWidth={2.6} />
                    ) : (
                      <Text variant="label" color={now ? colors.onInk : colors.inkMuted} style={styles.strong}>
                        {String(i + 1)}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text variant="labelLg" color={closed ? colors.inkMuted : colors.ink}>
                      {l.title}
                    </Text>
                    <Text variant="caption" color={ok ? colors.success : now ? colors.ink : colors.inkMuted} style={styles.semi}>
                      {ok ? 'Concluída' : now ? `Agora · ${where}` : `${l.minutes} min · abre depois da aula ${i}`}
                    </Text>
                  </View>
                  <Icon name={closed ? 'lock' : 'chevron-right'} size={18} color={colors.inkMuted} />
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : null}
      <WhySheet visible={why} onClose={() => setWhy(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[5], paddingTop: spacing[2], gap: spacing[6], paddingBottom: spacing[8] },
  strong: { fontFamily: fonts.extrabold },
  semi: { fontFamily: fonts.semibold },
  summaryRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing[3] },
  required: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  whyLink: { fontFamily: fonts.bold, color: colors.ink, textDecorationLine: 'underline' },
  backdrop: { flex: 1, backgroundColor: 'rgba(17,18,19,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: spacing[5], paddingTop: spacing[3], gap: spacing[3] },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceStrong, marginBottom: spacing[1] },
  facts: { gap: 10, marginTop: spacing[1] },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  allDone: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  allDoneIcon: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.successTint, alignItems: 'center', justifyContent: 'center' },
  featured: { backgroundColor: colors.surfaceMuted, borderRadius: radius.xl, padding: spacing[5], gap: 10 },
  featuredTitle: { fontSize: 22, lineHeight: 28 },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  topics: { flex: 1, flexDirection: 'row', gap: 4 },
  topic: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceStrong },
  listTitle: { paddingHorizontal: spacing[1], marginBottom: spacing[1] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: spacing[1], borderBottomWidth: 1, borderBottomColor: colors.line },
  num: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
});
