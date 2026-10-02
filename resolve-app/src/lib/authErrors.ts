import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js';

/** Mensagem em português para erros do login e das RPCs de perfil. */
export function authErrorMessage(error: unknown): string {
  if (isAuthRetryableFetchError(error)) return 'Sem conexão. Verifique a internet e tente de novo.';

  if (isAuthError(error)) {
    switch (error.code) {
      case 'otp_expired':
        return 'Código inválido ou expirado. Confira os números ou peça um novo.';
      case 'over_email_send_rate_limit':
      case 'over_request_rate_limit':
        return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.';
      case 'email_address_invalid':
      case 'validation_failed':
        return 'Confira o e-mail digitado.';
      case 'email_address_not_authorized':
        return 'Este e-mail não pode receber o código. Tente outro.';
      case 'signup_disabled':
      case 'email_provider_disabled':
      case 'otp_disabled':
        return 'O login por e-mail está desativado no momento.';
      case 'user_banned':
        return 'Esta conta está bloqueada. Fale com o suporte.';
    }
    if (error.status === 429) return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.';
  }

  // Erros das RPCs (complete_onboarding etc.) já vêm em português do banco.
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const { code, message } = error as { code?: string; message?: string };
    if ((code === 'P0001' || code === '22023') && message) return message;
  }

  return 'Não foi possível continuar. Tente de novo.';
}
