import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, EmptyState, Icon, StickyFooter, Text, TopBar } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { completeLesson, lessonProgress, lessonSpots, saveLessonSpot, topicsOf, type Topic } from '@/lib/lessons';
import { LESSONS, type Lesson, type LessonBlock } from '@/content/lessons';
import { useAuth } from '@/state/auth';
import { useCatalog } from '@/state/catalog';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import { notify } from '@/utils/dialog';

function Block({ b }: { b: LessonBlock }) {
  const wrap = styles.block;
  switch (b.kind) {
    case 'mark':
      return (
        <View style={styles.mark}>
          <Text variant="titleSm" style={styles.markText}>
            {b.text}
          </Text>
        </View>
      );
    case 'say':
      return (
        <View style={[wrap, { alignItems: b.mine ? 'flex-end' : 'flex-start', gap: 4 }]}>
          <Text variant="caption" color={colors.inkMuted}>
            {b.from}
          </Text>
          <View style={[styles.bubble, b.mine && styles.bubbleMine]}>
            <Text variant="body">{b.text}</Text>
          </View>
        </View>
      );
    case 'ledger':
      return (
        <View style={styles.ledger}>
          <Text variant="overline" color={colors.inkMuted}>
            {b.title.toUpperCase()}
          </Text>
          {b.rows.map((r) => (
            <View key={r.label} style={styles.ledgerRow}>
              <Text variant="body" color={colors.inkBody} style={{ flex: 1 }}>
                {r.label}
              </Text>
              <Text variant="labelLg">{r.value}</Text>
            </View>
          ))}
          <View style={[styles.ledgerRow, styles.ledgerTotal]}>
            <Text variant="labelLg" style={{ flex: 1 }}>
              {b.total.label}
            </Text>
            <Text variant="titleSm">{b.total.value}</Text>
          </View>
        </View>
      );
    default:
      return (
        <View style={wrap}>
          <Text style={styles.paragraph}>{b.text}</Text>
        </View>
      );
  }
}

/** Embaralha as alternativas de uma pergunta (a primeira do conteúdo é a certa). */
const shuffle = (n: number) => {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
};

/** Perguntas do fim: uma por vez; errou, vê o porquê e pode reler a aula. */
function Questions({ lesson, onReread, onDone }: { lesson: Lesson; onReread: () => void; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [orders] = useState(() => lesson.questions.map((q) => shuffle(q.options.length)));
  const [picked, setPicked] = useState<number | null>(null);
  const q = lesson.questions[index];
  const right = picked === 0;
  const last = index === lesson.questions.length - 1;

  return (
    <>
      <ScrollView contentContainerStyle={styles.qContent}>
        <View style={styles.dots} accessibilityLabel={`Pergunta ${index + 1} de ${lesson.questions.length}`}>
          {lesson.questions.map((_, i) => (
            <View key={i} style={[styles.dot, i < index && { backgroundColor: colors.success }, i === index && { backgroundColor: colors.ink }]} />
          ))}
        </View>
        <Text variant="titleMd" accessibilityRole="header">
          {q.question}
        </Text>
        <View accessibilityRole="radiogroup" style={{ gap: spacing[2] }}>
          {orders[index].map((o) => {
            const chosen = picked === o;
            return (
              <Pressable
                key={q.options[o]}
                accessibilityRole="radio"
                accessibilityState={{ checked: chosen, disabled: picked !== null }}
                disabled={picked !== null}
                onPress={() => setPicked(o)}
                style={[styles.option, chosen && (right ? styles.optionRight : styles.optionWrong)]}
              >
                <Text variant={chosen ? 'labelLg' : 'body'} style={{ flex: 1 }}>
                  {q.options[o]}
                </Text>
                {chosen ? <Icon name={right ? 'check' : 'x'} size={18} color={right ? colors.success : colors.danger} /> : null}
              </Pressable>
            );
          })}
        </View>
        {picked !== null ? (
          <View style={styles.feedback} accessibilityLiveRegion="polite">
            <Text variant="labelLg">{right ? 'Isso.' : 'Ainda não.'}</Text>
            {/* O porquê só depois de acertar: ao errar, a resposta está na aula. */}
            <Text variant="body" color={colors.inkBody}>
              {right ? q.why : 'A resposta está na aula. Releia o trecho e tente de novo.'}
            </Text>
            {!right ? (
              <Button variant="link" onPress={onReread} style={{ alignSelf: 'flex-start' }}>
                Reler a aula
              </Button>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      <StickyFooter>
        {picked === null ? (
          <Text variant="bodySm" color={colors.inkMuted} style={{ textAlign: 'center' }}>
            Escolha uma resposta.
          </Text>
        ) : right ? (
          <Button
            variant="primary"
            block
            onPress={() => {
              if (last) return onDone();
              setIndex(index + 1);
              setPicked(null);
            }}
          >
            {last ? 'Concluir a aula' : 'Próxima pergunta'}
          </Button>
        ) : (
          <Button variant="dark" block onPress={() => setPicked(null)}>
            Tentar de novo
          </Button>
        )}
      </StickyFooter>
    </>
  );
}

/** Lista de tópicos (toque no contador): os seguintes abrem conforme a pessoa lê. */
function TopicsSheet({
  visible,
  topics,
  page,
  furthest,
  onPick,
  onClose,
}: {
  visible: boolean;
  topics: Topic[];
  page: number;
  furthest: number;
  onPick: (i: number) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHead}>
          <Text variant="titleMd" accessibilityRole="header">
            Tópicos da aula
          </Text>
          <Text variant="label" color={colors.inkMuted}>{`${page + 1} de ${topics.length}`}</Text>
        </View>
        {topics.map((t, i) => {
          const current = i === page;
          const read = i < furthest && !current;
          const locked = i > furthest;
          return (
            <Pressable
              key={t.title}
              accessibilityRole="button"
              accessibilityState={{ disabled: locked, selected: current }}
              disabled={locked}
              onPress={() => onPick(i)}
              style={({ pressed }) => [styles.topicRow, current && { backgroundColor: colors.brandTint }, pressed && { opacity: 0.85 }]}
            >
              <View style={[styles.topicNum, read && { backgroundColor: colors.successTint }, current && { backgroundColor: colors.ink }]}>
                {read ? (
                  <Icon name="check" size={16} color={colors.success} />
                ) : (
                  <Text variant="label" color={current ? colors.onInk : colors.inkMuted}>
                    {String(i + 1)}
                  </Text>
                )}
              </View>
              <Text variant={current ? 'labelLg' : 'body'} color={locked ? colors.inkMuted : colors.ink} style={{ flex: 1 }}>
                {t.title}
              </Text>
              {current ? <Text variant="label">Lendo</Text> : null}
            </Pressable>
          );
        })}
        {furthest < topics.length - 1 ? (
          <Text variant="bodySm" color={colors.inkMuted} style={[styles.center, { marginTop: spacing[2] }]}>
            Os tópicos seguintes abrem conforme você lê.
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}

/** Aula: lida um tópico por vez e, no fim, as perguntas. Concluir registra no banco. */
export default function Aula() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { getProfessional, refresh: refreshCatalog } = useCatalog();
  const me = getProfessional(session?.user.id);
  const index = LESSONS.findIndex((l) => l.id === id);
  const lesson = LESSONS[index];
  const next = LESSONS[index + 1];

  const [phase, setPhase] = useState<'read' | 'questions' | 'done'>('read');
  const [page, setPage] = useState(0);
  // Até onde já leu; quem concluiu as aulas pode ir direto a qualquer tópico.
  const [furthest, setFurthest] = useState(() => (me?.lessonsDone ? Infinity : 0));
  const [topicsOpen, setTopicsOpen] = useState(false);
  // Volta ao tópico em que a pessoa parou; até ler isso, não mostra a abertura à toa.
  // As aulas vão em ordem: esta só abre depois de concluir a anterior.
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const previous = LESSONS[index - 1];
  useEffect(() => {
    if (!lesson) return;
    let alive = true;
    Promise.all([lessonSpots(), previous ? lessonProgress().catch(() => null) : null]).then(([spots, doneIds]) => {
      if (!alive) return;
      if (previous && doneIds && !doneIds.includes(previous.id)) setLocked(true);
      const spot = spots[lesson.id];
      const max = topicsOf(lesson).length - 1;
      if (spot) {
        setPage(Math.min(spot.page, max));
        setFurthest((f) => Math.max(f, Math.min(spot.furthest, max)));
      }
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [lesson, previous]);
  const [result, setResult] = useState<{ done: number; total: number; released: boolean } | null>(null);
  const scroll = useRef<ScrollView>(null);

  const goTo = (i: number) => {
    const reached = Math.max(furthest, i);
    setPage(i);
    setFurthest(reached);
    setTopicsOpen(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
    saveLessonSpot(lesson.id, { page: i, furthest: Math.min(reached, topicsOf(lesson).length - 1) });
  };

  const finish = async () => {
    try {
      const r = await completeLesson(lesson.id);
      saveLessonSpot(lesson.id, null);
      setResult(r);
      setPhase('done');
      refreshCatalog({ silent: true });
    } catch (e) {
      notify(`Não foi possível registrar a aula. ${authErrorMessage(e)}`);
    }
  };

  if (!lesson) {
    return (
      <SafeAreaView style={styles.safe}>
        <TopBar title="Aula" />
        <View style={{ padding: spacing[5] }}>
          <EmptyState icon="book-open" title="Aula não encontrada" />
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------- concluída
  if (phase === 'done') {
    const all = result && result.done === result.total;
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.doneContent}>
          <View style={styles.doneIcon}>
            <Icon name="book-open" size={44} />
          </View>
          <Text variant="overline" color={colors.inkMuted}>
            AULA CONCLUÍDA
          </Text>
          <Text variant="titleLg" accessibilityRole="header" style={styles.center}>
            {lesson.title}
          </Text>
          {result ? (
            <>
              <View style={styles.doneDots} accessibilityLabel={`${result.done} de ${result.total} aulas concluídas`}>
                {Array.from({ length: result.total }, (_, i) => (
                  <View key={i} style={[styles.doneDot, i < result.done && { backgroundColor: colors.brand }]} />
                ))}
              </View>
              <Text variant="bodySm" color={colors.inkMuted} style={styles.center}>
                {result.released
                  ? 'Pronto, você foi liberado: seu perfil já aparece para os clientes.'
                  : all
                    ? 'Você concluiu as aulas. Falta pouco: veja no Início o que ainda falta.'
                    : `${result.done} de ${result.total} aulas concluídas.`}
              </Text>
            </>
          ) : null}
          {next && !all ? (
            <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: '/aulas/[id]', params: { id: next.id } })} style={styles.nextCard}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="caption" color={colors.inkMuted}>{`Próxima · ${next.minutes} min`}</Text>
                <Text variant="labelLg">{next.title}</Text>
              </View>
              <Icon name="chevron-right" size={18} color={colors.inkMuted} />
            </Pressable>
          ) : null}
        </ScrollView>
        <StickyFooter>
          {next && !all ? (
            <>
              <Button variant="primary" block onPress={() => router.replace({ pathname: '/aulas/[id]', params: { id: next.id } })}>
                Ler a próxima
              </Button>
              <Button variant="link" onPress={() => router.back()} style={{ alignSelf: 'center' }}>
                Agora não
              </Button>
            </>
          ) : (
            <Button variant="primary" block onPress={() => router.replace('/inicio')}>
              Voltar ao início
            </Button>
          )}
        </StickyFooter>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------- perguntas
  if (phase === 'questions') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar title="Perguntas" onBack={() => setPhase('read')} />
        <Questions
          lesson={lesson}
          onReread={() => {
            setPage(0);
            setPhase('read');
          }}
          onDone={finish}
        />
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------- leitura
  if (!ready) return <SafeAreaView style={styles.safe} />;
  if (locked) {
    return (
      <SafeAreaView style={styles.safe}>
        <TopBar title="Aulas da Rezolveaê" />
        <View style={{ padding: spacing[5] }}>
          <EmptyState icon="lock" title="Esta aula ainda não abriu" description={`Conclua antes a aula ${index}: ${previous.title}.`} />
        </View>
      </SafeAreaView>
    );
  }
  const topics = topicsOf(lesson);
  const topic = topics[page];
  const last = page === topics.length - 1;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar a aula" onPress={() => router.back()} hitSlop={4} style={styles.close}>
            <Icon name="x" size={20} />
          </Pressable>
          <View style={{ flex: 1, gap: 1 }}>
            <Text variant="overline" color={colors.inkMuted}>{`AULA ${index + 1} DE ${LESSONS.length}`}</Text>
            <Text variant="label" numberOfLines={1}>
              {lesson.title}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Tópicos da aula, ${page + 1} de ${topics.length}`}
            onPress={() => setTopicsOpen(true)}
            hitSlop={6}
            style={styles.counter}
          >
            <Icon name="list" size={16} />
            <Text variant="label">{`${page + 1} de ${topics.length}`}</Text>
          </Pressable>
        </View>
        <View style={styles.segments} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {topics.map((t, i) => (
            <View key={t.title} style={[styles.segment, i <= page && { backgroundColor: colors.ink }]} />
          ))}
        </View>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={styles.story}>
        {page === 0 ? (
          <View style={styles.opening}>
            <View style={styles.chip}>
              <Text variant="caption">{`${lesson.minutes} min de leitura · ${topics.length} tópicos`}</Text>
            </View>
            <Text variant="hero" accessibilityRole="header">
              {lesson.title}
            </Text>
            <Text variant="body" color={colors.inkSoft}>
              {lesson.summary}
            </Text>
            <View style={styles.rule} />
          </View>
        ) : (
          <Text variant="display" accessibilityRole="header">
            {topic.title}
          </Text>
        )}
        {topic.blocks.map((b, i) => (
          <Block key={`${page}-${i}`} b={b} />
        ))}

        {last ? (
          <>
            <View style={styles.end}>
              <View style={styles.endLine} />
              <Text variant="overline" color={colors.inkMuted}>
                FIM DA AULA
              </Text>
              <View style={styles.endLine} />
            </View>
            <View style={{ gap: 4 }}>
              <Text variant="label" color={colors.inkBody}>
                Fontes
              </Text>
              {lesson.sources.map((s) => (
                <Text key={s.label} variant="caption" color={colors.inkMuted}>
                  {s.label}
                </Text>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      <StickyFooter>
        {last ? (
          <Text variant="bodySm" color={colors.inkMuted} style={styles.center}>
            {`${lesson.questions.length} perguntas rápidas sobre o que você leu`}
          </Text>
        ) : null}
        <View style={styles.footerRow}>
          {page > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Tópico anterior" onPress={() => goTo(page - 1)} style={styles.back}>
              <Icon name="arrow-left" size={22} />
            </Pressable>
          ) : null}
          <Button variant="primary" iconRight="arrow-right" style={{ flex: 1 }} onPress={() => (last ? setPhase('questions') : goTo(page + 1))}>
            {page === 0 ? 'Começar a aula' : last ? 'Ir para as perguntas' : 'Próximo tópico'}
          </Button>
        </View>
      </StickyFooter>

      <TopicsSheet visible={topicsOpen} topics={topics} page={page} furthest={furthest} onPick={goTo} onClose={() => setTopicsOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { textAlign: 'center' },
  header: { paddingHorizontal: spacing[5], paddingTop: spacing[2], paddingBottom: spacing[3], gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  close: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  counter: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing[3], borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceStrong },
  story: { paddingHorizontal: spacing[6], paddingTop: spacing[3], paddingBottom: spacing[8], gap: spacing[4] },
  opening: { gap: spacing[3] },
  chip: { alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.brandTint },
  rule: { height: 1, backgroundColor: colors.line, marginTop: spacing[2] },
  block: { borderRadius: radius.md },
  paragraph: { fontFamily: fonts.regular, fontSize: 18, lineHeight: 30, color: colors.inkBody },
  mark: { backgroundColor: colors.brandTint, borderRadius: radius.lg, paddingVertical: spacing[4], paddingHorizontal: spacing[5] },
  markText: { fontSize: 20, lineHeight: 28 },
  bubble: { maxWidth: '88%', backgroundColor: colors.surfaceMuted, borderRadius: 16, borderBottomLeftRadius: 4, paddingVertical: spacing[2], paddingHorizontal: 14 },
  bubbleMine: { backgroundColor: colors.brandTint, borderBottomLeftRadius: 16, borderBottomRightRadius: 4 },
  ledger: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing[4], gap: spacing[2] },
  ledgerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  ledgerTotal: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing[2], alignItems: 'center' },
  end: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginTop: spacing[4] },
  endLine: { flex: 1, height: 1, backgroundColor: colors.surfaceStrong },
  footerRow: { flexDirection: 'row', gap: 10 },
  back: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(17,18,19,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: spacing[4], gap: 6 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceStrong, marginBottom: spacing[2] },
  sheetHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: spacing[1], marginBottom: spacing[2] },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], paddingHorizontal: 14, borderRadius: radius.lg },
  topicNum: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  qContent: { padding: spacing[5], paddingTop: spacing[2], gap: spacing[5], paddingBottom: spacing[8] },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceStrong },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: 14, paddingHorizontal: spacing[4], borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  optionRight: { backgroundColor: colors.successTint, borderWidth: 2, borderColor: colors.success, paddingVertical: 12, paddingHorizontal: 14 },
  optionWrong: { backgroundColor: colors.dangerTint, borderWidth: 2, borderColor: colors.danger, paddingVertical: 12, paddingHorizontal: 14 },
  feedback: { backgroundColor: colors.canvas, borderRadius: radius.lg, padding: spacing[4], gap: spacing[2] },
  doneContent: { padding: spacing[6], paddingTop: 96, alignItems: 'center', gap: spacing[3] },
  doneIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[2] },
  doneDots: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] },
  doneDot: { width: 40, height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceStrong },
  nextCard: { marginTop: spacing[5], alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.surfaceMuted },
});
