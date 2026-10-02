import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, ListRow, Text } from '@/components';
import { defaultAddress } from '@/data/catalog';
import { useApp } from '@/state/app';
import { useAuth } from '@/state/auth';
import { colors, radius, spacing } from '@/theme/tokens';
import { confirm, notify } from '@/utils/dialog';

const ROLE_LABEL = { cliente: 'Cliente', profissional: 'Profissional' } as const;

export default function Perfil() {
  const insets = useSafeAreaInsets();
  const { favorites, orders } = useApp();
  const { session, profile, signOut } = useAuth();
  const done = orders.filter((o) => o.status === 'concluido').length;
  const email = session?.user.email;
  const name = profile?.full_name.trim() || (session ? 'Sua conta' : 'Visitante');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing[8] }}>
      <View style={[styles.hero, { paddingTop: insets.top + spacing[5] }]}>
        <Avatar size={72} uri={profile?.avatar_url ?? undefined} />
        <Text variant="titleLg" numberOfLines={1}>
          {name}
        </Text>
        {session ? (
          <Text variant="body" color={colors.onBrand} numberOfLines={1}>
            {[email, profile ? ROLE_LABEL[profile.role] : null].filter(Boolean).join(' · ')}
          </Text>
        ) : (
          <>
            <Text variant="body" color={colors.onBrand}>
              Entre para salvar seus pedidos e conversas.
            </Text>
            <Button variant="dark" size="md" onPress={() => router.push('/entrar')}>
              Entrar ou criar conta
            </Button>
          </>
        )}
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text variant="titleLg">{done}</Text>
          <Text variant="caption" color={colors.inkMuted}>
            serviços resolvidos
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="titleLg">{favorites.length}</Text>
          <Text variant="caption" color={colors.inkMuted}>
            favoritos
          </Text>
        </View>
      </View>

      <View style={styles.list}>
        <ListRow icon="heart" value="Favoritos" onPress={() => router.push('/favoritos')} />
        <ListRow icon="map-pin" label="Endereço principal" value={`${defaultAddress.label} · ${defaultAddress.line}`} onPress={() => notify('Endereços em breve.')} />
        <ListRow icon="bell" value="Notificações" onPress={() => notify('Configurações de notificação em breve.')} />
        <ListRow icon="shield-check" value="Segurança e privacidade" onPress={() => notify('Em breve.')} />
        <ListRow icon="circle-help" value="Ajuda" onPress={() => notify('Central de ajuda em breve.')} />
        <View style={styles.pro}>
          <ListRow icon="briefcase" label="Para profissionais" value="Ofereça seus serviços no Resolve" onPress={() => notify('Cadastro de profissionais em breve.')} />
        </View>
        {session ? (
          <View style={{ marginTop: spacing[3] }}>
            <ListRow icon="log-out" value="Sair" danger onPress={() => confirm('Sair da sua conta neste aparelho?', () => signOut())} />
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[8],
    gap: spacing[2],
    alignItems: 'flex-start',
    borderBottomLeftRadius: radius.sheet,
    borderBottomRightRadius: radius.sheet,
  },
  stats: { flexDirection: 'row', gap: spacing[3], paddingHorizontal: spacing[5], marginTop: -spacing[6] },
  stat: { flex: 1, padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.surface, boxShadow: '0px 6px 16px rgba(17,24,39,0.08)', gap: 2 },
  list: { paddingHorizontal: spacing[3], paddingTop: spacing[5], gap: 2 },
  pro: { marginTop: spacing[3], borderRadius: radius.lg, backgroundColor: colors.brandTint },
});
