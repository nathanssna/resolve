import { Linking } from 'react-native';

import { notify } from '@/utils/dialog';
import { supabase } from './supabase';

/**
 * Liga para o outro participante. O banco só devolve o telefone depois que o
 * serviço foi combinado (get_contact_phone).
 */
export async function callOther(conversationId: string, otherName: string, combined: boolean) {
  if (!combined) {
    notify('A ligação fica disponível depois que o serviço for combinado.');
    return;
  }
  const { data: phone, error } = await supabase.rpc('get_contact_phone', { p_conversation_id: conversationId });
  if (error) {
    notify('Não foi possível buscar o telefone. Tente de novo.');
    return;
  }
  if (!phone) {
    notify(`${otherName} ainda não informou um telefone. Combine pelo chat.`);
    return;
  }
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => notify(`Telefone: ${phone}`));
}
