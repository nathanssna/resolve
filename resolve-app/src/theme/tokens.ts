/**
 * Tokens do design system Resolve (v2).
 * Linguagem de super-app: topo amarelo, painéis brancos com cantos grandes,
 * campos preenchidos sem borda, um único botão amarelo por tela.
 */

export const colors = {
  /** Amarelo Resolve — topo das telas raiz, botão principal, seleção. */
  brand: '#FFD900',
  /** Curva decorativa sobre `brand`. */
  brandSoft: '#FFE54D',
  /** Fundo de opção selecionada, destaques suaves. */
  brandTint: '#FFF7CC',
  /** Texto e ícones sobre `brand`/`brandTint`. Nunca branco sobre o amarelo. */
  onBrand: '#111213',

  /** Títulos, nomes, rótulos e ícones; fundo do botão escuro e dos cards escuros. */
  ink: '#111213',
  /** Cards escuros secundários. */
  inkSoft: '#26282C',
  /** Texto sobre `ink`. */
  onInk: '#FFFFFF',
  /** Texto secundário sobre `ink`. */
  onInkMuted: '#B9BEC7',
  /** Texto corrido. */
  inkBody: '#1F2A44',
  /** Subtítulos, metadados, placeholder, abas inativas. */
  inkMuted: '#5A6A80',

  /** Estrela da nota — sempre com o número ao lado. */
  star: '#FBB800',
  /** Status positivo (concluído, verificado) — texto sobre branco 5.7:1. */
  success: '#13773A',
  successTint: '#E3F4E8',
  /** Ação destrutiva (cancelar). */
  danger: '#B42318',

  /** Fundo das telas e painéis. */
  surface: '#FFFFFF',
  /** Campos preenchidos, blocos de ícone, chips inativos, tags. */
  surfaceMuted: '#F2F3F5',
  /** Avatar sem foto, trilho de progresso. */
  surfaceStrong: '#E4E7EB',
  /** Fundo atrás dos painéis (Pedidos, Conta). */
  canvas: '#F6F7F8',
  /** Bordas de 1px e divisores. */
  line: '#E7EAEF',
  /** Anel de foco e borda de seleção. */
  focus: '#111213',
} as const;

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  /** Margem lateral das telas. */
  5: 20,
  6: 24,
  8: 32,
  10: 40,
} as const;

export const radius = {
  sm: 8,
  /** Campos, tags grandes, blocos de ícone pequenos. */
  md: 14,
  /** Cards e blocos de serviço. */
  lg: 18,
  /** Banners, ícone grande. */
  xl: 24,
  /** Topo dos painéis (sheets). */
  sheet: 28,
  /** Botões, chips, avatar. */
  pill: 999,
} as const;

export const shadows = {
  card: '0px 1px 2px rgba(17, 24, 39, 0.05), 0px 6px 16px rgba(17, 24, 39, 0.06)',
  sheet: '0px -8px 24px rgba(17, 24, 39, 0.08)',
  float: '0px 10px 30px rgba(17, 24, 39, 0.14)',
} as const;

/** Famílias carregadas em src/app/_layout.tsx (Plus Jakarta Sans, Google Fonts). */
export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

/** Estilos de texto do design system. */
export const type = {
  hero: { fontFamily: fonts.extrabold, fontSize: 32, lineHeight: 36, letterSpacing: -0.64 },
  display: { fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 31, letterSpacing: -0.4 },
  titleLg: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  titleMd: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  titleSm: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 },
  labelLg: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodySm: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, letterSpacing: 0.6 },
} as const;

export type TypeVariant = keyof typeof type;
