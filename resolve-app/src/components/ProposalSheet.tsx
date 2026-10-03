import { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authErrorMessage } from '@/lib/authErrors';
import { colors, radius, spacing } from '@/theme/tokens';
import { parseBRLInput } from '@/utils/format';
import { Button } from './Button';
import { Field } from './Fields';
import { OptionChip } from './Surfaces';
import { Text } from './Text';

export type ProposalJob = {
  id: string;
  /** Ex.: "Instalar chuveiro". */
  label: string;
  /** Sugestão para "Quando" (o horário do pedido). */
  defaultWhen: string;
};

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
  onSubmit: (jobId: string, input: { amount: number; when: string; note: string }) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [jobId, setJobId] = useState<string | null>(null);
  const job = jobs.find((j) => j.id === (jobId ?? initialJobId)) ?? jobs.at(-1);
  const defaultWhen = job?.defaultWhen ?? '';
  const [amount, setAmount] = useState('');
  const [when, setWhen] = useState(defaultWhen);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = parseBRLInput(amount);
  const canSend = !!job && value !== null && value > 0 && when.trim().length > 0 && !sending;

  const reset = () => {
    setJobId(null);
    setAmount('');
    setWhen('');
    setNote('');
    setError(null);
  };

  const submit = async () => {
    if (!canSend || value === null || !job) return;
    Keyboard.dismiss();
    setSending(true);
    setError(null);
    try {
      await onSubmit(job.id, { amount: value, when: when.trim(), note });
      reset();
      onClose();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={() => setWhen((w) => w || defaultWhen)}>
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
                    setWhen(j.defaultWhen);
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
          <Field label="Quando" placeholder="Ex.: Amanhã, 14h" value={when} onChangeText={setWhen} maxLength={120} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} />
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
