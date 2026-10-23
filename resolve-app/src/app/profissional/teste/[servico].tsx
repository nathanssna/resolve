import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, CatalogFallback, Icon, ProgressBar, StickyFooter, Tag, Text, TopBar, type IconName } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { quizStatus, startQuiz, submitQuiz, type QuizAttempt, type QuizResult, type QuizStatus } from '@/lib/quiz';
import { useAuth } from '@/state/auth';
import { useCatalog } from '@/state/catalog';
import { colors, radius, spacing } from '@/theme/tokens';
import { confirm, notify } from '@/utils/dialog';

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "quarta, 21/10". */
const retryDay = (iso: string) => {
  const d = new Date(iso);
  return `${WEEKDAYS[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** "16 min" no começo; "0:42" no último minuto. */
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.round(s / 60)} min` : `0:${String(s).padStart(2, '0')}`;
};

function Rule({ icon, text, last }: { icon: IconName; text: string; last?: boolean }) {
  return (
    <View style={[styles.rule, !last && styles.ruleLine]}>
      <Icon name={icon} size={20} />
      <Text variant="label" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Teste de conhecimento de um serviço: regras → questões → resultado.
 * As questões vêm sorteadas e embaralhadas do servidor (start_quiz), que também corrige (submit_quiz).
 * Saiu no meio: ao voltar, as mesmas questões, e o tempo continua contando.
 */
export default function Teste() {
  const { servico } = useLocalSearchParams<{ servico: string }>();
  const { session } = useAuth();
  const { getService, getProfessional, refresh: refreshCatalog } = useCatalog();
  const service = getService(servico);
  const me = getProfessional(session?.user.id);
  const verified = !!me?.verified;

  const [status, setStatus] = useState<{ state: 'loading' | 'ready' | 'error'; row: QuizStatus | null }>({ state: 'loading', row: null });
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const sent = useRef(false);

  const load = useCallback(() => {
    quizStatus().then(
      (rows) => setStatus({ state: 'ready', row: rows.find((r) => r.service_id === servico) ?? null }),
      () => setStatus({ state: 'error', row: null }),
    );
  }, [servico]);
  useEffect(load, [load]);
  const retry = () => {
    setStatus((s) => ({ ...s, state: 'loading' }));
    load();
  };

  const begin = async () => {
    if (!servico || busy) return;
    setBusy(true);
    try {
      const a = await startQuiz(servico);
      setAttempt(a);
      setAnswers(a.questions.map(() => -1));
      setIndex(0);
      sent.current = false;
    } catch (e) {
      notify(authErrorMessage(e));
      load();
    } finally {
      setBusy(false);
    }
  };

  const finish = useCallback(
    async (final: number[]) => {
      if (!attempt || sent.current) return;
      sent.current = true;
      setBusy(true);
      try {
        const r = await submitQuiz(attempt.attempt_id, final);
        setResult(r);
        // Aprovado: o serviço passa a aparecer (quando a identidade também estiver confirmada).
        if (r.passed) refreshCatalog({ silent: true });
      } catch (e) {
        sent.current = false;
        notify(`Não foi possível enviar as respostas. ${authErrorMessage(e)}`);
      } finally {
        setBusy(false);
      }
    },
    [attempt, refreshCatalog],
  );

  // Relógio: acabou o tempo, envia o que foi respondido.
  const deadline = attempt ? Date.parse(attempt.deadline_at) : 0;
  const running = !!attempt && !result;
  const latest = useRef({ answers, finish });
  useEffect(() => {
    latest.current = { answers, finish };
  }, [answers, finish]);
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= deadline) latest.current.finish(latest.current.answers);
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running, deadline]);

  const leave = useCallback(() => {
    if (!running) return router.back();
    confirm('Sair do teste? O tempo continua contando, e as respostas desta tela se perdem.', () => router.back(), {
      confirmLabel: 'Sair',
      danger: true,
    });
  }, [running]);

  // Android: o voltar do aparelho pergunta antes de sair do teste.
  useEffect(() => {
    if (!running) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => sub.remove();
  }, [running, leave]);

  const area = service?.testLabel ?? status.row?.label ?? '';
  const title = `Teste de ${area}`;

  // ---------------------------------------------------------------- resultado
  if (result) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ gestureEnabled: true }} />
        <ScrollView contentContainerStyle={styles.result}>
          <View style={[styles.bigIcon, { backgroundColor: result.passed ? colors.brand : colors.surfaceMuted }]}>
            <Icon name={result.passed ? 'shield-check' : 'calendar-clock'} size={44} />
          </View>
          <Text variant="display" accessibilityRole="header" style={styles.center}>
            {result.passed ? `Aprovado em ${area}` : 'Não foi dessa vez'}
          </Text>
          <Text variant="body" color={colors.inkBody} style={styles.center}>
            {result.passed
              ? `Você acertou ${result.score} de ${result.total} questões.`
              : result.late
                ? 'O tempo acabou antes de as respostas chegarem.'
                : `Você acertou ${result.score} de ${result.total}. Para passar, são ${result.pass}.`}
          </Text>
          {!result.passed && result.retry_at ? (
            <Text variant="body" color={colors.inkBody} style={styles.center}>
              {`Você pode fazer o teste de novo a partir de ${retryDay(result.retry_at)}. As questões mudam a cada tentativa.`}
            </Text>
          ) : null}
          {result.passed ? (
            <View style={styles.preview}>
              <Text variant="caption" color={colors.inkMuted}>
                Os clientes veem no seu perfil
              </Text>
              {/* No perfil, o serviço aprovado ganha o escudo na seção Serviços. */}
              <Tag icon="shield-check">{service?.title ?? area}</Tag>
            </View>
          ) : null}
        </ScrollView>
        <StickyFooter>
          {result.passed && !verified ? (
            <>
              <Text variant="bodySm" color={colors.inkBody} style={styles.center}>
                Falta 1 passo: confirmar sua identidade.
              </Text>
              <Button variant="primary" block iconRight="arrow-right" onPress={() => router.replace('/verificacao')}>
                Continuar
              </Button>
            </>
          ) : result.passed ? (
            <>
              <Text variant="bodySm" color={colors.inkBody} style={styles.center}>
                {result.released ? 'Pronto, você já aparece para os clientes.' : `Seu perfil já aparece para clientes de ${area}.`}
              </Text>
              <Button variant="primary" block onPress={() => router.back()}>
                Voltar ao início
              </Button>
            </>
          ) : (
            <Button variant="dark" block onPress={() => router.back()}>
              Voltar ao início
            </Button>
          )}
        </StickyFooter>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------- questões
  if (attempt) {
    const q = attempt.questions[index];
    const chosen = answers[index];
    const last = index === attempt.questions.length - 1;
    const left = deadline - now;
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Stack.Screen options={{ gestureEnabled: false }} />
        <TopBar title={title} onBack={leave} />
        <View style={styles.progress}>
          <View style={styles.progressHead}>
            <Text variant="overline" color={colors.inkMuted}>{`QUESTÃO ${index + 1} DE ${attempt.questions.length}`}</Text>
            <View style={styles.timer} accessibilityLabel={`Tempo restante: ${clock(left)}`}>
              <Icon name="clock" size={14} color={left < 60000 ? colors.danger : colors.inkMuted} />
              <Text variant="caption" color={left < 60000 ? colors.danger : colors.inkMuted}>
                {clock(left)}
              </Text>
            </View>
          </View>
          <ProgressBar value={(index + 1) / attempt.questions.length} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={{ gap: spacing[2] }}>
            {q.source ? (
              <Text variant="caption" color={colors.inkMuted} style={styles.source}>
                {`Fonte: ${q.source}`}
              </Text>
            ) : null}
            <Text variant="titleMd" accessibilityRole="header">
              {q.question}
            </Text>
          </View>
          <View accessibilityRole="radiogroup" style={{ gap: spacing[2] }}>
            {q.options.map((o, i) => {
              const on = chosen === i;
              return (
                <Pressable
                  key={o}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setAnswers((a) => a.map((x, j) => (j === index ? i : x)))}
                  style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && { opacity: 0.85 }]}
                >
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                  <Text variant={on ? 'labelLg' : 'body'} style={{ flex: 1 }}>
                    {o}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <StickyFooter>
          <Button
            variant="primary"
            block
            iconRight={last ? undefined : 'arrow-right'}
            disabled={chosen < 0 || busy}
            onPress={() => (last ? finish(answers) : setIndex(index + 1))}
          >
            {last ? (busy ? 'Enviando…' : 'Enviar respostas') : 'Próxima'}
          </Button>
          {index > 0 ? (
            <Button variant="link" onPress={() => setIndex(index - 1)} style={{ alignSelf: 'center' }}>
              Questão anterior
            </Button>
          ) : null}
        </StickyFooter>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------- regras
  const row = status.row;
  const waitUntil = row?.retry_at ? Date.parse(row.retry_at) : 0;
  const waiting = waitUntil > now;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.content}>
        {status.state !== 'ready' ? (
          <CatalogFallback status={status.state} onRetry={retry} />
        ) : !row || !row.available ? (
          <Text variant="body" color={colors.inkBody}>
            {!row ? 'Escolha esse serviço na sua ficha para fazer o teste.' : 'O teste deste serviço ainda não está disponível.'}
          </Text>
        ) : (
          <>
            <View style={{ gap: spacing[3] }}>
              <View style={styles.serviceIcon}>
                <Icon name={service?.icon ?? 'wrench'} size={30} />
              </View>
              <Text variant="display" accessibilityRole="header">
                {title}
              </Text>
              <Text variant="body" color={colors.inkBody}>
                {row.approved_at
                  ? 'Você já passou neste teste. O selo aparece no seu perfil.'
                  : `Para aparecer para clientes de ${area}, você precisa passar neste teste. Quem já trabalha na área costuma passar sem dificuldade.`}
              </Text>
            </View>
            {!row.approved_at ? (
              <View style={styles.rules}>
                <Rule icon="clipboard-list" text={`${row.draw} questões de marcar`} />
                <Rule icon="clock" text={`Até ${row.minutes} minutos`} />
                <Rule icon="check" text={`Passa com ${row.pass} acertos`} />
                <Rule icon="calendar-clock" text={`Se não passar, tenta de novo em ${row.retry_days ?? 3} dias`} last />
              </View>
            ) : null}
            {row.open_attempt ? (
              <Text variant="caption" color={colors.inkMuted}>
                Você já começou este teste. As questões são as mesmas e o tempo continua contando.
              </Text>
            ) : waiting ? (
              <Text variant="label" color={colors.inkBody}>
                {`Você pode fazer o teste de novo a partir de ${retryDay(row.retry_at!)}.`}
              </Text>
            ) : !row.approved_at ? (
              <Text variant="caption" color={colors.inkMuted}>
                Faça num lugar tranquilo. O tempo começa quando você tocar em Começar e não dá para pausar.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
      {row?.available && !row.approved_at ? (
        <StickyFooter>
          <Button variant="primary" block iconRight="arrow-right" disabled={busy || waiting} onPress={begin}>
            {busy ? 'Preparando…' : row.open_attempt ? 'Continuar teste' : 'Começar teste'}
          </Button>
        </StickyFooter>
      ) : null}
      {busy && !attempt ? <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.ink} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[5], paddingTop: spacing[2], gap: spacing[6], paddingBottom: spacing[8] },
  center: { textAlign: 'center' },
  serviceIcon: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  rules: { borderRadius: radius.lg, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing[4], paddingVertical: spacing[1] },
  rule: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3] },
  ruleLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  progress: { paddingHorizontal: spacing[5], paddingBottom: spacing[2], gap: spacing[2] },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  source: { alignSelf: 'flex-end', textAlign: 'right' },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: 14, paddingHorizontal: spacing[4], borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  optionOn: { backgroundColor: colors.brandTint, borderWidth: 2, borderColor: colors.ink, paddingVertical: 12, paddingHorizontal: 14 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.inkMuted, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.ink },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink },
  result: { padding: spacing[5], paddingTop: 96, alignItems: 'center', gap: spacing[3] },
  bigIcon: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[2] },
  preview: { marginTop: spacing[5], alignSelf: 'stretch', alignItems: 'center', gap: spacing[2], padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.surfaceMuted },
});
