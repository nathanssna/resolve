import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Icon, ListRow, Text, type IconName } from '@/components';
import { AVATAR_SIDE, pickPhotos } from '@/lib/photos';
import { useAddresses } from '@/state/addresses';
import { useApp } from '@/state/app';
import { useAuth } from '@/state/auth';
import { useCatalog } from '@/state/catalog';
import { colors, radius, shadows, spacing } from '@/theme/tokens';
import { confirm, notify } from '@/utils/dialog';
import { formatCount, formatDecimal, formatPhoneBR } from '@/utils/format';

const ROLE_LABEL = { cliente: 'CLIENTE', profissional: 'PROFISSIONAL' } as const;

/** Número em destaque no cartão sob o topo; tocar leva ao detalhe. */
function Stat({ value, label, icon, onPress }: { value: string; label: string; icon?: IconName; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${value} ${label}`} onPress={onPress} style={({ pressed }) => [styles.stat, pressed && { backgroundColor: colors.surfaceMuted }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {icon ? <Icon name={icon} size={16} fill={icon === 'star' ? colors.star : 'none'} color={icon === 'star' ? colors.star : colors.ink} strokeWidth={icon === 'star' ? 1 : 2} /> : null}
        <Text variant="titleMd">{value}</Text>
      </View>
      <Text variant="caption" color={colors.inkMuted} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function Perfil() {
  const insets = useSafeAreaInsets();
  const { favorites, orders } = useApp();
  const { session, profile, signOut, setAvatar } = useAuth();
  const { getProfessional } = useCatalog();
  const [uploading, setUploading] = useState(false);
  const isPro = profile?.role === 'profissional';
  const me = isPro ? getProfessional(session?.user.id) : undefined;
  const { primary, addresses } = useAddresses();
  const done = orders.filter((o) => o.status === 'concluido').length;
  const email = session?.user.email;
  const name = profile?.full_name.trim() || (session ? 'Sua conta' : 'Visitante');

  // Profissional: o que falta para o perfil passar confiança.
  const missing = isPro
    ? [
        !profile?.avatar_url && { label: 'Foto', onPress: () => changePhoto() },
        !profile?.phone && { label: 'Telefone', onPress: () => router.push('/telefone') },
        !me?.bio && { label: 'Apresentação', onPress: () => router.push('/profissional/ficha') },
      ].filter((x): x is { label: string; onPress: () => void } => !!x)
    : [];

  async function changePhoto() {
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
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={{ paddingBottom: spacing[8] }}>
      <View style={[styles.hero, { paddingTop: insets.top + spacing[5] }]}>
        <View style={styles.identity}>
          {session ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={profile?.avatar_url ? 'Trocar foto de perfil' : 'Adicionar foto de perfil'}
              onPress={changePhoto}
              disabled={uploading}
            >
              <Avatar size={76} uri={profile?.avatar_url ?? undefined} />
              <View style={styles.photoBadge}>
                {uploading ? <ActivityIndicator size="small" color={colors.ink} /> : <Icon name="camera" size={14} strokeWidth={2.25} />}
              </View>
            </Pressable>
          ) : (
            <Avatar size={76} />
          )}
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="titleLg" numberOfLines={2}>
              {name}
            </Text>
            {session && profile ? (
              <View style={styles.roleRow}>
                <View style={styles.role}>
                  <Text variant="overline" color={colors.onInk}>
                    {ROLE_LABEL[profile.role]}
                  </Text>
                </View>
                {me?.verified ? (
                  <View style={styles.verified}>
                    <Icon name="badge-check" size={14} strokeWidth={2.25} color={colors.success} />
                    <Text variant="overline" color={colors.success}>
                      VERIFICADO
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {email ? (
              <Text variant="caption" color={colors.onBrand} numberOfLines={1}>
                {email}
              </Text>
            ) : null}
          </View>
        </View>
        {!session ? (
          <View style={{ gap: spacing[3] }}>
            <Text variant="body" color={colors.onBrand}>
              Entre para salvar seus pedidos e conversas.
            </Text>
            <Button variant="dark" size="md" onPress={() => router.push('/entrar')} style={{ alignSelf: 'flex-start' }}>
              Entrar ou criar conta
            </Button>
          </View>
        ) : null}
      </View>

      {session ? (
        <View style={styles.statsCard}>
          {isPro ? (
            <>
              <Stat
                value={me?.reviews ? formatDecimal(me.rating) : 'Novo'}
                label={me?.reviews ? `${formatCount(me.reviews)} ${me.reviews === 1 ? 'avaliação' : 'avaliações'}` : 'sem avaliações'}
                icon={me?.reviews ? 'star' : 'sparkles'}
                onPress={me ? () => router.push({ pathname: '/profissional/[id]', params: { id: me.id } }) : undefined}
              />
              <View style={styles.statDivider} />
              <Stat value={formatCount(done)} label={done === 1 ? 'serviço feito' : 'serviços feitos'} onPress={() => router.push('/pedidos')} />
            </>
          ) : (
            <>
              <Stat value={formatCount(done)} label={done === 1 ? 'serviço resolvido' : 'serviços resolvidos'} onPress={() => router.push('/pedidos')} />
              <View style={styles.statDivider} />
              <Stat value={formatCount(favorites.length)} label="favoritos" onPress={() => router.push('/favoritos')} />
              <View style={styles.statDivider} />
              <Stat value={formatCount(addresses.length)} label={addresses.length === 1 ? 'endereço' : 'endereços'} onPress={() => router.push('/enderecos')} />
            </>
          )}
        </View>
      ) : null}

      <View style={styles.body}>
        {isPro ? (
          <View style={styles.proCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
              <View style={styles.proIcon}>
                <Icon name="briefcase" size={22} duotone />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="labelLg">Seu perfil profissional</Text>
                <Text variant="bodySm" color={colors.inkBody} numberOfLines={2}>
                  {me ? me.role || 'Profissional' : 'Ficha incompleta: os clientes ainda não encontram você.'}
                </Text>
              </View>
            </View>
            {missing.length ? (
              <View style={{ gap: spacing[2] }}>
                <Text variant="caption" color={colors.inkBody}>
                  Perfis completos recebem mais pedidos. Falta:
                </Text>
                <View style={styles.missing}>
                  {missing.map((m) => (
                    <Pressable key={m.label} accessibilityRole="button" onPress={m.onPress} style={({ pressed }) => [styles.missingChip, pressed && { opacity: 0.8 }]}>
                      <Icon name="plus" size={14} strokeWidth={2.5} />
                      <Text variant="label">{m.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <View style={{ flex: 1 }}>
                <Button variant="dark" size="md" block iconLeft="pencil" onPress={() => router.push('/profissional/ficha')}>
                  {me ? 'Editar ficha' : 'Completar ficha'}
                </Button>
              </View>
              {me ? (
                <View style={{ flex: 1 }}>
                  <Button variant="secondary" size="md" block onPress={() => router.push({ pathname: '/profissional/[id]', params: { id: me.id } })}>
                    Ver como cliente
                  </Button>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.group}>
          {!isPro ? <ListRow icon="heart" value="Favoritos" onPress={() => router.push('/favoritos')} /> : null}
          {session ? (
            <ListRow
              icon="phone"
              label="Telefone"
              value={profile?.phone ? formatPhoneBR(profile.phone) : 'Adicionar telefone'}
              onPress={() => router.push('/telefone')}
            />
          ) : null}
          {!isPro ? (
            <ListRow
              icon="map-pin"
              label="Endereço principal"
              value={primary ? `${primary.label} · ${primary.line}` : 'Adicionar endereço'}
              onPress={() => router.push('/enderecos')}
            />
          ) : null}
          <ListRow icon="bell" value="Notificações" onPress={() => notify('Configurações de notificação em breve.')} />
        </View>

        <View style={styles.group}>
          <ListRow icon="shield-check" value="Conta e privacidade" onPress={() => router.push('/conta')} />
          <ListRow icon="circle-help" value="Ajuda" onPress={() => notify('Central de ajuda em breve.')} />
        </View>

        {!isPro ? (
          <View style={[styles.group, { backgroundColor: colors.brandTint }]}>
            <ListRow
              icon="briefcase"
              label="Para profissionais"
              value="Ofereça seus serviços no Resolve"
              onPress={() => notify('Para oferecer serviços, crie uma conta de profissional: saia e entre com outro e-mail, escolhendo "Sou profissional".')}
            />
          </View>
        ) : null}

        {session ? (
          <View style={styles.group}>
            <ListRow icon="log-out" value="Sair" danger onPress={() => confirm('Sair da sua conta neste aparelho?', () => signOut(), { confirmLabel: 'Sair' })} />
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
    paddingBottom: spacing[10],
    gap: spacing[4],
    borderBottomLeftRadius: radius.sheet,
    borderBottomRightRadius: radius.sheet,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' },
  role: { alignSelf: 'flex-start', paddingHorizontal: spacing[2], paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.ink },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing[2], paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.successTint },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: spacing[5],
    marginTop: -spacing[8],
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    boxShadow: shadows.card,
    overflow: 'hidden',
  },
  stat: { flex: 1, paddingVertical: spacing[3], paddingHorizontal: spacing[4], gap: 2 },
  statDivider: { width: 1, backgroundColor: colors.line, marginVertical: spacing[3] },
  body: { paddingHorizontal: spacing[4], paddingTop: spacing[5], gap: spacing[4] },
  group: { borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden', paddingVertical: spacing[1] },
  proCard: { padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.surface, boxShadow: shadows.card, gap: spacing[4] },
  proIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brandTint, alignItems: 'center', justifyContent: 'center' },
  missing: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  missingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
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
