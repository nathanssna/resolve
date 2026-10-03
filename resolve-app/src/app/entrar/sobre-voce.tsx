import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthLayout, Button, Field, Icon, Text, type IconName } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import type { UserRole } from '@/lib/supabase';
import { useAuth } from '@/state/auth';
import { colors, radius, spacing } from '@/theme/tokens';
import { leaveAuthFlow } from '@/utils/authFlow';

const ROLES: { id: UserRole; icon: IconName; title: string; text: string }[] = [
  { id: 'cliente', icon: 'house', title: 'Quero contratar', text: 'Encontrar profissionais e pedir orçamentos.' },
  { id: 'profissional', icon: 'briefcase', title: 'Sou profissional', text: 'Receber pedidos e mandar propostas.' },
];

/** Primeiro acesso: nome e papel. Só aparece enquanto o perfil está sem nome. */
export default function SobreVoce() {
  // `gate`: aberta automaticamente pelo layout (app reaberto no meio do cadastro).
  const { gate } = useLocalSearchParams<{ gate?: string }>();
  const { completeOnboarding, signOut } = useAuth();
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length >= 2 && !!role && !saving;

  const finish = () => {
    if (gate && router.canGoBack()) router.back();
    else leaveAuthFlow();
  };

  const save = async () => {
    if (!canSave || !role) return;
    setSaving(true);
    setError(null);
    try {
      await completeOnboarding(name, role);
      // Profissional completa a ficha antes de entrar (é o que o faz aparecer para os clientes).
      if (role === 'profissional') router.replace({ pathname: '/profissional/ficha', params: { primeira: '1' } });
      else finish();
    } catch (e) {
      setError(authErrorMessage(e));
      setSaving(false);
    }
  };

  const switchAccount = async () => {
    await signOut();
    finish();
  };

  return (
    <AuthLayout
      title="Como podemos te chamar?"
      subtitle="Falta pouco. Seu nome aparece nas conversas e nos pedidos."
      onBack={false}
      footer={
        <Button variant="primary" block iconRight="arrow-right" disabled={!canSave} onPress={save}>
          {saving ? 'Salvando…' : 'Continuar'}
        </Button>
      }
    >
      <Field
        label="Seu nome"
        placeholder="Ex.: Ana Souza"
        value={name}
        onChangeText={(t) => {
          setName(t);
          if (error) setError(null);
        }}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        maxLength={120}
        returnKeyType="done"
        autoFocus
      />

      <View style={{ gap: spacing[3] }}>
        <Text variant="label">Como você vai usar o Resolve?</Text>
        <View accessibilityRole="radiogroup" style={{ gap: spacing[2] }}>
          {ROLES.map((r) => {
            const on = r.id === role;
            return (
              <Pressable
                key={r.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                accessibilityLabel={`${r.title}. ${r.text}`}
                onPress={() => setRole(r.id)}
                style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && !on && { backgroundColor: colors.surfaceMuted }]}
              >
                <View style={[styles.optionIcon, on && { backgroundColor: colors.surface }]}>
                  <Icon name={r.icon} size={24} duotone />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="labelLg">{r.title}</Text>
                  <Text variant="bodySm" color={colors.inkBody}>
                    {r.text}
                  </Text>
                </View>
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
        <Text variant="caption" color={colors.inkMuted}>
          Essa escolha não pode ser trocada depois.
        </Text>
      </View>

      {error ? (
        <Text variant="bodySm" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Button variant="link" onPress={switchAccount} style={{ alignSelf: 'center' }}>
        Usar outra conta
      </Button>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  optionOn: { borderColor: colors.focus, backgroundColor: colors.brandTint },
  optionIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 22, height: 22, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.inkMuted, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.ink },
  radioDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.ink },
});
