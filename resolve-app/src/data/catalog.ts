import type { IconName } from '@/components/Icon';

/**
 * Dados de EXEMPLO para o protótipo. Quando houver back-end, troque estas listas
 * por chamadas à API mantendo os mesmos tipos — as telas não precisam mudar.
 * Revise os textos antes de publicar.
 */

export type Service = {
  id: string;
  icon: IconName;
  title: string;
  /** Rótulo curto para a grade do Início. */
  short: string;
  subtitle: string;
  area: string;
  rating: number;
  reviews: number;
  description: string;
  includes: string[];
  /** Sugestões de pedido mostradas na busca e no formulário. */
  examples: string[];
  badge?: string;
};

export type Professional = {
  id: string;
  serviceIds: string[];
  name: string;
  role: string;
  rating: number;
  reviews: number;
  distanceKm: number;
  years: number;
  /** Tempo típico para responder no chat, em minutos. */
  replyMin: number;
  jobs: number;
  tags: string[];
  verified: boolean;
};

export const services: Service[] = [
  {
    id: 'encanador',
    icon: 'wrench',
    title: 'Encanador',
    short: 'Encanador',
    subtitle: 'Instalação e reparos em geral',
    area: 'Hidráulica',
    rating: 4.8,
    reviews: 1245,
    description: 'Vazamentos, entupimentos, troca de torneiras, registros e instalação de chuveiros e caixas d’água.',
    includes: ['Vazamentos e infiltrações', 'Desentupimento', 'Instalação de chuveiro e torneira', 'Caixa d’água e registros'],
    examples: ['Torneira pingando', 'Pia entupida', 'Instalar chuveiro'],
  },
  {
    id: 'eletricista',
    icon: 'zap',
    title: 'Eletricista',
    short: 'Eletricista',
    subtitle: 'Instalação, manutenção e reparos',
    area: 'Elétrica',
    rating: 4.7,
    reviews: 982,
    description: 'Tomadas, disjuntores, iluminação, quadros de energia e instalação de aparelhos com segurança.',
    includes: ['Tomadas e interruptores', 'Troca de disjuntor', 'Instalação de luminárias', 'Revisão do quadro de energia'],
    examples: ['Tomada sem energia', 'Instalar lustre', 'Disjuntor desarmando'],
  },
  {
    id: 'informatica',
    icon: 'laptop',
    title: 'Suporte de informática',
    short: 'Informática',
    subtitle: 'Formatação, limpeza e manutenção',
    area: 'Tecnologia',
    rating: 4.8,
    reviews: 1245,
    description:
      'Resolvemos problemas no seu computador, notebook ou rede. Instalação de programas, limpeza, formatação e muito mais, com atendimento rápido e seguro.',
    includes: [
      'Formatação e reinstalação de sistema',
      'Limpeza e otimização do equipamento',
      'Instalação de programas',
      'Suporte remoto e presencial',
    ],
    examples: ['Notebook lento', 'Formatar computador', 'Wi‑Fi caindo'],
  },
  {
    id: 'montagem-moveis',
    icon: 'hammer',
    title: 'Montagem de móveis',
    short: 'Montagem',
    subtitle: 'Residencial e comercial',
    area: 'Montagem',
    rating: 4.9,
    reviews: 643,
    description: 'Montagem e desmontagem de guarda-roupas, camas, estantes, escrivaninhas e móveis planejados.',
    includes: ['Guarda-roupas e camas', 'Estantes e painéis de TV', 'Fixação na parede', 'Desmontagem para mudança'],
    examples: ['Montar guarda-roupa', 'Fixar painel de TV', 'Montar cama box'],
  },
  {
    id: 'pintor',
    icon: 'paint-roller',
    title: 'Pintor',
    short: 'Pintura',
    subtitle: 'Paredes, tetos e acabamentos',
    area: 'Reforma',
    rating: 4.7,
    reviews: 412,
    description: 'Pintura interna e externa, correção de paredes, textura e acabamentos.',
    includes: ['Pintura de cômodos', 'Massa corrida e correções', 'Textura e grafiato', 'Portas e portões'],
    examples: ['Pintar um quarto', 'Corrigir mofo na parede', 'Pintar portão'],
  },
  {
    id: 'limpeza',
    icon: 'sparkles',
    title: 'Limpeza',
    short: 'Limpeza',
    subtitle: 'Residencial e pós-obra',
    area: 'Casa',
    rating: 4.8,
    reviews: 1530,
    description: 'Faxina completa, limpeza pesada, pós-obra e limpeza de estofados.',
    includes: ['Faxina residencial', 'Limpeza pós-obra', 'Vidros e janelas', 'Estofados e colchões'],
    examples: ['Faxina no apartamento', 'Limpeza pós-obra', 'Limpar sofá'],
  },
  {
    id: 'ar-condicionado',
    icon: 'snowflake',
    title: 'Ar-condicionado',
    short: 'Ar-cond.',
    subtitle: 'Instalação e higienização',
    area: 'Climatização',
    rating: 4.8,
    reviews: 377,
    description: 'Instalação, manutenção preventiva, higienização e recarga de gás de aparelhos split e janela.',
    includes: ['Instalação de split', 'Higienização completa', 'Recarga de gás', 'Manutenção preventiva'],
    examples: ['Instalar ar split', 'Ar pingando água', 'Limpar ar-condicionado'],
    badge: 'NOVO',
  },
  {
    id: 'chaveiro',
    icon: 'key-round',
    title: 'Chaveiro',
    short: 'Chaveiro',
    subtitle: 'Aberturas, cópias e fechaduras',
    area: 'Segurança',
    rating: 4.6,
    reviews: 298,
    description: 'Abertura de portas, troca de fechaduras e segredos, cópias de chaves e instalação de fechaduras digitais.',
    includes: ['Abertura de portas', 'Troca de fechadura', 'Cópia de chaves', 'Fechadura digital'],
    examples: ['Fiquei trancado para fora', 'Trocar fechadura', 'Instalar fechadura digital'],
  },
];

const P = (p: Professional) => p;

export const professionals: Professional[] = [
  P({ id: 'lucas', serviceIds: ['informatica'], name: 'Lucas Ferreira', role: 'Técnico em informática', rating: 4.9, reviews: 128, distanceKm: 2.3, years: 5, replyMin: 5, jobs: 312, tags: ['Formatação', 'Limpeza', 'Suporte remoto'], verified: true }),
  P({ id: 'gabriel', serviceIds: ['informatica'], name: 'Gabriel Souza', role: 'Técnico em informática', rating: 4.8, reviews: 96, distanceKm: 3.1, years: 4, replyMin: 15, jobs: 201, tags: ['Manutenção', 'Instalação', 'Redes'], verified: true }),
  P({ id: 'rafael', serviceIds: ['informatica'], name: 'Rafael Costa', role: 'Técnico em informática', rating: 4.7, reviews: 74, distanceKm: 4.2, years: 3, replyMin: 10, jobs: 140, tags: ['Formatação', 'Programas', 'Suporte remoto'], verified: false }),
  P({ id: 'diego', serviceIds: ['informatica'], name: 'Diego Lima', role: 'Técnico em informática', rating: 4.6, reviews: 61, distanceKm: 5.8, years: 2, replyMin: 30, jobs: 88, tags: ['Limpeza', 'Manutenção', 'Redes'], verified: true }),
  P({ id: 'marcos', serviceIds: ['encanador'], name: 'Marcos Oliveira', role: 'Encanador', rating: 4.9, reviews: 210, distanceKm: 1.8, years: 12, replyMin: 10, jobs: 640, tags: ['Vazamentos', 'Desentupimento', 'Chuveiros'], verified: true }),
  P({ id: 'paulo', serviceIds: ['encanador'], name: 'Paulo Santos', role: 'Encanador', rating: 4.7, reviews: 133, distanceKm: 3.6, years: 8, replyMin: 20, jobs: 390, tags: ['Caixa d’água', 'Registros'], verified: true }),
  P({ id: 'andre', serviceIds: ['eletricista'], name: 'André Nunes', role: 'Eletricista', rating: 4.8, reviews: 187, distanceKm: 2.7, years: 10, replyMin: 10, jobs: 520, tags: ['Quadro de energia', 'Iluminação'], verified: true }),
  P({ id: 'felipe', serviceIds: ['eletricista'], name: 'Felipe Rocha', role: 'Eletricista', rating: 4.6, reviews: 92, distanceKm: 4.9, years: 5, replyMin: 25, jobs: 230, tags: ['Tomadas', 'Disjuntores'], verified: false }),
  P({ id: 'jorge', serviceIds: ['montagem-moveis'], name: 'Jorge Almeida', role: 'Montador de móveis', rating: 4.9, reviews: 256, distanceKm: 2.1, years: 9, replyMin: 10, jobs: 710, tags: ['Guarda-roupas', 'Painéis de TV'], verified: true }),
  P({ id: 'renata', serviceIds: ['pintor'], name: 'Renata Prado', role: 'Pintora', rating: 4.8, reviews: 88, distanceKm: 3.3, years: 7, replyMin: 15, jobs: 180, tags: ['Interna', 'Textura', 'Correções'], verified: true }),
  P({ id: 'claudia', serviceIds: ['limpeza'], name: 'Cláudia Mendes', role: 'Diarista', rating: 4.9, reviews: 340, distanceKm: 1.5, years: 11, replyMin: 5, jobs: 980, tags: ['Faxina', 'Pós-obra', 'Vidros'], verified: true }),
  P({ id: 'thiago', serviceIds: ['ar-condicionado'], name: 'Thiago Barros', role: 'Técnico em climatização', rating: 4.8, reviews: 74, distanceKm: 4.0, years: 6, replyMin: 15, jobs: 160, tags: ['Split', 'Higienização'], verified: true }),
  P({ id: 'sergio', serviceIds: ['chaveiro'], name: 'Sérgio Lopes', role: 'Chaveiro', rating: 4.6, reviews: 120, distanceKm: 2.9, years: 15, replyMin: 5, jobs: 870, tags: ['Aberturas', 'Fechadura digital'], verified: true }),
];

export const popular = ['informatica', 'encanador', 'limpeza', 'montagem-moveis'];

export const getService = (id: string) => services.find((s) => s.id === id);
export const getProfessional = (id: string) => professionals.find((p) => p.id === id);
export const getProfessionals = (serviceId: string) => professionals.filter((p) => p.serviceIds.includes(serviceId));

/** Endereço padrão do usuário (exemplo). */
export const defaultAddress = { label: 'Casa', line: 'Rua das Acácias, 120', area: 'Santa Terezinha' };
