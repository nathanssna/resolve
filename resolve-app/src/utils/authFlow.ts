import { router } from 'expo-router';

/**
 * Sai das telas de login e volta para onde a pessoa estava (Perfil, ou a
 * boas-vindas — que, com sessão, já redireciona para o Início).
 */
export function leaveAuthFlow() {
  if (router.canDismiss()) router.dismissAll();
}
