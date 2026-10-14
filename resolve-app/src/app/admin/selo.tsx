import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionSheet, Button, CheckItem, PhotoViewer, Text } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { supabase } from '@/lib/supabase';
import { AdminPage, Empty, useAdminRpc } from '@/screens/admin/shared';
import { colors, radius, spacing } from '@/theme/tokens';
import { confirm, notify } from '@/utils/dialog';
import { timeAgo } from '@/utils/format';

/** Motivos comuns de recusa (o profissional vê o texto). */
const REJECT = ['A foto do documento ficou ilegível.', 'O rosto da selfie não confere com o do documento.', 'O documento não tem foto ou não é válido.', 'A selfie não mostra o documento.'];

/** Pedido de selo Verificado, um por vez: as duas fotos grandes, o que conferir, aprovar ou recusar. */
export default function AdminSelo() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { data, loading, failed, reload } = useAdminRpc('admin_verifications');
  const [current, setCurrent] = useState<string | undefined>(params.id);
  const list = data ?? [];
  const index = Math.max(0, list.findIndex((v) => v.id === current));
  const v = list[index];
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = v ? `${v.document_path},${v.selfie_path}` : '';

  // Links que expiram em 10 minutos (o bucket é privado).
  useEffect(() => {
    if (!key) return;
    let alive = true;
    supabase.storage
      .from('verification')
      .createSignedUrls(key.split(','), 600)
      .then(({ data: signed }) => {
        if (!alive || !signed) return;
        const next: Record<string, string> = {};
        for (const s of signed) if (s.path && s.signedUrl) next[s.path] = s.signedUrl;
        setUrls(next);
      });
    return () => {
      alive = false;
    };
  }, [key]);

  const review = async (approve: boolean, reason?: string) => {
    if (!v || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_review_verification', approve ? { p_id: v.id, p_approve: true } : { p_id: v.id, p_approve: false, p_reason: reason });
    setBusy(false);
    if (error) return notify(authErrorMessage(error));
    notify(approve ? 'Selo aprovado. O profissional foi avisado.' : 'Recusado. O profissional vê o motivo.', { tone: 'success' });
    // Próximo da fila; sem mais nenhum, volta ao painel.
    const next = list[index + 1] ?? list[index - 1];
    if (!next) return router.back();
    setCurrent(next.id);
    reload();
  };

  const pics = v ? [urls[v.document_path], urls[v.selfie_path]] : [];
  const firstName = v?.name.trim().split(' ')[0] ?? '';

  return (
    <AdminPage
      title="Selo Verificado"
      right={list.length > 1 ? `${index + 1} de ${list.length}` : undefined}
      surface
      loading={!data && loading}
      failed={!data && failed}
      onRetry={reload}
      footer={
        v ? (
          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button variant="secondary" block disabled={busy} onPress={() => setRejecting(true)}>
                Recusar
              </Button>
            </View>
            <View style={{ flex: 2 }}>
              <Button variant="primary" block iconLeft="badge-check" disabled={busy} onPress={() => confirm(`Aprovar o selo de ${v.name}?`, () => review(true), { confirmLabel: 'Aprovar' })}>
                Aprovar selo
              </Button>
            </View>
          </View>
        ) : undefined
      }
    >
      {v ? (
        <>
          <View style={{ gap: spacing[1] }}>
            <Text variant="titleLg" accessibilityRole="header">
              {v.name || 'Sem nome'}
            </Text>
            <Text variant="bodySm" color={colors.inkBody} selectable>
              {[v.role_title, v.email].filter(Boolean).join(' · ')}
            </Text>
            <Text variant="caption" color={colors.inkMuted}>
              {`Enviado ${timeAgo(Date.parse(v.created_at))} · ${Number(v.rejected_before) ? `recusado ${v.rejected_before}× antes` : 'primeiro pedido de selo'}`}
            </Text>
          </View>

          <View style={{ gap: spacing[2] }}>
            <View style={styles.photos}>
              {['Documento', 'Selfie com o documento'].map((label, i) => (
                <Pressable key={label} accessibilityRole="button" accessibilityLabel={`Ampliar: ${label}`} onPress={() => pics.every(Boolean) && setViewer(i)} style={styles.photoBox}>
                  {pics[i] ? <Image source={{ uri: pics[i] }} style={styles.photo} contentFit="cover" /> : <View style={[styles.photo, { backgroundColor: colors.surfaceStrong }]} />}
                  <Text variant="label">{label}</Text>
                </Pressable>
              ))}
            </View>
            <Text variant="caption" color={colors.inkMuted}>
              Toque numa foto para ampliar.
            </Text>
          </View>

          <View style={styles.check}>
            <Text variant="labelLg">Confira antes de aprovar</Text>
            <CheckItem>O rosto da selfie é o mesmo do documento</CheckItem>
            <CheckItem>{`O nome no documento é ${v.name || 'o do perfil'}`}</CheckItem>
            <CheckItem>O documento tem foto e dá para ler</CheckItem>
          </View>

          <Text variant="caption" color={colors.inkMuted}>
            {`As fotos são apagadas do servidor depois da análise. ${firstName} recebe um aviso com a decisão.`}
          </Text>

          <PhotoViewer uris={pics.every(Boolean) ? (pics as string[]) : []} index={viewer} onClose={() => setViewer(null)} />
          <ActionSheet visible={rejecting} title="Motivo da recusa (o profissional vê)" onClose={() => setRejecting(false)} actions={REJECT.map((r) => ({ icon: 'x', label: r, onPress: () => review(false, r) }))} />
        </>
      ) : (
        <Empty text="Nenhum pedido de selo esperando análise." />
      )}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing[3] },
  photos: { flexDirection: 'row', gap: spacing[3] },
  photoBox: { flex: 1, gap: spacing[2] },
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md },
  check: { gap: spacing[3], padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.surfaceMuted },
});
