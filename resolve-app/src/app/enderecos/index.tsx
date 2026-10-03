import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge, Button, CatalogFallback, EmptyState, Icon, StickyFooter, Text, TopBar } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { useAddresses } from '@/state/addresses';
import { colors, radius, spacing } from '@/theme/tokens';
import { notify } from '@/utils/dialog';

/** Meus endereços: o principal aparece no Início e vem escolhido no pedido. */
export default function Enderecos() {
  const { status, addresses, refresh, setPrimary } = useAddresses();
  const [busy, setBusy] = useState<string | null>(null);

  const makePrimary = async (id: string) => {
    setBusy(id);
    try {
      await setPrimary(id);
    } catch (e) {
      notify(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Meus endereços" />
      <ScrollView contentContainerStyle={styles.content}>
        {status === 'idle' ? (
          <View style={{ gap: spacing[4] }}>
            <EmptyState icon="map-pin" title="Entre para salvar seus endereços" />
            <Button variant="primary" block onPress={() => router.push('/entrar')}>
              Entrar ou criar conta
            </Button>
          </View>
        ) : null}
        {status === 'loading' || status === 'error' ? <CatalogFallback status={status} onRetry={refresh} /> : null}
        {status === 'ready' && addresses.length === 0 ? (
          <EmptyState icon="map-pin" title="Nenhum endereço ainda" description="Adicione onde o serviço vai ser feito. O profissional só vê rua e número depois que vocês combinarem." />
        ) : null}

        {addresses.map((a) => (
          <View key={a.id} style={[styles.card, a.isDefault && styles.cardPrimary]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Editar ${a.label}: ${a.line}`}
              onPress={() => router.push({ pathname: '/enderecos/editar', params: { id: a.id } })}
              style={styles.cardMain}
            >
              <View style={styles.icon}>
                <Icon name={a.label === 'Trabalho' ? 'briefcase' : a.label === 'Casa' ? 'house' : 'map-pin'} size={22} duotone />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                  <Text variant="labelLg">{a.label}</Text>
                  {a.isDefault ? <Badge tone="ink">PRINCIPAL</Badge> : null}
                </View>
                <Text variant="body" color={colors.inkBody}>
                  {[a.line, a.complement].filter(Boolean).join(', ')}
                </Text>
                <Text variant="bodySm" color={colors.inkMuted}>
                  {[a.area, [a.city, a.state].filter(Boolean).join('/')].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Icon name="pencil" size={18} color={colors.inkMuted} />
            </Pressable>
            {!a.isDefault ? (
              <Button variant="link" disabled={!!busy} onPress={() => makePrimary(a.id)} style={{ alignSelf: 'flex-start' }}>
                {busy === a.id ? 'Salvando…' : 'Usar como principal'}
              </Button>
            ) : null}
          </View>
        ))}
      </ScrollView>

      {status === 'ready' ? (
        <StickyFooter>
          <Button variant="primary" block iconLeft="plus" onPress={() => router.push('/enderecos/editar')}>
            Adicionar endereço
          </Button>
        </StickyFooter>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[5], paddingTop: spacing[2], gap: spacing[3] },
  card: { padding: spacing[4], borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, gap: spacing[2] },
  cardPrimary: { borderColor: colors.focus, backgroundColor: colors.brandTint },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  icon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
});
