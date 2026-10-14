import { useEffect, useState } from 'react';
import { AppState, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, EmptyState, ListRow, Text, ToggleRow, TopBar } from '@/components';
import type { TablesInsert } from '@/lib/database.types';
import { pushStatus, registerPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/state/auth';
import { colors, spacing } from '@/theme/tokens';
import { notify } from '@/utils/dialog';

type Prefs = { messages: boolean; updates: boolean };
type Device = Awaited<ReturnType<typeof pushStatus>>;

const DEVICE: Record<Device, { value: string; hint: string }> = {
  granted: { value: 'Ativadas', hint: 'Você recebe os avisos escolhidos abaixo.' },
  denied: { value: 'Desativadas', hint: 'Ative para saber na hora de novas mensagens e propostas.' },
  blocked: { value: 'Desativadas', hint: 'As notificações estão bloqueadas. Ative o Resolve nos ajustes do celular.' },
  unavailable: { value: 'Indisponíveis aqui', hint: 'As notificações funcionam no app instalado no celular.' },
};

/** Perfil → Notificações: permissão deste aparelho e o que avisar (vale para todos os aparelhos da conta). */
export default function Notificacoes() {
  const { session, profile } = useAuth();
  const userId = session?.user.id;
  const isPro = profile?.role === 'profissional';
  const [device, setDevice] = useState<Device | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  // De novo ao voltar dos ajustes do celular.
  useEffect(() => {
    const check = () => pushStatus().then(setDevice);
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, []);

  // Sem linha salva = tudo ligado.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    supabase
      .from('notification_prefs')
      .select('messages, updates')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) notify('Não foi possível carregar suas preferências. Tente de novo.');
        else setPrefs(data ?? { messages: true, updates: true });
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const change = async (key: keyof Prefs, value: boolean) => {
    if (!prefs || !userId) return;
    setPrefs({ ...prefs, [key]: value });
    // Só a coluna tocada: dois toques seguidos não se sobrescrevem.
    const row: TablesInsert<'notification_prefs'> = { user_id: userId };
    row[key] = value;
    const { error } = await supabase.from('notification_prefs').upsert(row);
    if (error) {
      setPrefs((p) => p && { ...p, [key]: !value });
      notify('Não foi possível salvar. Tente de novo.');
    }
  };

  const enable = async () => {
    if (device === 'blocked') {
      Linking.openSettings().catch(() => notify('Abra os ajustes do celular e ative as notificações do Resolve.'));
      return;
    }
    const r = await registerPush({ ask: true });
    setDevice(r === 'granted' ? 'granted' : await pushStatus());
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Notificações" />
      {session ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={{ gap: spacing[1] }}>
            <ListRow
              icon="bell"
              label="Neste aparelho"
              value={device ? DEVICE[device].value : '…'}
              trailing={
                device === 'denied' || device === 'blocked' ? (
                  <Button size="md" onPress={enable}>
                    {device === 'blocked' ? 'Abrir ajustes' : 'Ativar'}
                  </Button>
                ) : undefined
              }
            />
            <Text variant="caption" color={colors.inkMuted} style={styles.hint}>
              {device ? DEVICE[device].hint : ' '}
            </Text>
          </View>

          <View style={{ gap: spacing[2] }}>
            <Text variant="titleSm" accessibilityRole="header">
              Avisar sobre
            </Text>
            <View>
              <ToggleRow
                icon="message-circle"
                title="Mensagens"
                description="Quando escreverem para você no chat"
                value={prefs?.messages ?? true}
                disabled={!prefs}
                onChange={(v) => change('messages', v)}
              />
              <ToggleRow
                icon="clipboard-list"
                title="Pedidos e propostas"
                description={isPro ? 'Pedidos novos e andamento dos serviços' : 'Propostas recebidas e andamento dos serviços'}
                value={prefs?.updates ?? true}
                disabled={!prefs}
                onChange={(v) => change('updates', v)}
              />
            </View>
            <Text variant="caption" color={colors.inkMuted} style={styles.hint}>
              Vale para todos os seus aparelhos. Com os avisos desligados, tudo continua em Mensagens.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <EmptyState icon="bell" title="Entre para escolher seus avisos" />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[4], paddingTop: spacing[2], gap: spacing[6], paddingBottom: spacing[8] },
  hint: { paddingHorizontal: spacing[2] },
});
