/** Motivos de denúncia (tela Denunciar e painel de moderação). O id é o gravado em reports.reason. */
export const REPORT_REASONS = [
  { id: 'golpe', label: 'Golpe ou fraude' },
  { id: 'pagamento', label: 'Pediu pagamento fora do combinado' },
  { id: 'assedio', label: 'Assédio, ameaça ou ofensa' },
  { id: 'conteudo', label: 'Foto ou conteúdo impróprio' },
  { id: 'outro', label: 'Outro motivo' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['id'];

/** `servico`: aberta pelo app quando o profissional discorda do "não foi feito" ou pede ajuda (não aparece na tela Denunciar). */
export const reportReasonLabel = (id: string) => (id === 'servico' ? 'Serviço em disputa' : (REPORT_REASONS.find((r) => r.id === id)?.label ?? id));
