/**
 * Localização: endereço → coordenadas (geocodificador do próprio celular,
 * sem custo) e "onde estou agora". Na web o geocodificador não existe:
 * as funções devolvem null e o app segue sem distância.
 */
import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type Coords = { latitude: number; longitude: number };

/** ~100 m: o bastante para distância, sem apontar a casa exata. */
export const roundCoord = (n: number) => Math.round(n * 1000) / 1000;

/** "Avenida Paulista, 1000, Bela Vista, São Paulo - SP, 01310-100" → coordenadas. */
export async function geocodeAddress(parts: { line?: string; area?: string; city?: string; state?: string; postalCode?: string }): Promise<Coords | null> {
  if (Platform.OS === 'web') return null;
  const query = [parts.line, parts.area, [parts.city, parts.state].filter(Boolean).join(' - '), parts.postalCode, 'Brasil'].filter(Boolean).join(', ');
  try {
    const [hit] = await Location.geocodeAsync(query);
    return hit ? { latitude: hit.latitude, longitude: hit.longitude } : null;
  } catch {
    return null;
  }
}

export class LocationDeniedError extends Error {}

/** Rótulo quando não dá para saber o bairro (ex.: na web). Não aparece para o cliente. */
export const GENERIC_PLACE = 'Sua localização';

/** Onde o aparelho está agora, com o bairro e a cidade para mostrar. Pede permissão. */
export async function currentPlace(): Promise<Coords & { label: string }> {
  const { granted } = await Location.requestForegroundPermissionsAsync();
  if (!granted) throw new LocationDeniedError('Permissão de localização negada');
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  let label = GENERIC_PLACE;
  if (Platform.OS !== 'web') {
    try {
      const [place] = await Location.reverseGeocodeAsync(coords);
      const area = place?.district || place?.subregion;
      label = [area, place?.city].filter(Boolean).join(', ') || label;
    } catch {
      // Sem nome do bairro: fica "Sua localização".
    }
  }
  return { ...coords, label };
}
