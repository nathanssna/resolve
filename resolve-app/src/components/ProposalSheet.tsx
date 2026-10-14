import { useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authErrorMessage } from '@/lib/authErrors';
import { colors, radius, spacing } from '@/theme/tokens';
import { parseBRLInput } from '@/utils/format';
import { nextDays, PERIODS, soonest, type Schedule } from '@/utils/schedule';
import { Button } from './Button';
import { Field } from './Fields';
import { OptionChip } from './Surfaces';
import { Text } from './Text';

export type ProposalJob = {
  id: string;
  /** Ex.: "Instalar chuveiro". */
  label: string;
  /** Quando o cliente pediu, para mostrar ("Amanhã, à tarde", "O quanto antes"). */
  defaultWhen: string;
  /** Dia e período pedidos: já vêm escolhidos. */
  defaultSchedule?: Schedule;
};

/** Dias que dá para escolher na proposta. */
const DAYS = 30;
/** Largura aproximada de um dia na faixa (chip + espaço), para rolar até o escolhido. */
const DAY_WIDTH = 72;

/** Profissional monta a proposta: para qual pedido, valor, quando e observação. */
export function ProposalSheet({
  visible,
  jobs,
  initialJobId,
  onClose,
  onSubmit,
}: {
  /** Pedido que já vem escolhido (senão, o mais recente). */
  initialJobId?: string;
  visible: boolean;
  /** Pedidos em aberto da conversa; o último vem escolhido. Com mais de um, aparece a escolha. */
  jobs: ProposalJob[];
  onClose: () => void;
  onSubmit: (jobId: string, input: { amount: number; schedule: Schedule; note: string }) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = jobs.find((j) => j.id === (jobId ?? initialJobId)) ?? jobs.at(-1);
  const days = nextDays(DAYS);
  // O dia pedido pelo cliente, se ainda estiver na faixa; senão, o primeiro período que dá tempo.
  const asked = job?.defaultSchedule;
  const fallback = asked && days.some((d) => d.day === asked.day) ? asked : soonest();
  const [picked, setPicked] = useState<Schedule | null>(null);
  const schedule = picked ?? fallback;
  const daysRef = useRef<ScrollView>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = parseBRLInput(amount);
  const canSend = !!job && value !== null && value > 0 && !sending;

  const reset = () => {
    setJobId(null);
    setPicked(null);
    setAmount('');
    setNote('');
    setError(null);
  };

  const submit = async () => {
    if (!canSend || value === null || !job) return;
    Keyboard.dismiss();
    setSending(true);
    setError(null);
    try {
      await onSubmit(job.id, { amount: value, schedule, note });
      reset();
      onClose();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* No celular, tocar em qualquer área vazia da folha fecha o teclado (na web, o clique no campo cairia aqui também). */}
        <Pressable accessible={false} onPress={Platform.OS === 'web' ? undefined : Keyboard.dismiss} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
          <View style={styles.handle} />
          <Text variant="titleMd" accessibilityRole="header">
            Enviar proposta
          </Text>
          <Text variant="bodySm" color={colors.inkMuted}>
            O cliente pode aceitar, recusar ou negociar. Uma proposta nova substitui a anterior do mesmo pedido.
          </Text>
          {jobs.length > 1 ? (
            <View style={{ gap: spacing[2] }}>
              <Text variant="label">Para qual pedido?</Text>
              {jobs.map((j) => (
                <OptionChip
                  key={j.id}
                  label={j.label}
                  sublabel={j.defaultWhen}
                  active={j.id === job?.id}
                  onPress={() => {
                    setJobId(j.id);
                    setPicked(null);
                  }}
                />
              ))}
            </View>
          ) : null}
          <Field
            label="Valor (R$)"
            placeholder="Ex.: 150,00"
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^\d,.]/g, ''))}
            keyboardType="decimal-pad"
            inputMode="decimal"
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
          <View style={{ gap: spacing[2] }}>
            <Text variant="label">Quando</Text>
            <ScrollView
              ref={daysRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: spacing[2] }}
              onLayout={() => {
                // Abre com o dia escolhido à vista.
                const i = days.findIndex((d) => d.day === schedule.day);
                if (i > 3) daysRef.current?.scrollTo({ x: (i - 1) * DAY_WIDTH, animated: false });
              }}
            >
              {days.map((d) => (
                <OptionChip key={d.day} label={d.label} sublabel={d.sub} active={d.day === schedule.day} onPress={() => setPicked({ ...schedule, day: d.day })} />
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              {PERIODS.map((p) => (
                <View key={p.id} style={{ flex: 1 }}>
                  <OptionChip label={p.label} sublabel={p.hint} active={p.id === schedule.period} onPress={() => setPicked({ ...schedule, period: p.id })} />
                </View>
              ))}
            </View>
            {job?.defaultWhen ? (
              <Text variant="caption" color={colors.inkMuted}>
                {`O cliente pediu: ${job.defaultWhen.toLowerCase()}`}
              </Text>
            ) : null}
          </View>
          <Field
            label="Observação (opcional)"
            placeholder="Ex.: materiais à parte"
            value={note}
            onChangeText={setNote}
            maxLength={1000}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
          {error ? (
            <Text variant="bodySm" color={colors.danger} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Button variant="primary" block iconLeft="receipt" disabled={!canSend} onPress={submit}>
            {sending ? 'Enviando…' : 'Enviar proposta'}
          </Button>
          <Button variant="link" onPress={onClose} style={{ alignSelf: 'center' }}>
            Cancelar
          </Button>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,18,19,0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: spacing[5],
    gap: spacing[4],
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceStrong },
});
