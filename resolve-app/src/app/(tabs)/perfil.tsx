import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Icon, ListRow, Text } from '@/components';
import { AVATAR_SIDE, pickPhotos } from '@/lib/photos';
import { useAddresses } from '@/state/addresses';
import { useApp } from '@/state/app';
import { useAuth } from '@/state/auth';
import { colors, radius, spacing } from '@/theme/tokens';
import { confirm, notify } from '@/utils/dialog';
import { formatPhoneBR } from '@/utils/format';

const ROLE_LABEL = { cliente: 'Cliente', profissional: 'Profissional' } as const;

export default function Perfil() {
  const insets = useSafeAreaInsets();
  const { favorites, orders } = useApp();
  const { session, profile, signOut, setAvatar } = useAuth();
  const [uploading, setUploading] = useState(false);
  const isPro = profile?.role === 'profissional';
  const { primary } = useAddresses();
  const done = orders.filter((o) => o.status === 'concluido').length;
  const email = session?.user.email;
  const name = profile?.full_name.trim() || (session ? 'Sua conta' : 'Visitante');

  const changePhoto = async () => {
    if (uploading) return;
    try {
      const [photo] = await pickPhotos({ square: true, maxSide: AVATAR_SIDE });
      if (!photo) return;
      setUploading(true);
      await setAvatar(photo);
    } catch {
      notify('Não foi possível trocar a foto. Tente de novo.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: spacing[8] }}>
      <View style={[styles.hero, { paddingTop: insets.top + spacing[5] }]}>
        {session ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={profile?.avatar_url ? 'Trocar foto de perfil' : 'Adicionar foto de perfil'}
            onPress={changePhoto}
            disabled={uploading}
            style={{ alignSelf: 'flex-start' }}
          >
            <Avatar size={72} uri={profile?.avatar_url ?? undefined} />
            <View style={styles.photoBadge}>
              {uploading ? <ActivityIndicator size="small" color={colors.ink} /> : <Icon name="camera" size={14} strokeWidth={2.25} />}
            </View>
          </Pressable>
        ) : (
          <Avatar size={72} />
        )}
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
        {isPro ? (
          <View style={styles.pro}>
            <ListRow icon="briefcase" label="O que os clientes veem" value="Minha ficha profissional" onPress={() => router.push('/profissional/ficha')} />
          </View>
        ) : null}
        <ListRow icon="heart" value="Favoritos" onPress={() => router.push('/favoritos')} />
        {session ? (
          <ListRow
            icon="phone"
            label="Telefone"
            value={profile?.phone ? formatPhoneBR(profile.phone) : 'Adicionar telefone'}
            onPress={() => router.push('/telefone')}
          />
        ) : null}
        <ListRow
          icon="map-pin"
          label="Endereço principal"
          value={primary ? `${primary.label} · ${primary.line}` : 'Adicionar endereço'}
          onPress={() => router.push('/enderecos')}
        />
        <ListRow icon="bell" value="Notificações" onPress={() => notify('Configurações de notificação em breve.')} />
        <ListRow icon="shield-check" value="Conta e privacidade" onPress={() => router.push('/conta')} />
        <ListRow icon="circle-help" value="Ajuda" onPress={() => notify('Central de ajuda em breve.')} />
        {!isPro ? (
          <View style={styles.pro}>
            <ListRow
              icon="briefcase"
              label="Para profissionais"
              value="Ofereça seus serviços no Resolve"
              onPress={() => notify('Para oferecer serviços, crie uma conta de profissional: saia e entre com outro e-mail, escolhendo "Sou profissional".')}
            />
          </View>
        ) : null}
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
  photoBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.brand,
  },
});
