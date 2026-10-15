import { StyleSheet, View } from 'react-native';

import type { Order } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';
import { scheduleAt } from '@/utils/schedule';
import { Button } from './Button';
import { PhotoThumbs } from './Photos';
import { Text } from './Text';

export type ServiceAction =
  | 'done'
  | 'confirm'
  | 'deny'
  | 'reschedule'
  | 'acceptReschedule'
  | 'declineReschedule'
  | 'withdrawReschedule'
  | 'dispute'
  | 'askTeam';

const LABEL: Record<ServiceAction, string> = {
  done: 'Serviço feito',
  confirm: 'Sim, foi feito',
  deny: 'Não foi feito',
  reschedule: 'Remarcar',
  acceptReschedule: 'Aceitar nova data',
  declineReschedule: 'Recusar',
  withdrawReschedule: 'Desistir',
  dispute: 'Discordo, foi feito',
  askTeam: 'Pedir ajuda à equipe',
};

/** `action`: a vez é de quem vê; `wait`: a vez é do outro (ou da equipe). */
export type ServiceStage = { tone: 'action' | 'wait'; title: string; text?: string; primary?: ServiceAction; secondary?: ServiceAction; photos?: boolean };

const WEEK = 7 * 86_400_000;

/**
 * Em que pé está um serviço combinado e o que quem vê pode fazer (mesmas regras do banco:
 * mark_order_done, confirm_order_done, respond_reschedule, dispute_order, ask_team_order).
 * `null`: nada a decidir agora (combinado, antes do dia).
 */
export function serviceStage(o: Order, isPro: boolean, other: string, now = Date.now()): ServiceStage | null {
  if (o.status !== 'combinado') return null;
  if (o.disputed) {
    return { tone: 'wait', title: 'A equipe da Rezolveaê está analisando', text: 'Vocês recebem um aviso no chat com a decisão.' };
  }
  if (o.doneAt) {
    if (!isPro) {
      return { tone: 'action', title: `${other} marcou o serviço como feito`, text: 'O serviço foi feito?', primary: 'confirm', secondary: 'deny', photos: true };
    }
    const photos = o.donePhotos.length > 0;
    const week = now - o.doneAt >= WEEK;
    return {
      tone: 'wait',
      title: `Aguardando ${other} confirmar`,
      text: photos
        ? `Se ${other} não responder em 7 dias, o serviço é concluído.`
        : o.helpRequested
          ? 'Você pediu ajuda à equipe da Rezolveaê.'
          : week
            ? `Já faz 7 dias. A equipe da Rezolveaê pode ver a conversa e concluir.`
            : `Sem foto, só ${other} conclui. Com 7 dias sem resposta, você pode pedir ajuda à equipe.`,
      primary: !photos && week && !o.helpRequested ? 'askTeam' : undefined,
      photos,
    };
  }
  if (o.reschedule) {
    return o.reschedule.byMe
      ? { tone: 'wait', title: `Nova data proposta: ${o.reschedule.when}`, text: `Aguardando ${other} responder.`, secondary: 'withdrawReschedule' }
      : { tone: 'action', title: `${other} propôs remarcar para ${o.reschedule.when.toLowerCase()}`, primary: 'acceptReschedule', secondary: 'declineReschedule' };
  }
  if (o.doneBlocked) {
    return isPro
      ? {
          tone: 'action',
          title: `${other} disse que o serviço não foi feito`,
          text: 'Remarquem ou cancelem. Se o serviço foi feito, a equipe da Rezolveaê decide.',
          primary: 'reschedule',
          secondary: 'dispute',
        }
      : { tone: 'action', title: 'Você disse que o serviço não foi feito', text: `Combine uma nova data com ${other} ou cancele.`, primary: 'reschedule' };
  }
  // Profissional: a partir do começo do período (sem data, a qualquer momento).
  if (isPro && (!o.schedule || now >= scheduleAt(o.schedule).getTime())) {
    const past = !!o.schedule && now - scheduleAt(o.schedule).getTime() > 24 * 3_600_000;
    return {
      tone: 'action',
      title: past ? 'O serviço aconteceu?' : 'Dia do serviço',
      text: 'Quando terminar, marque como feito. Se não deu, remarque.',
      primary: 'done',
      secondary: 'reschedule',
    };
  }
  return null;
}

/** Cartão com o estado do serviço e as ações de quem vê. */
export function ServicePanel({
  stage,
  photoUris = [],
  busy,
  onAction,
  onOpenPhoto,
}: {
  stage: ServiceStage;
  /** URLs das fotos do serviço feito (vazio = carregando). */
  photoUris?: (string | undefined)[];
  busy?: boolean;
  onAction: (a: ServiceAction) => void;
  onOpenPhoto?: (index: number) => void;
}) {
  return (
    <View style={[styles.panel, stage.tone === 'wait' && { backgroundColor: colors.surfaceMuted }]}>
      <View style={{ gap: spacing[1] }}>
        <Text variant="labelLg">{stage.title}</Text>
        {stage.text ? (
          <Text variant="bodySm" color={colors.inkBody}>
            {stage.text}
          </Text>
        ) : null}
      </View>
      {stage.photos && photoUris.length ? <PhotoThumbs uris={photoUris} size={72} onOpen={onOpenPhoto} /> : null}
      {stage.primary ? (
        <Button variant={stage.tone === 'action' ? 'primary' : 'dark'} block disabled={busy} onPress={() => onAction(stage.primary!)}>
          {LABEL[stage.primary]}
        </Button>
      ) : null}
      {stage.secondary ? (
        <Button variant={stage.primary ? 'secondary' : 'link'} block={!!stage.primary} disabled={busy} onPress={() => onAction(stage.secondary!)}>
          {LABEL[stage.secondary]}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: spacing[4], borderRadius: radius.xl, backgroundColor: colors.brandTint, gap: spacing[3] },
});
