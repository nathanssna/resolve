import {
  cancelIsLate,
  formatSchedule,
  fromScheduledAt,
  nextDays,
  parseSchedule,
  periodEnded,
  scheduleAt,
  scheduleLabel,
  soonest,
  type Schedule,
} from '../schedule';

// Horário local (o script de teste fixa TZ=America/Sao_Paulo). 15/10/2026 é uma quinta.
const at = (d: number, h = 0, m = 0, month = 9, y = 2026) => new Date(y, month, d, h, m).getTime();
const day = (d: number, month = 9, y = 2026) => at(d, 0, 0, month, y);

describe('nextDays', () => {
  it('começa em Hoje e Amanhã, depois o dia da semana', () => {
    expect(nextDays(3, at(15, 10))).toEqual([
      { day: day(15), label: 'Hoje', sub: '15/10' },
      { day: day(16), label: 'Amanhã', sub: '16/10' },
      { day: day(17), label: 'Sáb', sub: '17/10' },
    ]);
  });

  it('atravessa a virada do mês', () => {
    expect(nextDays(3, at(31, 22)).map((d) => d.sub)).toEqual(['31/10', '01/11', '02/11']);
  });
});

describe('soonest', () => {
  it.each([
    [7, 15, 'manha'],
    [9, 15, 'manha'],
    [10, 15, 'tarde'],
    [14, 15, 'tarde'],
    [15, 15, 'noite'],
    [18, 15, 'noite'],
    [19, 16, 'manha'],
    [23, 16, 'manha'],
  ])('às %ih: dia %i, %s', (hour, d, period) => {
    expect(soonest(at(15, hour))).toEqual({ day: day(d), period });
  });
});

describe('scheduleAt e fromScheduledAt', () => {
  it.each([
    ['manha', 8],
    ['tarde', 13],
    ['noite', 18],
  ] as const)('%s começa às %ih e volta igual', (period, hour) => {
    const s: Schedule = { day: day(15), period };
    expect(scheduleAt(s).getTime()).toBe(at(15, hour));
    expect(fromScheduledAt(scheduleAt(s).getTime())).toEqual(s);
  });
});

describe('scheduleLabel', () => {
  it('texto absoluto para o banco', () => {
    expect(scheduleLabel({ day: day(17), period: 'tarde' })).toBe('Sáb 17/10, tarde');
    expect(scheduleLabel({ day: day(15), period: 'manha' })).toBe('Qui 15/10, manhã');
  });
});

describe('parseSchedule', () => {
  const ref = at(15, 10);

  it('lê o formato absoluto (o que scheduleLabel grava)', () => {
    const s: Schedule = { day: day(17), period: 'noite' };
    expect(parseSchedule(scheduleLabel(s), ref)).toEqual(s);
  });

  it('lê o formato antigo, relativo a quando foi escrito', () => {
    expect(parseSchedule('Hoje, tarde', ref)).toEqual({ day: day(15), period: 'tarde' });
    expect(parseSchedule('Amanhã, manhã', ref)).toEqual({ day: day(16), period: 'manha' });
    expect(parseSchedule('amanha, manha', ref)).toEqual({ day: day(16), period: 'manha' });
  });

  it('sem ano no texto: escolhe a data mais perto (dezembro → janeiro)', () => {
    expect(parseSchedule('Sáb 02/01, manhã', at(30, 10, 0, 11))).toEqual({ day: day(2, 0, 2027), period: 'manha' });
    expect(parseSchedule('Qua 30/12, noite', at(2, 10, 0, 0, 2027))).toEqual({ day: day(30, 11, 2026), period: 'noite' });
  });

  it('texto livre ou data impossível → null', () => {
    expect(parseSchedule('O quanto antes', ref)).toBeNull();
    expect(parseSchedule('Seg 31/02, tarde', ref)).toBeNull();
    expect(parseSchedule('', ref)).toBeNull();
  });
});

describe('formatSchedule', () => {
  const now = at(15, 10);
  it.each([
    [15, 'tarde', 'Hoje, à tarde'],
    [16, 'manha', 'Amanhã, de manhã'],
    [14, 'noite', 'Ontem, à noite'],
    [17, 'tarde', 'Sáb 17/10, à tarde'],
  ] as const)('dia %i, %s → %s', (d, period, text) => {
    expect(formatSchedule({ day: day(d), period }, now)).toBe(text);
  });
});

describe('cancelIsLate (mesma regra do banco)', () => {
  // Serviço sábado 17/10 à tarde: começa às 13h, o prazo sem consequência acaba às 1h.
  const s: Schedule = { day: day(17), period: 'tarde' };
  const client = { pro: false };
  const pro = { pro: true };

  it('sem data nunca é em cima da hora', () => {
    expect(cancelIsLate(undefined, pro, at(17, 12))).toBe(false);
  });

  it('com 12 h ou mais de antecedência, não é', () => {
    expect(cancelIsLate(s, client, at(17, 1))).toBe(false);
    expect(cancelIsLate(s, pro, at(16, 20))).toBe(false);
  });

  it('com menos de 12 h, é para os dois', () => {
    expect(cancelIsLate(s, client, at(17, 1, 1))).toBe(true);
    expect(cancelIsLate(s, pro, at(17, 12))).toBe(true);
  });

  it('depois do dia: conta para o profissional, não para o cliente', () => {
    expect(cancelIsLate(s, client, at(17, 23))).toBe(true);
    expect(cancelIsLate(s, client, at(18, 9))).toBe(false);
    expect(cancelIsLate(s, pro, at(18, 9))).toBe(true);
  });

  it('cliente que disse "não foi feito" cancela livre', () => {
    expect(cancelIsLate(s, { pro: false, contested: true }, at(17, 12))).toBe(false);
  });
});

describe('periodEnded', () => {
  it('o período dura 4 h a partir do começo', () => {
    const s: Schedule = { day: day(15), period: 'tarde' };
    expect(periodEnded(s, at(15, 17))).toBe(false);
    expect(periodEnded(s, at(15, 17, 1))).toBe(true);
  });
});
