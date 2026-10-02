import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AuthLayout, Button, Field, Icon, Text } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { useAuth } from '@/state/auth';
import { colors, spacing } from '@/theme/tokens';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Entrar() {
  const { sendCode } = useAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = email.trim().toLowerCase();
  const valid = EMAIL.test(value);

  const submit = async () => {
    if (!valid || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendCode(value);
      router.push({ pathname: '/entrar/codigo', params: { email: value } });
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthLayout
      title="Entre ou crie sua conta"
      subtitle="Sem senha: mandamos um código para o seu e-mail."
      footer={
        <Button variant="primary" block iconRight="arrow-right" disabled={!valid || sending} onPress={submit}>
          {sending ? 'Enviando…' : 'Receber código'}
        </Button>
      }
    >
      <Field
        label="Seu e-mail"
        placeholder="voce@email.com"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (error) setError(null);
        }}
        onClear={() => setEmail('')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        inputMode="email"
        returnKeyType="send"
        onSubmitEditing={submit}
        autoFocus
      />
      {error ? (
        <Text variant="bodySm" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: spacing[2], alignItems: 'center' }}>
        <Icon name="shield-check" size={16} strokeWidth={2.25} color={colors.success} />
        <Text variant="caption" color={colors.inkMuted} style={{ flex: 1 }}>
          Se for seu primeiro acesso, a conta é criada na hora.
        </Text>
      </View>
    </AuthLayout>
  );
}
