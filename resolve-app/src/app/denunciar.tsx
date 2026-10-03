import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, OptionChip, StickyFooter, Text, TopBar } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/state/app';
import { colors, spacing } from '@/theme/tokens';
import { notify } from '@/utils/dialog';
import { firstName } from '@/utils/format';

const REASONS = [
  { id: 'golpe', label: 'Golpe ou fraude' },
  { id: 'pagamento', label: 'Pediu pagamento fora do combinado' },
  { id: 'assedio', label: 'Assédio, ameaça ou ofensa' },
  { id: 'conteudo', label: 'Foto ou conteúdo impróprio' },
  { id: 'outro', label: 'Outro motivo' },
] as const;

/** Denunciar alguém (do chat ou do perfil). Opcionalmente já bloqueia. */
export default function Denunciar() {
  const { userId, name, conversationId } = useLocalSearchParams<{ userId: string; name?: string; conversationId?: string }>();
  const { blocked, block } = useApp();
  const [reason, setReason] = useState<(typeof REASONS)[number]['id'] | null>(null);
  const [details, setDetails] = useState('');
  const alreadyBlocked = blocked.includes(userId);
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [sending, setSending] = useState(false);
  const who = name ? firstName(name) : 'esta pessoa';

  const send = async () => {
    if (!reason || sending) return;
    setSending(true);
    try {
      const { error } = await supabase
        .from('reports')
        .insert({ reported_id: userId, conversation_id: conversationId || null, reason, details: details.trim() || null });
      if (error) throw error;
      if (alsoBlock && !alreadyBlocked) await block(userId);
      router.back();
      notify('Denúncia enviada. Vamos analisar em até 24 horas.');
    } catch (e) {
      notify(`Não foi possível enviar a denúncia. ${authErrorMessage(e)}`);
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TopBar title={`Denunciar ${who}`} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text variant="body" color={colors.inkBody}>
            {`${name ?? 'A pessoa'} não fica sabendo da denúncia. Nossa equipe analisa em até 24 horas.`}
          </Text>
          <View style={{ gap: spacing[2] }}>
            <Text variant="label">O que aconteceu?</Text>
            {REASONS.map((r) => (
              <OptionChip key={r.id} label={r.label} active={reason === r.id} onPress={() => setReason(r.id)} />
            ))}
          </View>
          <Field label="Conte mais (opcional)" placeholder="O que foi dito ou feito" value={details} onChangeText={setDetails} multiline maxLength={1000} />
          {!alreadyBlocked ? (
            <OptionChip label={alsoBlock ? `Bloquear ${who} também` : `Não bloquear ${who}`} active={alsoBlock} onPress={() => setAlsoBlock((b) => !b)} />
          ) : null}
        </ScrollView>
        <StickyFooter>
          <Button variant="primary" block iconLeft="flag" disabled={!reason || sending} onPress={send}>
            {sending ? 'Enviando…' : 'Enviar denúncia'}
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
