import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionSheet, Button, Icon, PhotoThumbs, PhotoViewer, Text } from '@/components';
import { reportReasonLabel } from '@/content/reports';
import { authErrorMessage } from '@/lib/authErrors';
import { supabase } from '@/lib/supabase';
import { useSignedUrls } from '@/state/photoUrls';
import { AdminPage, dateBR, Section, suspension, SuspendSheet, useAdminRpc } from '@/screens/admin/shared';
import { colors, radius, spacing } from '@/theme/tokens';
import { confirm, notify } from '@/utils/dialog';
import { firstName, formatBRL, formatTime } from '@/utils/format';

type Report = {
  id: string;
  reason: string;
  details: string | null;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
  reporter: { id: string; name: string };
  reported: { id: string; name: string; suspended_until: string | null };
  reported_total: number;
  previous: { reason: string; created_at: string; resolution: string | null } | null;
  /** Denúncia de serviço (reason = servico): o serviço em disputa. */
  order: {
    id: string;
    status: string;
    service: string;
    amount: number;
    scheduled_label: string;
    done_at: string | null;
    done_photos: string[];
    done_contested_at: string | null;
  } | null;
  conversation_id: string | null;
  messages_total: number;
  messages: { id: string; created_at: string; sender_name: string; from_reported: boolean; kind: string; body: string | null }[];
};

/** Decisões comuns ao resolver (vão para reports.resolution). */
const OUTCOMES = ['Sem problema encontrado', 'Avisei a pessoa', 'Suspendi a conta'];
const ORDINAL = ['', '1ª', '2ª', '3ª', '4ª', '5ª', '6ª', '7ª', '8ª', '9ª'];

/** Uma denúncia com tudo para decidir: o que, quem, o histórico do denunciado e a conversa. */
export default function AdminDenuncia() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, failed, reload } = useAdminRpc('admin_report', { p_id: id });
  const r = data as Report | null;
  const [resolving, setResolving] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const photoUrls = useSignedUrls(r?.order?.done_photos ?? [], 'done-photos');
  const photoUris = (r?.order?.done_photos ?? []).map((p) => photoUrls[p]);
  const service = r?.reason === 'servico' && r.order ? r.order : null;

  // Disputa de serviço: a equipe decide se foi feito (conclui) ou não (segue combinado, para remarcar ou cancelar).
  const decide = (done: boolean) =>
    confirm(
      done
        ? 'Concluir o serviço? Conta como serviço feito para o profissional e, se o cliente disse que não foi feito, fica registrado como contestação indevida.'
        : 'O serviço não foi feito? Ele segue combinado para os dois remarcarem ou cancelarem.',
      async () => {
        const { error } = await supabase.rpc('admin_resolve_service', { p_report_id: id, p_done: done });
        if (error) notify(authErrorMessage(error));
        else {
          notify('Decisão registrada.', { tone: 'success' });
          router.back();
        }
      },
      { confirmLabel: done ? 'Concluir' : 'Confirmar' },
    );

  const resolve = async (resolution: string) => {
    const { error } = await supabase.rpc('admin_resolve_report', { p_id: id, p_resolution: resolution });
    if (error) notify(authErrorMessage(error));
    else {
      notify('Denúncia resolvida.', { tone: 'success' });
      router.back();
    }
  };

  const who = r ? firstName(r.reported.name) : '';
  const suspended = suspension(r?.reported.suspended_until);
  const created = r ? new Date(r.created_at) : null;

  return (
    <AdminPage
      title="Denúncia"
      surface
      loading={!r && loading}
      failed={!r && failed}
      onRetry={reload}
      footer={
        r && !r.resolved_at && service ? (
          <>
            <Button variant="primary" block iconLeft="check" onPress={() => decide(true)}>
              Foi feito: concluir
            </Button>
            <Pressable accessibilityRole="button" onPress={() => decide(false)} hitSlop={8} style={{ alignSelf: 'center' }}>
              <Text variant="labelLg">Não foi feito</Text>
            </Pressable>
          </>
        ) : r && !r.resolved_at ? (
          <>
            <Button variant="primary" block iconLeft="check" onPress={() => setResolving(true)}>
              Resolver denúncia
            </Button>
            {!suspended ? (
              <Pressable accessibilityRole="button" onPress={() => setSuspending(true)} hitSlop={8} style={{ alignSelf: 'center' }}>
                <Text variant="labelLg" color={colors.danger}>
                  {`Suspender ${who}`}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : undefined
      }
    >
      {r && created ? (
        <>
          <View style={{ gap: spacing[2] }}>
            <Text variant="overline" color={r.resolved_at ? colors.success : colors.danger}>
              {r.resolved_at ? `RESOLVIDA EM ${dateBR(r.resolved_at)}` : `ABERTA · ${dateBR(r.created_at)} ÀS ${formatTime(created.getTime())}`}
            </Text>
            <Text variant="titleLg" accessibilityRole="header">
              {reportReasonLabel(r.reason)}
            </Text>
            <Text variant="bodySm" color={colors.inkBody}>
              {`${r.reporter.name} denunciou `}
              <Text variant="bodySm" style={styles.link} onPress={() => router.push({ pathname: '/admin/pessoa/[id]', params: { id: r.reported.id } })}>
                {r.reported.name}
              </Text>
            </Text>
            {r.resolution ? (
              <Text variant="bodySm" color={colors.success}>
                {`Decisão: ${r.resolution}`}
              </Text>
            ) : null}
          </View>

          {r.details ? (
            <View style={styles.quote}>
              <Text variant="body">{`“${r.details}”`}</Text>
            </View>
          ) : null}

          {r.reported_total > 1 || suspended ? (
            <View style={styles.alert}>
              <Icon name="info" size={20} color={colors.danger} />
              <Text variant="bodySm" color={colors.inkBody} style={{ flex: 1 }}>
                {[
                  r.reported_total > 1 ? `É a ${ORDINAL[r.reported_total] ?? `${r.reported_total}ª`} denúncia contra ${who}.` : '',
                  r.previous ? `A anterior, em ${dateBR(r.previous.created_at)}, foi por ${reportReasonLabel(r.previous.reason).toLowerCase()}${r.previous.resolution ? ` (${r.previous.resolution.toLowerCase()})` : ''}.` : '',
                  suspended ? `A conta de ${who} está suspensa ${suspended}.` : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              </Text>
            </View>
          ) : null}

          {service ? (
            <Section title="Serviço">
              <View style={{ gap: spacing[2] }}>
                <Text variant="labelLg">{`${service.service} · ${formatBRL(Number(service.amount))}`}</Text>
                <Text variant="bodySm" color={colors.inkBody}>
                  {`Combinado para ${service.scheduled_label}`}
                </Text>
                <Text variant="bodySm" color={colors.inkBody}>
                  {service.status !== 'combinado'
                    ? `Situação: ${service.status}`
                    : service.done_at
                      ? `Marcado como feito em ${dateBR(service.done_at)}; o cliente não respondeu.`
                      : service.done_contested_at
                        ? `O cliente disse que não foi feito em ${dateBR(service.done_contested_at)}.`
                        : 'Combinado.'}
                </Text>
                {photoUris.length ? (
                  <PhotoThumbs uris={photoUris} size={84} onOpen={setViewer} />
                ) : (
                  <Text variant="caption" color={colors.inkMuted}>
                    Sem fotos do trabalho pronto.
                  </Text>
                )}
              </View>
            </Section>
          ) : null}

          <Section title="Conversa" action={r.conversation_id && r.messages_total > r.messages.length ? `Ver inteira (${r.messages_total})` : undefined} onAction={() => router.push({ pathname: '/admin/conversa/[id]', params: { id: r.id } })}>
            {r.messages.length ? (
              <View style={{ gap: spacing[3] }}>
                <Text variant="caption" color={colors.inkMuted}>
                  Até a denúncia. Só leitura; fica registrado que você abriu.
                </Text>
                {r.messages.map((m) =>
                  m.kind === 'system' ? (
                    <Text key={m.id} variant="caption" color={colors.inkMuted} style={{ textAlign: 'center' }}>
                      {m.body}
                    </Text>
                  ) : (
                    <View key={m.id} style={{ gap: 3 }}>
                      <Text variant="caption" color={m.from_reported ? colors.danger : colors.inkMuted} style={{ fontWeight: '600' }}>
                        {`${firstName(m.sender_name)} · ${formatTime(Date.parse(m.created_at))}${m.kind === 'request' ? ' · pedido' : m.kind === 'proposal' ? ' · proposta' : ''}`}
                      </Text>
                      <View style={[styles.bubble, m.from_reported && { backgroundColor: colors.dangerTint }]}>
                        <Text variant="body" selectable>
                          {m.body ?? ''}
                        </Text>
                      </View>
                    </View>
                  ),
                )}
              </View>
            ) : (
              <Text variant="bodySm" color={colors.inkMuted}>
                Denúncia feita pelo perfil, sem conversa.
              </Text>
            )}
          </Section>

          <PhotoViewer uris={photoUris.filter((u): u is string => !!u)} index={viewer} onClose={() => setViewer(null)} />
          <ActionSheet visible={resolving} title="O que foi feito?" onClose={() => setResolving(false)} actions={OUTCOMES.map((o) => ({ icon: 'check', label: o, onPress: () => resolve(o) }))} />
          <SuspendSheet visible={suspending} user={r.reported.id} name={r.reported.name} onClose={() => setSuspending(false)} onDone={reload} />
        </>
      ) : null}
    </AdminPage>
  );
}

const styles = StyleSheet.create({
  link: { fontWeight: '700', color: colors.ink, textDecorationLine: 'underline' },
  quote: { padding: spacing[4], borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  alert: { flexDirection: 'row', gap: spacing[3], padding: spacing[4], borderRadius: radius.md, backgroundColor: colors.dangerTint },
  bubble: { alignSelf: 'flex-start', maxWidth: '88%', paddingVertical: spacing[2], paddingHorizontal: spacing[3], borderRadius: radius.lg, borderTopLeftRadius: 6, backgroundColor: colors.surfaceMuted },
});
