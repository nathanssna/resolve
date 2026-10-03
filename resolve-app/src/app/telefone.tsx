import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, InfoBanner, StickyFooter, Text, TopBar } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/state/auth';
import { colors, spacing } from '@/theme/tokens';
import { notify } from '@/utils/dialog';
import { formatPhoneBR } from '@/utils/format';

/** Telefone da conta. Só aparece para o outro lado depois de combinar um serviço. */
export default function Telefone() {
  const { session, profile, refreshProfile } = useAuth();
  const [phone, setPhone] = useState(formatPhoneBR(profile?.phone ?? ''));
  const [saving, setSaving] = useState(false);
  const digits = phone.replace(/\D/g, '');
  const valid = digits.length === 0 || digits.length === 10 || digits.length === 11;
  const changed = (digits ? `+55${digits}` : null) !== (profile?.phone ?? null);

  const save = async () => {
    if (!session || !valid || saving) return;
    setSaving(true);
    // Sem select depois do update: o telefone não é legível pela API (só por get_my_profile).
    const { error } = await supabase
      .from('profiles')
      .update({ phone: digits ? `+55${digits}` : null })
      .eq('id', session.user.id);
    if (error) {
      notify(`Não foi possível salvar o telefone. ${authErrorMessage(error)}`);
      setSaving(false);
      return;
    }
    await refreshProfile();
    router.back();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TopBar title="Telefone" />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Field
            label="Celular com DDD"
            placeholder="(11) 91234-5678"
            value={phone}
            onChangeText={(t) => setPhone(formatPhoneBR(t))}
            keyboardType="phone-pad"
            inputMode="tel"
            autoComplete="tel"
            textContentType="telephoneNumber"
            maxLength={15}
            autoFocus
          />
          {!valid ? (
            <Text variant="caption" color={colors.danger} accessibilityLiveRegion="polite">
              Digite o DDD e o número (10 ou 11 dígitos).
            </Text>
          ) : null}
          <InfoBanner
            icon="shield-check"
            title="Só depois de combinar"
            description="Quem está do outro lado só vê seu telefone depois que vocês combinarem um serviço, para poder ligar no dia."
          />
        </ScrollView>
        <StickyFooter>
          <Button variant="primary" block iconLeft="check" disabled={!valid || !changed || saving} onPress={save}>
            {saving ? 'Salvando…' : digits ? 'Salvar telefone' : 'Remover telefone'}
          </Button>
        </StickyFooter>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[5], paddingTop: spacing[2], gap: spacing[4] },
});
