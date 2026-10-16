import { router, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Icon, ListRow, Text } from '@/components';
import { AVATAR_SIDE, pickPhotos } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { deleteReviewedPhotos, latestVerification, type Verification } from '@/lib/verification';
import { useAddresses } from '@/state/addresses';
import { useAuth } from '@/state/auth';
import { useCatalog } from '@/state/catalog';
import { colors, radius, spacing } from '@/theme/tokens';
import { confirm, notify } from '@/utils/dialog';
import { formatCount, formatDecimal, formatPhoneBR } from '@/utils/format';

const ROLE_LABEL = { cliente: 'CLIENTE', profissional: 'PROFISSIONAL' } as const;

export default function Perfil() {
  const insets = useSafeAreaInsets();
  const { session, profile, signOut, setAvatar } = useAuth();
  const { getProfessional, getService } = useCatalog();
  const [uploading, setUploading] = useState(false);
  const isPro = profile?.role === 'profissional';
  const me = isPro ? getProfessional(session?.user.id) : undefined;
  const { primary } = useAddresses();
  const email = session?.user.email;

  // Profissional: situação do selo Verificado (de novo a cada vez que a aba aparece).
  const focused = useIsFocused();
  const [verification, setVerification] = useState<Verification['status'] | null>(null);
  useEffect(() => {
    if (!session || !focused) return;
    let alive = true;
    latestVerification().then(
      (v) => alive && setVerification(v?.status ?? null),
      () => {},
    );
    // Análise terminada: as fotos saem do servidor.
    deleteReviewedPhotos().catch(() => {});
    return () => {
      alive = false;
    };
  }, [session, focused]);
  // Equipe da Rezolveaê: entrada do painel de moderação. Cliente: verificação pedida pela moderação.
  const [admin, setAdmin] = useState(false);
  const [identity, setIdentity] = useState<{ required: boolean; verified: boolean } | null>(null);
  // Cliente: média das notas dos profissionais (só a partir de 3 avaliações).
  const [clientRating, setClientRating] = useState<{ rating: number | null; reviews: number } | null>(null);
  useEffect(() => {
    if (!session || !focused) return;
    let alive = true;
    supabase.rpc('am_i_admin').then(({ data }) => alive && setAdmin(!!data));
    supabase.rpc('my_verification').then(({ data }) => alive && setIdentity(data?.[0] ?? null));
    supabase.rpc('my_client_rating').then(({ data }) => {
      const r = data?.[0];
      if (alive && r) setClientRating({ rating: r.rating == null ? null : Number(r.rating), reviews: r.reviews });
    });
    return () => {
      alive = false;
    };
  }, [session, focused]);
  const seal = me?.verified ? 'Verificado' : verification === 'pending' ? 'Em análise' : verification === 'rejected' ? 'Envie as fotos de novo' : 'Verificar identidade';
  const name = profile?.full_name.trim() || (session ? 'Sua conta' : 'Visitante');
  // Profissional: resumo da nota e dos serviços da ficha, nas linhas de "Seu trabalho".
  const ratingText = me ? (me.reviews ? `${formatDecimal(me.rating)} · ${formatCount(me.reviews)} ${me.reviews === 1 ? 'avaliação' : 'avaliações'}` : 'Novo · sem avaliações') : 'Aparece com a ficha completa';
  const serviceText = me ? me.serviceIds.map((id) => getService(id)?.short).filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' e $1') : 'Completar ficha';

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
            <View style={styles.nameRow}>
              <Text variant="titleLg" numberOfLines={2} style={{ flexShrink: 1 }}>
                {name}
              </Text>
              {me?.verified ? <Icon name="badge-check" size={20} strokeWidth={2.25} fill={colors.brand} label="Verificado" /> : null}
            </View>
            {session && profile ? (
              <View style={styles.roleRow}>
                <View style={styles.role}>
                  <Text variant="overline" color={colors.onInk}>
                    {ROLE_LABEL[profile.role]}
                  </Text>
                </View>
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

      <View style={styles.body}>
        {isPro ? (
          <>
            <Text variant="overline" color={colors.inkMuted} style={styles.groupLabel}>
              SEU TRABALHO
            </Text>
            <View style={styles.group}>
              <ListRow
                icon="star"
                label="Perfil público"
                value={ratingText}
                onPress={() => (me ? router.push({ pathname: '/profissional/[id]', params: { id: me.id } }) : router.push('/profissional/ficha'))}
              />
              <ListRow icon="briefcase" label="Serviços, área e apresentação" value={serviceText} onPress={() => router.push('/profissional/ficha')} />
              <ListRow icon="badge-check" label="Selo Verificado" value={seal} onPress={() => router.push('/verificacao')} />
            </View>
            <Text variant="overline" color={colors.inkMuted} style={styles.groupLabel}>
              CONTA
            </Text>
            <View style={styles.group}>
              <ListRow
                icon="phone"
                label="Telefone"
                value={profile?.phone ? formatPhoneBR(profile.phone) : 'Adicionar telefone'}
                onPress={() => router.push('/telefone')}
              />
              <ListRow icon="bell" value="Notificações" onPress={() => router.push('/notificacoes')} />
              <ListRow icon="shield-check" value="Conta e privacidade" onPress={() => router.push('/conta')} />
              <ListRow icon="circle-help" value="Ajuda" onPress={() => router.push('/ajuda')} />
            </View>
          </>
        ) : (
          <View style={styles.group}>
            <ListRow icon="heart" value="Favoritos" onPress={() => router.push('/favoritos')} />
            {session ? (
              <ListRow
                icon="phone"
                label="Telefone"
                value={profile?.phone ? formatPhoneBR(profile.phone) : 'Adicionar telefone'}
                onPress={() => router.push('/telefone')}
              />
            ) : null}
            {identity?.required || identity?.verified ? (
              <ListRow
                icon="badge-check"
                label="Verificação de identidade"
                value={identity.verified ? 'Confirmada' : verification === 'pending' ? 'Em análise' : 'Necessária para fazer pedidos'}
                onPress={() => router.push('/verificacao')}
              />
            ) : null}
            {session && clientRating ? (
              <ListRow
                icon="star"
                label="Sua nota como cliente"
                value={
                  clientRating.rating != null
                    ? `${formatDecimal(clientRating.rating)} · ${formatCount(clientRating.reviews)} avaliações`
                    : 'Aparece depois de 3 avaliações'
                }
                onPress={() =>
                  notify(
                    'Depois de cada serviço concluído, o profissional dá uma nota de 1 a 5. Você vê só a média de todas, a partir de 3 avaliações, e os profissionais que você chamar veem a mesma média.',
                  )
                }
              />
            ) : null}
            <ListRow
              icon="map-pin"
              label="Endereço principal"
              value={primary ? `${primary.label} · ${primary.line}` : 'Adicionar endereço'}
              onPress={() => router.push('/enderecos')}
            />
            {session ? <ListRow icon="bell" value="Notificações" onPress={() => router.push('/notificacoes')} /> : null}
          </View>
        )}

        {admin ? (
          <View style={styles.group}>
            <ListRow icon="settings" value="Painel de moderação" onPress={() => router.push('/admin')} />
          </View>
        ) : null}

        {!isPro ? (
          <View style={styles.group}>
            <ListRow icon="shield-check" value="Conta e privacidade" onPress={() => router.push('/conta')} />
            <ListRow icon="circle-help" value="Ajuda" onPress={() => router.push('/ajuda')} />
          </View>
        ) : null}

        {!isPro ? (
          <View style={[styles.group, { backgroundColor: colors.brandTint }]}>
            <ListRow
              icon="briefcase"
              label="Para profissionais"
              value="Ofereça seus serviços na Rezolveaê"
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
    paddingBottom: spacing[6],
    gap: spacing[4],
    borderBottomLeftRadius: radius.sheet,
    borderBottomRightRadius: radius.sheet,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing[4] },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' },
  role: { alignSelf: 'flex-start', paddingHorizontal: spacing[2], paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.ink },
  body: { paddingHorizontal: spacing[4], paddingTop: spacing[5], gap: spacing[4] },
  groupLabel: { paddingHorizontal: spacing[2], marginBottom: -spacing[2] },
  group: { borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden', paddingVertical: spacing[1] },
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
