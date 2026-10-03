import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, CheckItem, StickyFooter, Text, TopBar } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/state/app';
import { useAuth } from '@/state/auth';
import { colors, spacing } from '@/theme/tokens';
import { confirm, notify } from '@/utils/dialog';

/** Excluir a conta: apaga as fotos pelo Storage e chama delete_my_account. */
export default function ExcluirConta() {
  const { session, signOut } = useAuth();
  const { conversations, orders } = useApp();
  const [busy, setBusy] = useState(false);
  const active = orders.filter((o) => o.status === 'combinado').length;

  const run = async () => {
    const uid = session?.user.id;
    if (!uid || busy) return;
    setBusy(true);
    try {
      // Fotos primeiro (depois da exclusão, a sessão deixa de valer).
      const requestPhotos = conversations.flatMap((c) => c.messages.flatMap((m) => (m.kind === 'request' && m.from === 'me' ? m.photos : [])));
      if (requestPhotos.length) await supabase.storage.from('request-photos').remove(requestPhotos);
      await supabase.storage.from('avatars').remove([`${uid}/avatar.jpg`]);

      const { error } = await supabase.rpc('delete_my_account');
      if (error) throw error;
      await signOut();
      router.dismissAll();
      router.replace('/');
      notify('Sua conta foi excluída.');
    } catch (e) {
      notify(`Não foi possível excluir a conta. ${authErrorMessage(e)}`);
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Excluir conta" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="titleMd" accessibilityRole="header">
          Tem certeza?
        </Text>
        <Text variant="body" color={colors.inkBody}>
          A exclusão é definitiva. Para usar o Resolve de novo, você vai precisar criar outra conta.
        </Text>
        <View style={{ gap: spacing[2] }}>
          <Text variant="label">O que é apagado</Text>
          <CheckItem>Seu acesso, nome, foto e telefone</CheckItem>
          <CheckItem>Endereços, favoritos e fotos dos seus pedidos</CheckItem>
          <CheckItem>Sua ficha de profissional, se tiver uma</CheckItem>
        </View>
        <View style={{ gap: spacing[2] }}>
          <Text variant="label">O que continua para a outra pessoa</Text>
          <Text variant="bodySm" color={colors.inkBody}>
            As conversas, os serviços e as avaliações ficam para quem conversou com você, sem seu nome (aparece “Conta excluída”).
            {active ? ` ${active === 1 ? 'O serviço combinado em andamento será cancelado' : `Os ${active} serviços combinados em andamento serão cancelados`}, e a outra pessoa será avisada.` : ''}
          </Text>
        </View>
      </ScrollView>
      <StickyFooter>
        <Button
          variant="dark"
          block
          iconLeft="trash-2"
          disabled={busy}
          onPress={() => confirm('Excluir sua conta de vez? Isso não pode ser desfeito.', run)}
        >
          {busy ? 'Excluindo…' : 'Excluir minha conta'}
        </Button>
      </StickyFooter>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[5], paddingTop: spacing[2], gap: spacing[5] },
});
