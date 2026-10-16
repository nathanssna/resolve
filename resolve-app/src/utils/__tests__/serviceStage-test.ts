import type { Order } from '@/state/app';
import { serviceStage } from '../serviceStage';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Serviço quinta 15/10/2026 à tarde (começa às 13h, horário local).
const start = new Date(2026, 9, 15, 13).getTime();
const schedule = { day: new Date(2026, 9, 15).getTime(), period: 'tarde' as const };

const order = (o: Partial<Order> = {}): Order => ({
  id: 'o1',
  conversationId: 'c1',
  jobId: 'j1',
  proId: 'p1',
  clientId: 'c1',
  other: { id: 'x', name: 'Ana' },
  serviceId: 'eletricista',
  amount: 150,
  when: 'Hoje, à tarde',
  schedule,
  address: { label: 'Casa', line: 'Rua A, 1', area: 'Centro' },
  status: 'combinado',
  createdAt: start - 2 * DAY,
  donePhotos: [],
  doneBlocked: false,
  disputed: false,
  helpRequested: false,
  confirmedByMe: false,
  confirmedByOther: false,
  ...o,
});
const stage = (o: Partial<Order>, isPro: boolean, now = start) => serviceStage(order(o), isPro, 'Ana', now);

describe('serviceStage', () => {
  it('fora de "combinado" não há nada a decidir', () => {
    expect(stage({ status: 'concluido' }, true)).toBeNull();
    expect(stage({ status: 'cancelado' }, false)).toBeNull();
  });

  it('antes do dia: nada para os dois', () => {
    expect(stage({}, true, start - DAY)).toBeNull();
    expect(stage({}, false, start - DAY)).toBeNull();
  });

  describe('no dia do serviço', () => {
    it('os dois confirmam ou remarcam', () => {
      for (const isPro of [true, false]) {
        expect(stage({}, isPro, start - 5 * HOUR)).toMatchObject({ tone: 'action', title: 'Confirme o serviço de hoje', primary: 'confirmDay', secondary: 'reschedule' });
      }
    });

    it('diz se o outro já confirmou', () => {
      expect(stage({ confirmedByOther: true }, false, start - HOUR)?.text).toBe('Ana já confirmou.');
    });

    it('quem confirmou espera, sem botões', () => {
      expect(stage({ confirmedByMe: true }, false, start - HOUR)).toEqual({ tone: 'wait', title: 'Serviço de hoje confirmado', text: 'Ana ainda não confirmou.' });
      expect(stage({ confirmedByMe: true, confirmedByOther: true }, true, start - HOUR)?.text).toBe('Ana também confirmou.');
    });

    it('cliente pode confirmar durante o período; o profissional passa a marcar feito', () => {
      expect(stage({}, false, start + HOUR)?.primary).toBe('confirmDay');
      expect(stage({}, true, start + HOUR)?.primary).toBe('done');
      expect(stage({ confirmedByOther: true }, true, start + HOUR)?.text).toBe('Ana confirmou. Quando terminar, marque como feito. Se não deu, remarque.');
      expect(stage({ confirmedByMe: true }, false, start + HOUR)?.tone).toBe('wait');
    });

    it('remarcação pendente vem antes da confirmação', () => {
      expect(stage({ reschedule: { when: 'Amanhã, à tarde', label: 'x', byMe: false } }, false, start - HOUR)?.primary).toBe('acceptReschedule');
    });
  });

  it('profissional: a partir do começo do período, marca feito ou remarca', () => {
    expect(stage({}, true, start)).toMatchObject({ tone: 'action', title: 'Dia do serviço', primary: 'done', secondary: 'reschedule' });
  });

  it('profissional: passado um dia, pergunta se aconteceu', () => {
    expect(stage({}, true, start + DAY + 1)?.title).toBe('O serviço aconteceu?');
  });

  it('profissional: sem data, pode marcar feito a qualquer momento', () => {
    expect(stage({ schedule: undefined }, true, start - 10 * DAY)?.primary).toBe('done');
  });

  describe('marcado como feito', () => {
    const doneAt = start + 5 * HOUR;

    it('cliente confirma ou nega, vendo as fotos', () => {
      expect(stage({ doneAt }, false)).toMatchObject({ tone: 'action', primary: 'confirm', secondary: 'deny', photos: true });
    });

    it('profissional com foto: conclui sozinho em 7 dias', () => {
      const s = stage({ doneAt, donePhotos: ['a.jpg'] }, true, doneAt + 8 * DAY);
      expect(s).toMatchObject({ tone: 'wait', photos: true });
      expect(s?.primary).toBeUndefined();
      expect(s?.text).toContain('7 dias');
    });

    it('profissional sem foto: só pede ajuda à equipe depois de 7 dias', () => {
      expect(stage({ doneAt }, true, doneAt + 6 * DAY)?.primary).toBeUndefined();
      expect(stage({ doneAt }, true, doneAt + 7 * DAY)?.primary).toBe('askTeam');
    });

    it('profissional que já pediu ajuda não vê o botão de novo', () => {
      const s = stage({ doneAt, helpRequested: true }, true, doneAt + 9 * DAY);
      expect(s?.primary).toBeUndefined();
      expect(s?.text).toBe('Você pediu ajuda à equipe da Rezolveaê.');
    });
  });

  it('em análise pela equipe: os dois esperam, mesmo marcado como feito', () => {
    const s = stage({ disputed: true, doneAt: start }, false);
    expect(s?.tone).toBe('wait');
    expect(s?.primary).toBeUndefined();
    expect(stage({ disputed: true }, true)).toMatchObject({ tone: 'wait' });
  });

  describe('remarcação pendente', () => {
    it('quem pediu espera e pode desistir', () => {
      expect(stage({ reschedule: { when: 'Sáb 17/10, à tarde', label: 'Sáb 17/10, tarde', byMe: true } }, true)).toMatchObject({
        tone: 'wait',
        secondary: 'withdrawReschedule',
      });
    });

    it('o outro aceita ou recusa', () => {
      const s = stage({ reschedule: { when: 'Amanhã, de manhã', label: 'Sex 16/10, manhã', byMe: false } }, false);
      expect(s).toMatchObject({ tone: 'action', primary: 'acceptReschedule', secondary: 'declineReschedule' });
      expect(s?.title).toBe('Ana propôs remarcar para amanhã, de manhã');
    });
  });

  describe('cliente disse "não foi feito"', () => {
    it('profissional remarca ou discorda', () => {
      expect(stage({ doneBlocked: true }, true, start + 3 * DAY)).toMatchObject({ primary: 'reschedule', secondary: 'dispute' });
    });

    it('cliente remarca', () => {
      const s = stage({ doneBlocked: true }, false);
      expect(s?.primary).toBe('reschedule');
      expect(s?.secondary).toBeUndefined();
    });
  });
});
