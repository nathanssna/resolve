import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, EmptyState, Field, InfoBanner, OptionChip, StickyFooter, Text, TopBar } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { useApp } from '@/state/app';
import { colors, spacing } from '@/theme/tokens';
import { notify } from '@/utils/dialog';
import { firstName } from '@/utils/format';
import { CANCEL_NOTICE_HOURS } from '@/utils/schedule';

const OTHER = 'Outro motivo';
const REASONS = {
  cliente: ['Imprevisto', 'Não vou estar em casa', 'Já resolvi de outro jeito', OTHER],
  profissional: ['Imprevisto', 'Problema de saúde', 'Não consigo chegar a tempo', OTHER],
} as const;

/** Cancelar em cima da hora (menos de 12 h antes): pede o motivo, que vai para o chat. */
export default function CancelarServico() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { role, orders, cancelOrder } = useApp();
  const isPro = role === 'profissional';
  const order = orders.find((o) => o.id === id);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  if (!order || order.status !== 'combinado') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TopBar title="Cancelar serviço" />
        <View style={{ padding: spacing[5] }}>
          <EmptyState icon="clipboard-list" title="Este serviço não está mais em andamento" />
        </View>
      </SafeAreaView>
    );
  }

  const name = firstName(order.other.name);
  // "Outro motivo" precisa do texto; nos outros, o texto é opcional.
  const text = reason === OTHER ? details.trim() : [reason, details.trim()].filter(Boolean).join(': ');
  const canSend = !!reason && (reason !== OTHER || details.trim().length >= 5) && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await cancelOrder(order.id, text);
      router.back();
      notify('Serviço cancelado.');
    } catch (e) {
      notify(authErrorMessage(e));
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TopBar title="Cancelar serviço" />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <InfoBanner
            icon="clock"
            title={`Falta menos de ${CANCEL_NOTICE_HOURS} horas`}
            description={
              isPro
                ? 'Cancelar agora conta como cancelamento em cima da hora. Com 3 em 30 dias, sua conta fica pausada por 7 dias.'
                : 'Cancelar agora conta como cancelamento em cima da hora, e os profissionais veem isso quando você pede um orçamento.'
            }
          />
          <View style={{ gap: spacing[2] }}>
            <Text variant="label">{`Por que você precisa cancelar? ${name} vai ver o motivo no chat.`}</Text>
            {REASONS[isPro ? 'profissional' : 'cliente'].map((r) => (
              <OptionChip key={r} label={r} active={reason === r} onPress={() => setReason(r)} />
            ))}
          </View>
          <Field
            label={reason === OTHER ? 'Conte o motivo' : 'Conte mais (opcional)'}
            placeholder={isPro ? 'Ex.: o carro quebrou no caminho' : 'Ex.: tive uma emergência no trabalho'}
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={250}
          />
        </ScrollView>
        <StickyFooter>
          <Button variant="primary" block disabled={!canSend} onPress={send}>
            {sending ? 'Cancelando…' : 'Cancelar serviço'}
          </Button>
        </StickyFooter>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[5], paddingTop: spacing[2], gap: spacing[5] },
});
