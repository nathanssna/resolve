/** Motivos de denúncia (tela Denunciar e painel de moderação). O id é o gravado em reports.reason. */
export const REPORT_REASONS = [
  { id: 'golpe', label: 'Golpe ou fraude' },
  { id: 'pagamento', label: 'Pediu pagamento fora do combinado' },
  { id: 'assedio', label: 'Assédio, ameaça ou ofensa' },
  { id: 'conteudo', label: 'Foto ou conteúdo impróprio' },
  { id: 'outro', label: 'Outro motivo' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['id'];

export const reportReasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
