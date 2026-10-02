import { router } from 'expo-router';

/**
 * Sai das telas de login e volta para a tela que abriu o login (Perfil,
 * pedido de orçamento… ou a boas-vindas, que com sessão já vai para o Início).
 *
 * O fluxo empilha duas telas: /entrar e /entrar/codigo (que é trocada por
 * /entrar/sobre-voce no primeiro acesso).
 */
export function leaveAuthFlow() {
  if (router.canDismiss()) router.dismiss(2);
}
