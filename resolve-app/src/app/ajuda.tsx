import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, Text, TopBar } from '@/components';
import { CONTACT_EMAIL } from '@/content/company';
import { helpSections, howItWorks, type HelpTopic } from '@/content/help';
import { useAuth } from '@/state/auth';
import { colors, radius, spacing } from '@/theme/tokens';
import { notify } from '@/utils/dialog';

/** Pergunta que abre a resposta embaixo. */
function Question({ topic, initialOpen }: { topic: HelpTopic; initialOpen?: boolean }) {
  const [open, setOpen] = useState(!!initialOpen);
  return (
    <View style={styles.item}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.question, pressed && { backgroundColor: colors.surfaceMuted }]}
      >
        <Text variant="label" style={{ flex: 1 }}>
          {topic.q}
        </Text>
        <View style={open && { transform: [{ rotate: '180deg' }] }}>
          <Icon name="chevron-down" size={18} />
        </View>
      </Pressable>
      {open ? (
        <Text variant="body" color={colors.inkBody} style={styles.answer}>
          {topic.a}
        </Text>
      ) : null}
    </View>
  );
}

/** Perfil → Ajuda (e os cartões do Início): passo a passo, perguntas frequentes e contato. */
export default function Ajuda() {
  const { abrir } = useLocalSearchParams<{ abrir?: string }>();
  const { profile, session } = useAuth();
  const sections = helpSections(profile?.role);

  const write = () => {
    const url = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Ajuda na Rezolveaê')}`;
    Linking.openURL(url).catch(() => notify(`Escreva para ${CONTACT_EMAIL}`));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Ajuda" />
      <ScrollView contentContainerStyle={styles.content}>
        {profile?.role !== 'profissional' ? (
          <View style={styles.how}>
            <Text variant="titleSm" accessibilityRole="header">
              Como funciona
            </Text>
            {howItWorks.map((s, i) => (
              <View key={s.title} style={styles.howRow}>
                <View style={styles.howN}>
                  <Text variant="labelLg">{i + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label">{s.title}</Text>
                  <Text variant="bodySm" color={colors.inkMuted}>
                    {s.text}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {sections.map((s) => (
          <View key={s.title} style={{ gap: spacing[2] }}>
            <Text variant="titleSm" accessibilityRole="header">
              {s.title}
            </Text>
            <View>
              {s.topics.map((t) => (
                <Question key={t.q} topic={t} initialOpen={!!t.id && t.id === abrir} />
              ))}
            </View>
          </View>
        ))}

        <View style={styles.contact}>
          <View style={{ gap: 2 }}>
            <Text variant="labelLg">Ainda precisa de ajuda?</Text>
            <Text variant="bodySm" color={colors.inkBody}>
              {session ? 'Fale com a equipe da Rezolveaê por aqui. Respondemos no app.' : `Escreva para ${CONTACT_EMAIL}. Respondemos por e-mail.`}
            </Text>
          </View>
          {/* Com conta: o canal oficial no app. Sem conta (ou sem conseguir entrar): e-mail. */}
          {session ? (
            <Button variant="dark" size="md" iconLeft="message-circle" onPress={() => router.push('/suporte')} style={{ alignSelf: 'flex-start' }}>
              Falar com a Rezolveaê
            </Button>
          ) : (
            <Button variant="dark" size="md" iconLeft="mail" onPress={write} style={{ alignSelf: 'flex-start' }}>
              Escrever e-mail
            </Button>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[5], paddingTop: spacing[2], gap: spacing[6], paddingBottom: spacing[8] },
  item: { borderBottomWidth: 1, borderBottomColor: colors.line },
  question: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[4], paddingHorizontal: spacing[2], borderRadius: radius.md },
  answer: { paddingHorizontal: spacing[2], paddingBottom: spacing[4] },
  how: { gap: spacing[4], padding: spacing[4], borderRadius: radius.xl, backgroundColor: colors.brandTint },
  howRow: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' },
  howN: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  contact: { gap: spacing[3], padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.surfaceMuted },
});
