import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { router, Stack, useSegments, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { onNotificationTap, registerPush } from '@/lib/push';
import { AddressProvider } from '@/state/addresses';
import { AppProvider } from '@/state/app';
import { AuthProvider, useAuth } from '@/state/auth';
import { CatalogProvider } from '@/state/catalog';
import { colors } from '@/theme/tokens';

/** Logado sem nome/papel (app reaberto no meio do cadastro) → "Sobre você". */
function OnboardingGate() {
  const { ready, needsOnboarding } = useAuth();
  const segments = useSegments();
  const inAuthFlow = segments[0] === 'entrar';

  useEffect(() => {
    if (ready && needsOnboarding && !inAuthFlow) {
      router.push({ pathname: '/entrar/sobre-voce', params: { gate: '1' } });
    }
  }, [ready, needsOnboarding, inAuthFlow]);

  return null;
}

/** Push: registra o aparelho (sem pedir permissão) e abre o chat ao tocar na notificação. */
function PushGate() {
  const { ready, session, needsOnboarding } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (ready && userId && !needsOnboarding) registerPush({ ask: false });
  }, [ready, userId, needsOnboarding]);

  useEffect(() => onNotificationTap((url) => router.push(url as Href)), []);

  return null;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  if (!loaded && !error) {
    return <View style={{ flex: 1, backgroundColor: colors.brand }} />;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <CatalogProvider>
          <AddressProvider>
            <AppProvider>
              <StatusBar style="dark" />
              <OnboardingGate />
              <PushGate />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="buscar" options={{ animation: 'fade' }} />
                <Stack.Screen name="servico/[id]" />
                <Stack.Screen name="profissionais/[serviceId]" />
                <Stack.Screen name="pedido/novo" options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="chat/[id]" />
                <Stack.Screen name="pedido/[id]" />
                <Stack.Screen name="entrar/index" />
                <Stack.Screen name="entrar/codigo" />
                {/* Sem voltar: o cadastro precisa ser concluído (ou trocar de conta) */}
                <Stack.Screen name="entrar/sobre-voce" options={{ gestureEnabled: false }} />
                <Stack.Screen name="profissional/ficha" />
                <Stack.Screen name="profissional/[id]" />
                <Stack.Screen name="enderecos/index" />
                <Stack.Screen name="enderecos/editar" />
                <Stack.Screen name="telefone" />
              </Stack>
            </AppProvider>
          </AddressProvider>
        </CatalogProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
