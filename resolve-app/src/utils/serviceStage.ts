import type { Order } from '@/state/app';
import { scheduleAt } from '@/utils/schedule';

export type ServiceAction =
  | 'done'
  | 'confirmDay'
  | 'confirm'
  | 'deny'
  | 'reschedule'
  | 'acceptReschedule'
  | 'declineReschedule'
  | 'withdrawReschedule'
  | 'dispute'
  | 'askTeam';

/** `action`: a vez é de quem vê; `wait`: a vez é do outro (ou da equipe). */
export type ServiceStage = { tone: 'action' | 'wait'; title: string; text?: string; primary?: ServiceAction; secondary?: ServiceAction; photos?: boolean };

const WEEK = 7 * 86_400_000;

/**
 * Em que pé está um serviço combinado e o que quem vê pode fazer (mesmas regras do banco:
 * mark_order_done, confirm_order_done, respond_reschedule, dispute_order, ask_team_order, confirm_service_day).
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
  // No dia: cada um confirma (o profissional até o começo do período; depois vale "Serviço feito").
  const started = !o.schedule || now >= scheduleAt(o.schedule).getTime();
  if (o.schedule && new Date(o.schedule.day).toDateString() === new Date(now).toDateString() && (!isPro || !started)) {
    return o.confirmedByMe
      ? { tone: 'wait', title: 'Serviço de hoje confirmado', text: o.confirmedByOther ? `${other} também confirmou.` : `${other} ainda não confirmou.` }
      : {
          tone: 'action',
          title: 'Confirme o serviço de hoje',
          text: o.confirmedByOther ? `${other} já confirmou.` : `Assim ${other} sabe que está tudo certo. Se não der, remarque.`,
          primary: 'confirmDay',
          secondary: 'reschedule',
        };
  }
  // Profissional: a partir do começo do período (sem data, a qualquer momento).
  if (isPro && started) {
    const past = !!o.schedule && now - scheduleAt(o.schedule).getTime() > 24 * 3_600_000;
    return {
      tone: 'action',
      title: past ? 'O serviço aconteceu?' : 'Dia do serviço',
      text: `${o.confirmedByOther && !past ? `${other} confirmou. ` : ''}Quando terminar, marque como feito. Se não deu, remarque.`,
      primary: 'done',
      secondary: 'reschedule',
    };
  }
  return null;
}
