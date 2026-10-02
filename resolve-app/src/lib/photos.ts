/**
 * Fotos: escolher (galeria ou câmera), reduzir e enviar ao Supabase Storage.
 *
 * Foto direto da câmera tem 3–8 MB; antes de enviar ela é reduzida para no
 * máximo `maxSide` px e salva em JPEG 70% (~200–300 KB no pedido, ~50 KB no
 * avatar).
 */
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export type LocalPhoto = { uri: string; width: number; height: number };

export const REQUEST_PHOTO_SIDE = 1280;
export const AVATAR_SIDE = 512;

export class PermissionDeniedError extends Error {}

/** Reduz para no máximo `maxSide` px no lado maior e salva em JPEG. */
export async function shrink(photo: LocalPhoto, maxSide: number): Promise<LocalPhoto> {
  const ctx = ImageManipulator.manipulate(photo.uri);
  if (Math.max(photo.width, photo.height) > maxSide) {
    ctx.resize(photo.width >= photo.height ? { width: maxSide } : { height: maxSide });
  }
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return { uri: out.uri, width: out.width, height: out.height };
}

/**
 * Abre a galeria (ou a câmera) e devolve as fotos já reduzidas.
 * `square`: recorte quadrado (foto de perfil), uma foto só.
 */
export async function pickPhotos({
  source = 'library',
  limit = 1,
  square = false,
  maxSide,
}: {
  source?: 'library' | 'camera';
  limit?: number;
  square?: boolean;
  maxSide: number;
}): Promise<LocalPhoto[]> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: square,
    aspect: square ? [1, 1] : undefined,
    allowsMultipleSelection: !square && limit > 1,
    selectionLimit: square ? 1 : limit,
  };

  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) throw new PermissionDeniedError('camera');
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  if (result.canceled) return [];

  const picked = result.assets.slice(0, limit);
  return Promise.all(picked.map((a) => shrink({ uri: a.uri, width: a.width, height: a.height }, maxSide)));
}

async function readBytes(uri: string): Promise<ArrayBuffer> {
  // Na web o manipulador devolve uma URL de blob/data; no celular, um arquivo local.
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}

/** Envia a foto para `bucket/path`. */
export async function uploadPhoto(bucket: 'request-photos' | 'avatars', path: string, uri: string, upsert = false) {
  const body = await readBytes(uri);
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: 'image/jpeg', upsert, cacheControl: '3600' });
  if (error) throw error;
}

/** Nome de arquivo único para a foto. */
export const photoName = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.jpg`;
