import { Stack } from 'expo-router';

import { AdminGateProvider } from '@/screens/admin/gate';
import { colors } from '@/theme/tokens';

/** Painel de moderação: a navegação existe sempre; cada página só mostra os dados com o acesso liberado (ver gate.tsx). */
export default function AdminLayout() {
  return (
    <AdminGateProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
    </AdminGateProvider>
  );
}
