import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, Text, TopBar } from '@/components';
import { CONTACT_EMAIL } from '@/content/company';
import { helpSections, type HelpTopic } from '@/content/help';
import { useAuth } from '@/state/auth';
import { colors, radius, spacing } from '@/theme/tokens';
import { notify } from '@/utils/dialog';

/** Pergunta que abre a resposta embaixo. */
function Question({ topic }: { topic: HelpTopic }) {
  const [open, setOpen] = useState(false);
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
          <Icon name="chevron-down" size={18} strokeWidth={2.25} />
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

/** Perfil → Ajuda (e "Ajuda" no detalhe do serviço): perguntas frequentes e contato. */
export default function Ajuda() {
  const { profile } = useAuth();
  const sections = helpSections(profile?.role);

  const write = () => {
    const url = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Ajuda no Resolve')}`;
    Linking.openURL(url).catch(() => notify(`Escreva para ${CONTACT_EMAIL}`));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopBar title="Ajuda" />
      <ScrollView contentContainerStyle={styles.content}>
        {sections.map((s) => (
          <View key={s.title} style={{ gap: spacing[2] }}>
            <Text variant="titleSm" accessibilityRole="header">
              {s.title}
            </Text>
            <View>
              {s.topics.map((t) => (
                <Question key={t.q} topic={t} />
              ))}
            </View>
          </View>
        ))}

        <View style={styles.contact}>
          <View style={{ gap: 2 }}>
            <Text variant="labelLg">Ainda precisa de ajuda?</Text>
            <Text variant="bodySm" color={colors.inkBody}>
              {`Escreva para ${CONTACT_EMAIL}. Respondemos por e-mail.`}
            </Text>
          </View>
          <Button variant="dark" size="md" iconLeft="mail" onPress={write} style={{ alignSelf: 'flex-start' }}>
            Escrever e-mail
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[4], paddingTop: spacing[2], gap: spacing[6], paddingBottom: spacing[8] },
  item: { borderBottomWidth: 1, borderBottomColor: colors.line },
  question: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[4], paddingHorizontal: spacing[2], borderRadius: radius.md },
  answer: { paddingHorizontal: spacing[2], paddingBottom: spacing[4] },
  contact: { gap: spacing[3], padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.surfaceMuted },
});
