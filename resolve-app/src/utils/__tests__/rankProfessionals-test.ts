import type { Professional } from '@/state/catalog';
import type { Distance } from '@/state/distances';
import { sortProfessionals } from '../rankProfessionals';

const pro = (id: string, p: Partial<Professional> = {}): Professional => ({
  id,
  serviceIds: [],
  approvedIds: [],
  name: id,
  role: '',
  bio: '',
  rating: 4.5,
  reviews: 10,
  years: 1,
  replyMin: 30,
  jobs: 10,
  tags: [],
  verified: false,
  area: '',
  radiusKm: 10,
  paused: false,
  gold: false,
  lessonsDone: false,
  ...p,
});
const ids = (list: Professional[]) => list.map((p) => p.id);

describe('sortProfessionals', () => {
  it('recomendados: a nota pesa mais que volume e rapidez', () => {
    const list = [
      pro('volume', { rating: 4.5, jobs: 500, replyMin: 60 }),
      pro('nota', { rating: 5, jobs: 0, replyMin: 60 }),
      pro('rapido', { rating: 4.5, jobs: 10, replyMin: 5 }),
    ];
    // nota: 100 + 0 - 12 = 88; volume: 90 + 10 - 12 = 88 (empate fica na ordem); rapido: 90 + 0,2 - 1 = 89,2
    expect(ids(sortProfessionals(list, 'recomendados'))).toEqual(['rapido', 'volume', 'nota']);
  });

  it('recomendados: Profissional de Ouro vale meia estrela a mais', () => {
    const list = [pro('nota', { rating: 4.8 }), pro('ouro', { rating: 4.5, gold: true }), pro('baixa', { rating: 4, gold: true })];
    // nota: 96 + 0,2 - 6 = 90,2; ouro: 90 + 0,2 - 6 + 10 = 94,2; baixa: 80 + 0,2 - 6 + 10 = 84,2
    expect(ids(sortProfessionals(list, 'recomendados'))).toEqual(['ouro', 'nota', 'baixa']);
  });

  it('recomendados: só as aulas valem um quinto de estrela', () => {
    const list = [pro('nota', { rating: 4.6 }), pro('aulas', { rating: 4.5, lessonsDone: true }), pro('ouro', { rating: 4.5, lessonsDone: true, gold: true })];
    // nota: 92 + 0,2 - 6 = 86,2; aulas: 90 + 0,2 - 6 + 4 = 88,2; ouro: 90 + 0,2 - 6 + 10 = 94,2
    expect(ids(sortProfessionals(list, 'recomendados'))).toEqual(['ouro', 'aulas', 'nota']);
  });

  it('recomendados: volume acima de 500 serviços não conta mais', () => {
    const list = [pro('a', { jobs: 5000 }), pro('b', { jobs: 500, replyMin: 29 })];
    expect(ids(sortProfessionals(list, 'recomendados'))).toEqual(['b', 'a']);
  });

  it('próximos: sem distância vai para o fim', () => {
    const dist = new Map<string, Distance>([
      ['longe', { km: 12, inRange: false }],
      ['perto', { km: 1, inRange: true }],
    ]);
    const list = [pro('sem'), pro('longe'), pro('perto')];
    expect(ids(sortProfessionals(list, 'proximos', dist))).toEqual(['perto', 'longe', 'sem']);
    expect(ids(sortProfessionals(list, 'proximos', null))).toEqual(['sem', 'longe', 'perto']);
  });

  it('avaliados: nota e, no empate, mais avaliações', () => {
    const list = [pro('poucas', { rating: 4.8, reviews: 3 }), pro('baixa', { rating: 4.2, reviews: 90 }), pro('muitas', { rating: 4.8, reviews: 40 })];
    expect(ids(sortProfessionals(list, 'avaliados'))).toEqual(['muitas', 'poucas', 'baixa']);
  });

  it('rápidos: menor tempo de resposta primeiro', () => {
    const list = [pro('a', { replyMin: 40 }), pro('b', { replyMin: 5 }), pro('c', { replyMin: 15 })];
    expect(ids(sortProfessionals(list, 'rapidos'))).toEqual(['b', 'c', 'a']);
  });

  it('não altera a lista original', () => {
    const list = [pro('a', { replyMin: 40 }), pro('b', { replyMin: 5 })];
    sortProfessionals(list, 'rapidos');
    expect(ids(list)).toEqual(['a', 'b']);
  });
});
