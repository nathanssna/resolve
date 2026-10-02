import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ServiceCard, TopBar } from '@/components';
import { useApp } from '@/state/app';
import { useCatalog } from '@/state/catalog';
import { colors, spacing } from '@/theme/tokens';

/** Aberto pelo Perfil (não aparece na barra de abas). */
export default function Favoritos() {
  const { favorites } = useApp();
  const { services } = useCatalog();
  const items = services.filter((s) => favorites.includes(s.id));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Favoritos" onBack={() => router.navigate('/perfil')} />
      <ScrollView contentContainerStyle={styles.content}>
        {items.length === 0 ? (
          <EmptyState icon="heart" title="Nada por aqui ainda" description="Toque no coração de um serviço para guardá-lo aqui." />
        ) : (
          items.map((s) => (
            <ServiceCard
              key={s.id}
              icon={s.icon}
              title={s.title}
              subtitle={s.subtitle}
              rating={s.rating}
              count={s.reviews}
              onPress={() => router.push({ pathname: '/servico/[id]', params: { id: s.id } })}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[5], gap: spacing[3] },
});
