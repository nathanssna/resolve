import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, CatalogFallback, EmptyState, Icon, InfoBanner, OptionChip, StickyFooter, Text, TopBar } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { PermissionDeniedError, pickPhotos, type LocalPhoto } from '@/lib/photos';
import { deleteReviewedPhotos, DOCUMENT_SIDE, latestVerification, submitVerification, type Verification } from '@/lib/verification';
import { useAuth } from '@/state/auth';
import { useCatalog } from '@/state/catalog';
import { colors, radius, spacing } from '@/theme/tokens';
import { notify } from '@/utils/dialog';

/** Uma das duas fotos: miniatura e botões de câmera/galeria. */
function PhotoSlot({ title, hint, photo, onPick }: { title: string; hint: string; photo: LocalPhoto | null; onPick: (source: 'camera' | 'library') => void }) {
  return (
    <View style={styles.slot}>
      {photo ? (
        <Image source={{ uri: photo.uri }} style={styles.thumb} contentFit="cover" accessibilityLabel={title} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Icon name="camera" size={24} color={colors.inkMuted} />
        </View>
      )}
      <View style={{ flex: 1, gap: spacing[2] }}>
        <View style={{ gap: 2 }}>
          <Text variant="label">{title}</Text>
          <Text variant="caption" color={colors.inkMuted}>
            {hint}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          {Platform.OS !== 'web' ? (
            <Button variant="secondary" size="md" onPress={() => onPick('camera')}>
              Câmera
            </Button>
          ) : null}
          <Button variant="secondary" size="md" onPress={() => onPick('library')}>
            {photo ? 'Trocar' : 'Galeria'}
          </Button>
        </View>
      </View>
    </View>
  );
}

/** Perfil → Selo Verificado: documento com foto e selfie com o documento, analisados pela equipe. */
export default function Verificacao() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const { getProfessional } = useCatalog();
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; latest: Verification | null }>({ status: 'loading', latest: null });
  const [docPhoto, setDocPhoto] = useState<LocalPhoto | null>(null);
  const [selfie, setSelfie] = useState<LocalPhoto | null>(null);
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    latestVerification().then(
      (latest) => setState({ status: 'ready', latest }),
      () => setState({ status: 'error', latest: null }),
    );
    // Análise terminada: as fotos saem do servidor.
    deleteReviewedPhotos().catch(() => {});
  }, []);
  useEffect(load, [load]);

  const latest = state.latest;
  const verified = !!getProfessional(uid)?.verified || latest?.status === 'approved';

  const pick = async (set: (p: LocalPhoto) => void, source: 'camera' | 'library') => {
    try {
      const [photo] = await pickPhotos({ source, maxSide: DOCUMENT_SIDE });
      if (photo) set(photo);
    } catch (e) {
      notify(e instanceof PermissionDeniedError ? 'Permita o acesso à câmera nas configurações do celular.' : 'Não foi possível usar essa foto. Tente outra.');
    }
  };

  const submit = async () => {
    if (!uid || !docPhoto || !selfie || !consent || sending) return;
    setSending(true);
    try {
      await submitVerification(uid, docPhoto, selfie);
      setDocPhoto(null);
      setSelfie(null);
      setConsent(false);
      load();
      notify('Fotos enviadas. Avisamos quando a análise terminar.', { tone: 'success' });
    } catch (e) {
      notify(`Não foi possível enviar. ${authErrorMessage(e)}`);
    } finally {
      setSending(false);
    }
  };

  const content = () => {
    if (state.status !== 'ready') return <CatalogFallback status={state.status} onRetry={load} />;
    if (verified) return <EmptyState icon="badge-check" title="Perfil verificado" description="Os clientes veem o selo Verificado no seu perfil." />;
    if (latest?.status === 'pending') return <EmptyState icon="clock" title="Em análise" description="Recebemos suas fotos. Você recebe um aviso quando a análise terminar." />;
    return (
      <>
        {latest?.status === 'rejected' ? (
          <InfoBanner icon="info" title="Não deu para confirmar sua identidade" description={latest.reason || 'Envie as fotos de novo.'} />
        ) : null}
        <Text variant="body" color={colors.inkBody}>
          O selo Verificado mostra aos clientes que nossa equipe conferiu quem você é. Envie duas fotos:
        </Text>
        <PhotoSlot title="Documento com foto" hint="RG ou CNH, frente, sem reflexo, com o nome legível" photo={docPhoto} onPick={(s) => pick(setDocPhoto, s)} />
        <PhotoSlot title="Selfie com o documento" hint="Seu rosto e o documento aparecendo juntos" photo={selfie} onPick={(s) => pick(setSelfie, s)} />
        <OptionChip label="Autorizo o uso das fotos só para confirmar minha identidade" active={consent} onPress={() => setConsent((c) => !c)} />
        <Text variant="caption" color={colors.inkMuted}>
          A selfie é um dado sensível. As fotos ficam guardadas com acesso restrito e são apagadas depois da análise.
        </Text>
      </>
    );
  };

  const form = state.status === 'ready' && !verified && latest?.status !== 'pending';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Selo Verificado" />
      <ScrollView contentContainerStyle={styles.content}>{content()}</ScrollView>
      {form ? (
        <StickyFooter>
          <Button variant="primary" block iconLeft="badge-check" disabled={!docPhoto || !selfie || !consent || sending} onPress={submit}>
            {sending ? 'Enviando…' : 'Enviar para análise'}
          </Button>
        </StickyFooter>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[5], paddingTop: spacing[2], gap: spacing[5], paddingBottom: spacing[8] },
  slot: { flexDirection: 'row', gap: spacing[3], padding: spacing[3], borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  thumb: { width: 88, height: 88, borderRadius: radius.md },
  thumbEmpty: { backgroundColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
});
