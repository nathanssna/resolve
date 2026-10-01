import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components';
import { useApp } from '@/state/app';
import { colors, fonts, radius } from '@/theme/tokens';

/** Ícone da aba: a ativa ganha uma pílula amarela atrás. */
function tabIcon(name: IconName) {
  return ({ focused }: { focused: boolean }) => (
    <View
      style={{
        width: 60,
        height: 32,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? colors.brand : 'transparent',
      }}
    >
      <Icon name={name} size={22} strokeWidth={focused ? 2.25 : 2} color={focused ? colors.ink : colors.inkMuted} />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { unreadTotal, orders } = useApp();
  const activeOrders = orders.filter((o) => o.status === 'combinado').length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, marginTop: 4 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: 76 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
        },
        tabBarBadgeStyle: {
          backgroundColor: colors.ink,
          color: colors.onInk,
          fontFamily: fonts.bold,
          fontSize: 11,
        },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="inicio" options={{ title: 'Início', tabBarIcon: tabIcon('house') }} />
      <Tabs.Screen
        name="mensagens"
        options={{ title: 'Mensagens', tabBarIcon: tabIcon('message-circle'), tabBarBadge: unreadTotal || undefined }}
      />
      <Tabs.Screen
        name="pedidos"
        options={{ title: 'Pedidos', tabBarIcon: tabIcon('clipboard-list'), tabBarBadge: activeOrders || undefined }}
      />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil', tabBarIcon: tabIcon('user') }} />
      {/* Favoritos é aberto pelo Perfil */}
      <Tabs.Screen name="favoritos" options={{ href: null, title: 'Favoritos' }} />
    </Tabs>
  );
}
