import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AuthLayout, Button, Field, Text } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { useAuth } from '@/state/auth';
import { colors, spacing } from '@/theme/tokens';
import { leaveAuthFlow } from '@/utils/authFlow';

const LENGTH = 6;
/** O Supabase só reenvia o e-mail depois de 60 s. */
const RESEND_AFTER = 60;

export default function Codigo() {
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const { sendCode, verifyCode } = useAuth();
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  const wait = Math.max(0, RESEND_AFTER - Math.floor((now - sentAt) / 1000));
  useEffect(() => {
    if (wait === 0) return;
    const t = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [wait, now]);

  const verify = async (token: string) => {
    if (token.length !== LENGTH || verifying) return;
    setVerifying(true);
    setError(null);
    setNotice(null);
    try {
      const profile = await verifyCode(email, token);
      if (!profile || profile.full_name.trim() === '') {
        router.replace('/entrar/sobre-voce');
      } else {
        leaveAuthFlow();
      }
    } catch (e) {
      setError(authErrorMessage(e));
      setCode('');
      setVerifying(false);
    }
  };

  const onChange = (t: string) => {
    const digits = t.replace(/\D/g, '').slice(0, LENGTH);
    setCode(digits);
    if (error) setError(null);
    if (digits.length === LENGTH) verify(digits);
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    try {
      await sendCode(email);
      setSentAt(Date.now());
      setNow(Date.now());
      setNotice('Enviamos um novo código.');
    } catch (e) {
      setError(authErrorMessage(e));
    }
  };

  return (
    <AuthLayout
      title="Digite o código"
      subtitle={`Enviamos ${LENGTH} dígitos para ${email}. Pode levar alguns segundos.`}
      footer={
        <Button variant="primary" block iconRight="arrow-right" disabled={code.length !== LENGTH || verifying} onPress={() => verify(code)}>
          {verifying ? 'Conferindo…' : 'Entrar'}
        </Button>
      }
    >
      <Field
        label="Código"
        placeholder="000000"
        value={code}
        onChangeText={onChange}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={LENGTH}
        editable={!verifying}
        autoFocus
      />
      {error ? (
        <Text variant="bodySm" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text variant="bodySm" color={colors.success} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}

      <View style={{ gap: spacing[3], alignItems: 'flex-start' }}>
        {wait > 0 ? (
          <Text variant="bodySm" color={colors.inkMuted}>
            {`Reenviar código em ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, '0')}`}
          </Text>
        ) : (
          <Button variant="link" onPress={resend}>
            Reenviar código
          </Button>
        )}
        <Button variant="link" onPress={() => router.back()}>
          Usar outro e-mail
        </Button>
      </View>
      <Text variant="caption" color={colors.inkMuted}>
        Não chegou? Confira a caixa de spam.
      </Text>
    </AuthLayout>
  );
}
