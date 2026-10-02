/**
 * Sessão do Supabase e perfil do usuário logado.
 *
 * Login sem senha: e-mail → código de 6 dígitos (signInWithOtp + verifyOtp).
 * No primeiro acesso o perfil nasce com o nome vazio; `needsOnboarding` fica
 * true até a pessoa informar nome e papel (complete_onboarding).
 *
 * O perfil é lido SEMPRE por get_my_profile() — o telefone não é legível por
 * select em `profiles`.
 */
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { uploadPhoto, type LocalPhoto } from '@/lib/photos';
import { unregisterPush } from '@/lib/push';
import { supabase, type Profile, type UserRole } from '@/lib/supabase';

type AuthValue = {
  /** Sessão restaurada do aparelho (e perfil carregado, se houver sessão). */
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  /** Logado, mas ainda sem nome/papel. */
  needsOnboarding: boolean;
  /** Envia o código de 6 dígitos. Cria a conta se o e-mail for novo. */
  sendCode: (email: string) => Promise<void>;
  /** Confere o código e devolve o perfil (null se não deu para ler). */
  verifyCode: (email: string, code: string) => Promise<Profile | null>;
  completeOnboarding: (fullName: string, role: UserRole) => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
  /** Troca a foto de perfil (já reduzida). */
  setAvatar: (photo: LocalPhoto) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthValue | null>(null);

async function fetchMyProfile(): Promise<Profile | null> {
  const { data, error } = await supabase.rpc('get_my_profile');
  if (error) throw error;
  // Sem linha, a função devolve um registro vazio.
  return data?.id ? data : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  // Perfil guardado junto com o id de quem ele é: trocar de conta invalida sozinho.
  const [loaded, setLoaded] = useState<{ uid: string; profile: Profile | null } | null>(null);

  const userId = session?.user.id ?? null;
  const profile = loaded && loaded.uid === userId ? loaded.profile : null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });
    // Não chamar o Supabase dentro deste callback (pode travar o auth); o perfil é lido no efeito abaixo.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId || loaded?.uid === userId) return;
    fetchMyProfile()
      .then((p) => setLoaded({ uid: userId, profile: p }))
      // Sem rede: segue logado sem perfil; refreshProfile tenta de novo.
      .catch(() => setLoaded({ uid: userId, profile: null }));
  }, [userId, loaded?.uid]);

  const sendCode = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw error;
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) throw error;
    const uid = data.session?.user.id;
    setSession(data.session);
    if (!uid) return null;
    const p = await fetchMyProfile();
    setLoaded({ uid, profile: p });
    return p;
  }, []);

  const completeOnboarding = useCallback(async (fullName: string, role: UserRole) => {
    const { data, error } = await supabase.rpc('complete_onboarding', { p_full_name: fullName.trim(), p_role: role });
    if (error) throw error;
    setLoaded({ uid: data.id, profile: data });
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!userId) return null;
    const p = await fetchMyProfile();
    setLoaded({ uid: userId, profile: p });
    return p;
  }, [userId]);

  const setAvatar = useCallback(
    async (photo: LocalPhoto) => {
      if (!userId) return;
      const path = `${userId}/avatar.jpg`;
      await uploadPhoto('avatars', path, photo.uri, true);
      // O ?v= faz o celular buscar a foto nova em vez da que está no cache.
      const url = `${supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
      const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId);
      if (error) throw error;
      const p = await fetchMyProfile();
      setLoaded({ uid: userId, profile: p });
    },
    [userId],
  );

  const signOut = useCallback(async () => {
    // Este aparelho para de receber o push da conta (precisa da sessão para apagar).
    await unregisterPush().catch(() => {});
    // 'local' encerra a sessão neste aparelho mesmo sem internet.
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  const ready = sessionReady && (!userId || loaded?.uid === userId);
  const needsOnboarding = !!profile && profile.full_name.trim() === '';

  const value = useMemo<AuthValue>(
    () => ({ ready, session, profile, needsOnboarding, sendCode, verifyCode, completeOnboarding, refreshProfile, setAvatar, signOut }),
    [ready, session, profile, needsOnboarding, sendCode, verifyCode, completeOnboarding, refreshProfile, setAvatar, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
