/**
 * Portão do painel de moderação: só administradores (private.admins no banco),
 * e só depois do código do app autenticador (MFA). O banco confere as duas
 * coisas de novo a cada leitura; aqui é só para mostrar a tela certa.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Button, CatalogFallback, EmptyState, Field, Icon, Text } from '@/components';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/state/auth';
import { colors, radius, spacing } from '@/theme/tokens';

export type Gate = 'loading' | 'error' | 'denied' | 'enroll' | 'code' | 'ok';

/** Que tela mostrar: administrador? Já entrou com o código do app autenticador? Já cadastrou um? */
async function loadGate(): Promise<Gate> {
  const { data: admin, error } = await supabase.rpc('am_i_admin');
  if (error) return 'error';
  if (!admin) return 'denied';
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level?.currentLevel === 'aal2') return 'ok';
  const { data: factors } = await supabase.auth.mfa.listFactors();
  return factors?.totp.length ? 'code' : 'enroll';
}

const Ctx = createContext<{ gate: Gate; recheck: () => void }>({ gate: 'loading', recheck: () => {} });

/** Fica no layout do /admin: confere uma vez e vale para todas as telas do painel. */
export function AdminGateProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [gate, setGate] = useState<Gate>('loading');
  const recheck = useCallback(() => {
    loadGate().then(setGate);
  }, []);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    loadGate().then((g) => alive && setGate(g));
    return () => {
      alive = false;
    };
  }, [session]);

  return <Ctx.Provider value={{ gate: session ? gate : 'denied', recheck }}>{children}</Ctx.Provider>;
}

export const useAdminGate = () => useContext(Ctx);

/** O que mostrar no lugar da página enquanto o acesso não está liberado. */
export function GateScreen({ gate, recheck }: { gate: Gate; recheck: () => void }) {
  return (
    <View style={styles.box}>
      {gate === 'denied' ? (
        <EmptyState icon="shield-check" title="Acesso restrito" description="Esta área é só da equipe da Rezolveaê." />
      ) : gate === 'loading' || gate === 'error' ? (
        <CatalogFallback status={gate} onRetry={recheck} />
      ) : gate === 'enroll' ? (
        <Enroll onDone={recheck} />
      ) : (
        <Code onDone={recheck} />
      )}
    </View>
  );
}

/** Primeira vez: cadastrar a Rezolveaê no app autenticador e confirmar com um código. */
function Enroll({ onDone }: { onDone: () => void }) {
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Cadastro começado e não confirmado (saiu no meio): recomeça do zero.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error: e } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Rezolveaê' });
      if (!alive) return;
      if (e || !data) setError('Não foi possível começar. Volte e tente de novo.');
      else setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const confirm = async () => {
    if (!factor || code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    setBusy(false);
    if (e) setError('Código incorreto. Confira o app autenticador e tente de novo.');
    else onDone();
  };

  return (
    <View style={styles.inner}>
      <Text variant="titleSm" accessibilityRole="header">
        Proteja o painel
      </Text>
      <Text variant="body" color={colors.inkBody}>
        Além do código do e-mail, o painel pede um código do app autenticador (Google Authenticator, Microsoft Authenticator ou similar). Assim, só quem está com o seu celular entra.
      </Text>
      {factor ? (
        <>
          <Text variant="label">1. Adicione a Rezolveaê no app autenticador</Text>
          {Platform.OS === 'web' ? (
            <View style={styles.qr}>
              <SvgXml xml={factor.qr.slice(factor.qr.indexOf(',') + 1)} width={180} height={180} />
            </View>
          ) : (
            <Button variant="secondary" size="md" iconLeft="key-round" onPress={() => Linking.openURL(factor.uri).catch(() => setError('Instale um app autenticador e tente de novo.'))}>
              Abrir no app autenticador
            </Button>
          )}
          <Text variant="caption" color={colors.inkMuted}>
            Ou digite esta chave no app:
          </Text>
          <Text variant="label" selectable style={styles.secret} accessibilityLabel={`Chave: ${factor.secret}`}>
            {factor.secret}
          </Text>
          <Text variant="label">2. Digite o código que aparece no app</Text>
          <Field label="Código de 6 dígitos" placeholder="000000" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" inputMode="numeric" maxLength={6} />
          <Button variant="primary" block disabled={code.length !== 6 || busy} onPress={confirm}>
            {busy ? 'Confirmando…' : 'Confirmar'}
          </Button>
        </>
      ) : !error ? (
        <CatalogFallback status="loading" onRetry={() => {}} />
      ) : null}
      {error ? (
        <Text variant="bodySm" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Já cadastrado: só o código do app autenticador. */
function Code({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const { data: list } = await supabase.auth.mfa.listFactors();
    const factor = list?.totp[0];
    const { error: e } = factor ? await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code }) : { error: new Error() };
    setBusy(false);
    if (e) setError('Código incorreto. Confira o app autenticador e tente de novo.');
    else onDone();
  };

  return (
    <View style={styles.inner}>
      <View style={styles.lock}>
        <Icon name="key-round" size={26} />
      </View>
      <Text variant="titleSm" accessibilityRole="header">
        Código do app autenticador
      </Text>
      <Text variant="body" color={colors.inkBody}>
        Abra o app autenticador e digite o código da Rezolveaê.
      </Text>
      <Field label="Código de 6 dígitos" placeholder="000000" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" inputMode="numeric" maxLength={6} autoFocus onSubmitEditing={confirm} />
      {error ? (
        <Text variant="bodySm" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button variant="primary" block disabled={code.length !== 6 || busy} onPress={confirm}>
        {busy ? 'Confirmando…' : 'Entrar no painel'}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  inner: { gap: spacing[4] },
  qr: { alignSelf: 'flex-start', padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  secret: { padding: spacing[3], borderRadius: radius.md, backgroundColor: colors.surfaceMuted, letterSpacing: 1 },
  lock: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
});
