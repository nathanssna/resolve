/**
 * Avisos do próprio app (no lugar do alert do sistema/navegador).
 * Quem mostra é o <DialogHost /> montado em app/_layout.tsx.
 *
 *   notify('Endereço salvo')                → faixa no topo, some sozinha
 *   confirm('Sair da conta?', sair, { confirmLabel: 'Sair', danger: true })
 */

export type ToastTone = 'info' | 'success' | 'error';
export type Toast = { id: number; message: string; tone: ToastTone };
export type ConfirmRequest = {
  id: number;
  message: string;
  title?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  onYes: () => void;
};
export type DialogState = { toast: Toast | null; confirm: ConfirmRequest | null };

let state: DialogState = { toast: null, confirm: null };
let seq = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

const set = (next: Partial<DialogState>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

export const dialogStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => state,
  dismissToast() {
    clearTimeout(toastTimer);
    set({ toast: null });
  },
  answer(yes: boolean) {
    const c = state.confirm;
    set({ confirm: null });
    if (yes) c?.onYes();
  },
};

/** "Não foi possível…" e afins viram aviso de erro. */
const looksLikeError = (msg: string) => /^(Não foi possível|Não é possível|Mensagem não enviada|Erro)/i.test(msg);

/** Aviso rápido (faixa no topo). Fica mais tempo na tela quanto maior o texto. */
export function notify(message: string, opts: { tone?: ToastTone } = {}) {
  clearTimeout(toastTimer);
  set({ toast: { id: ++seq, message, tone: opts.tone ?? (looksLikeError(message) ? 'error' : 'info') } });
  toastTimer = setTimeout(() => set({ toast: null }), Math.min(8000, 2500 + message.length * 45));
}

/** Pede confirmação antes de uma ação. */
export function confirm(
  message: string,
  onYes: () => void,
  opts: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {},
) {
  set({
    confirm: {
      id: ++seq,
      message,
      title: opts.title,
      confirmLabel: opts.confirmLabel ?? 'Confirmar',
      cancelLabel: opts.cancelLabel ?? 'Voltar',
      danger: opts.danger ?? false,
      onYes,
    },
  });
}
