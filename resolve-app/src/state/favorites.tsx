/** Compatibilidade: os favoritos agora vivem em `@/state/app`. */
import { useApp } from './app';

export function useFavorites() {
  const { favorites, isFavorite, toggleFavorite } = useApp();
  return { ids: favorites, isFavorite, toggle: toggleFavorite };
}
