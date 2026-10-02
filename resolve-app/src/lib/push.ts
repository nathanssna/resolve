/**
 * Notificações push (Expo Push + token salvo em push_tokens).
 *
 * O envio é feito pelo banco (trigger messages_push → API da Expo). Aqui o app
 * só registra o token do aparelho, decide se mostra a notificação com o app
 * aberto e abre o chat ao tocar.
 *
 * Push só funciona em aparelho de verdade com development build (no Expo Go do
 * Android não existe desde o SDK 53) e com o projectId do EAS no app.json.
 * Fora disso as funções não fazem nada.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export const pushSupported = Platform.OS !== 'web' && Device.isDevice;

/** Conversa aberta na tela: a notificação dela não aparece com o app aberto. */
let openChatId: string | null = null;
export const setOpenChat = (id: string | null) => {
  openChatId = id;
};

if (pushSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const sameChat = !!openChatId && n.request.content.data?.conversationId === openChatId;
      return { shouldShowBanner: !sameChat, shouldShowList: !sameChat, shouldPlaySound: !sameChat, shouldSetBadge: false };
    },
  });
}

let registeredToken: string | null = null;

/**
 * Registra o aparelho para receber push.
 * `ask`: pede a permissão se ainda não foi dada (só faça isso num momento que
 * faça sentido para a pessoa, ex.: depois de enviar um pedido).
 */
export async function registerPush({ ask }: { ask: boolean }): Promise<'granted' | 'denied' | 'unavailable'> {
  if (!pushSupported) return 'unavailable';
  try {
    if (Platform.OS === 'android') {
      // O canal precisa existir antes do pedido de permissão aparecer.
      await Notifications.setNotificationChannelAsync('mensagens', {
        name: 'Mensagens e pedidos',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FFD900',
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && ask) ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return 'denied';

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return 'unavailable';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) throw error;
    registeredToken = token;
    return 'granted';
  } catch {
    // Ex.: Expo Go no Android, sem rede. O app segue sem push.
    return 'unavailable';
  }
}

/** Ao sair da conta: este aparelho para de receber o push dela. */
export async function unregisterPush() {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  await supabase.from('push_tokens').delete().eq('token', token);
}

/** Ao tocar numa notificação (com o app aberto, em segundo plano ou fechado), abre o chat. */
export function onNotificationTap(open: (url: string) => void) {
  if (!pushSupported) return () => {};
  const handle = (n: Notifications.Notification) => {
    const url = n.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) open(url);
  };
  const last = Notifications.getLastNotificationResponse();
  if (last?.notification) handle(last.notification);
  const sub = Notifications.addNotificationResponseReceivedListener((r) => handle(r.notification));
  return () => sub.remove();
}
