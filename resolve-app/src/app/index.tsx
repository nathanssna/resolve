import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, Logo, Text, type IconName } from '@/components';
import { colors, shadows, spacing } from '@/theme/tokens';

/** Composição de blocos de serviço flutuando — a "ilustração" da boas-vindas. */
const floating: { icon: IconName; x: number; y: number; r: number; size: number; tone: 'white' | 'ink' }[] = [
  { icon: 'wrench', x: 0, y: 34, r: -10, size: 84, tone: 'white' },
  { icon: 'zap', x: 104, y: 0, r: 6, size: 72, tone: 'ink' },
  { icon: 'laptop', x: 196, y: 40, r: -4, size: 92, tone: 'white' },
  { icon: 'paint-roller', x: 60, y: 140, r: 8, size: 76, tone: 'white' },
  { icon: 'message-circle', x: 160, y: 156, r: -8, size: 68, tone: 'ink' },
  { icon: 'sparkles', x: 238, y: 150, r: 10, size: 60, tone: 'white' },
];

export default function Welcome() {
  const enter = () => router.replace('/inicio');

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.curve} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={{ marginLeft: -4 }}>
          <Logo tone="onYellow" width={170} />
        </View>

        <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {floating.map((f) => (
            <View
              key={f.icon}
              style={[
                styles.block,
                {
                  left: f.x,
                  top: f.y,
                  width: f.size,
                  height: f.size,
                  borderRadius: f.size * 0.3,
                  backgroundColor: f.tone === 'ink' ? colors.ink : colors.surface,
                  transform: [{ rotate: `${f.r}deg` }],
                },
              ]}
            >
              <Icon
                name={f.icon}
                size={f.size * 0.44}
                strokeWidth={2}
                color={f.tone === 'ink' ? colors.brand : colors.ink}
                duotone={f.tone === 'white'}
              />
            </View>
          ))}
        </View>

        <View style={{ gap: spacing[3] }}>
          <Text variant="hero" color={colors.onBrand} accessibilityRole="header">
            Tudo pra sua casa, resolvido.
          </Text>
          <Text variant="body" color={colors.onBrand} style={{ fontSize: 16, lineHeight: 24, maxWidth: 320 }}>
            Encontre profissionais perto de você e combine tudo direto pelo chat.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button variant="dark" block iconRight="arrow-right" onPress={enter}>
            Começar
          </Button>
          <View style={styles.loginRow}>
            <Text variant="bodySm" color={colors.onBrand} style={{ fontSize: 14 }}>
              Já tem uma conta?
            </Text>
            {/* TODO: levar para a tela de login quando ela existir */}
            <Button variant="link" onPress={enter}>
              Entrar
            </Button>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brand, overflow: 'hidden' },
  curve: {
    position: 'absolute',
    right: -160,
    top: 120,
    width: 460,
    height: 460,
    borderRadius: 230,
    backgroundColor: colors.brandSoft,
    opacity: 0.7,
  },
  safe: { flex: 1, paddingHorizontal: spacing[6], paddingTop: spacing[4], paddingBottom: spacing[4], gap: spacing[6] },
  art: { flex: 1, minHeight: 230, maxHeight: 280, width: 310, alignSelf: 'center', marginTop: spacing[4] },
  block: { position: 'absolute', alignItems: 'center', justifyContent: 'center', boxShadow: shadows.float },
  actions: { gap: spacing[4] },
  loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
});
