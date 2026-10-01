import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider } from '@/state/app';
import { colors } from '@/theme/tokens';

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
      <AppProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="buscar" options={{ animation: 'fade' }} />
          <Stack.Screen name="servico/[id]" />
          <Stack.Screen name="profissionais/[serviceId]" />
          <Stack.Screen name="pedido/novo" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="pedido/[id]" />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
