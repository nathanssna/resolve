import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authErrorMessage } from '@/lib/authErrors';
import { colors, radius, spacing } from '@/theme/tokens';
import { parseBRLInput } from '@/utils/format';
import { Button } from './Button';
import { Field } from './Fields';
import { Text } from './Text';

/** Profissional monta a proposta: valor, quando e observação. */
export function ProposalSheet({
  visible,
  defaultWhen,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  /** Sugestão para "Quando" (o horário do pedido). */
  defaultWhen: string;
  onClose: () => void;
  onSubmit: (input: { amount: number; when: string; note: string }) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [when, setWhen] = useState(defaultWhen);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = parseBRLInput(amount);
  const canSend = value !== null && value > 0 && when.trim().length > 0 && !sending;

  const reset = () => {
    setAmount('');
    setWhen(defaultWhen);
    setNote('');
    setError(null);
  };

  const submit = async () => {
    if (!canSend || value === null) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit({ amount: value, when: when.trim(), note });
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
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
          <View style={styles.handle} />
          <Text variant="titleMd" accessibilityRole="header">
            Enviar proposta
          </Text>
          <Text variant="bodySm" color={colors.inkMuted}>
            O cliente pode aceitar, recusar ou negociar. Uma proposta nova substitui a anterior.
          </Text>
          <Field
            label="Valor (R$)"
            placeholder="Ex.: 150,00"
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^\d,.]/g, ''))}
            keyboardType="decimal-pad"
            inputMode="decimal"
            autoFocus
          />
          <Field label="Quando" placeholder="Ex.: Amanhã, 14h" value={when} onChangeText={setWhen} maxLength={120} />
          <Field label="Observação (opcional)" placeholder="Ex.: materiais à parte" value={note} onChangeText={setNote} maxLength={1000} />
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
        </View>
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
