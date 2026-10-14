/**
 * Verificação de identidade do profissional (selo Verificado), revisada à mão
 * no painel do Supabase (tabela verifications). As fotos ficam no bucket
 * privado `verification`, na pasta do dono, e são apagadas depois da análise.
 */
import type { Database } from './database.types';
import { photoName, uploadPhoto, type LocalPhoto } from './photos';
import { supabase } from './supabase';

export type Verification = Pick<Database['public']['Tables']['verifications']['Row'], 'id' | 'status' | 'reason' | 'created_at'>;

/** Lados maiores das fotos: o documento precisa dar para ler. */
export const DOCUMENT_SIDE = 1600;

/** A verificação mais recente do profissional logado (null = nunca enviou). */
export async function latestVerification(): Promise<Verification | null> {
  const { data, error } = await supabase
    .from('verifications')
    .select('id, status, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Envia as duas fotos e pede a análise. Se o pedido falhar, as fotos saem. */
export async function submitVerification(uid: string, document: LocalPhoto, selfie: LocalPhoto) {
  const documentPath = `${uid}/${photoName()}`;
  const selfiePath = `${uid}/${photoName()}`;
  await uploadPhoto('verification', documentPath, document.uri);
  await uploadPhoto('verification', selfiePath, selfie.uri);
  const { error } = await supabase.from('verifications').insert({ document_path: documentPath, selfie_path: selfiePath });
  if (error) {
    await supabase.storage.from('verification').remove([documentPath, selfiePath]);
    throw error;
  }
}

/** Depois da análise, as fotos saem do servidor (LGPD). Sem rede, tenta na próxima vez. */
export async function deleteReviewedPhotos() {
  const { data } = await supabase.from('verifications').select('id, document_path, selfie_path').neq('status', 'pending').is('files_deleted_at', null);
  for (const v of data ?? []) {
    const { error } = await supabase.storage.from('verification').remove([v.document_path, v.selfie_path]);
    if (!error) await supabase.from('verifications').update({ files_deleted_at: new Date().toISOString() }).eq('id', v.id);
  }
}

/** Ao excluir a conta: todas as fotos da verificação, analisadas ou não. */
export async function deleteAllVerificationPhotos() {
  const { data } = await supabase.from('verifications').select('document_path, selfie_path').is('files_deleted_at', null);
  const paths = (data ?? []).flatMap((v) => [v.document_path, v.selfie_path]);
  if (paths.length) await supabase.storage.from('verification').remove(paths);
}
