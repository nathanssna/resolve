import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Button, Field, Icon, ListRow, OptionChip, Segmented, StickyFooter, Text, TopBar } from '@/components';
import { defaultAddress, getProfessional, getService } from '@/data/catalog';
import { useApp } from '@/state/app';
import { colors, radius, spacing } from '@/theme/tokens';
import { firstName, formatDecimal } from '@/utils/format';
import { notify } from '@/utils/dialog';

const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PERIODS = [
  { id: 'manha', label: 'Manhã', hint: '8h–12h' },
  { id: 'tarde', label: 'Tarde', hint: '13h–17h' },
  { id: 'noite', label: 'Noite', hint: '18h–20h' },
];

function nextDays(n = 6) {
  const out: { id: string; label: string; sub: string; long: string }[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dd = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : WEEK[d.getDay()];
    out.push({ id: String(i), label, sub: dd, long: i < 2 ? label : `${WEEK[d.getDay()]} ${dd}` });
  }
  return out;
}

export default function NovoPedido() {
  const { serviceId, proId } = useLocalSearchParams<{ serviceId: string; proId: string }>();
  const service = getService(serviceId);
  const pro = getProfessional(proId);
  const { startRequest } = useApp();

  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'agora' | 'agendar'>('agendar');
  const days = useMemo(() => nextDays(), []);
  const [day, setDay] = useState('1');
  const [period, setPeriod] = useState('tarde');

  if (!service || !pro) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <TopBar title="Pedir orçamento" />
      </SafeAreaView>
    );
  }

  const when =
    mode === 'agora'
      ? 'O quanto antes'
      : `${days.find((d) => d.id === day)?.long}, ${PERIODS.find((p) => p.id === period)?.label.toLowerCase()}`;
  const canSend = description.trim().length >= 5;

  const send = () => {
    const id = startRequest({ proId: pro.id, serviceId: service.id, description: description.trim(), when, address: defaultAddress });
    router.dismissTo('/inicio');
    router.push({ pathname: '/chat/[id]', params: { id } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TopBar title="Pedir orçamento" />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.pro}>
            <Avatar size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="labelLg">{pro.name}</Text>
              <View style={styles.proMeta}>
                <Icon name="star" size={13} fill={colors.star} color={colors.star} strokeWidth={1} />
                <Text variant="bodySm">
                  {formatDecimal(pro.rating)} · {service.short}
                </Text>
              </View>
            </View>
            <View style={styles.reply}>
              <Icon name="timer" size={14} strokeWidth={2.25} />
              <Text variant="caption">~{pro.replyMin} min</Text>
            </View>
          </View>

          <View style={{ gap: spacing[3] }}>
            <Field
              label="O que você precisa?"
              placeholder={`Ex.: ${service.examples[0].toLowerCase()}…`}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={500}
            />
            <View style={styles.chips}>
              {service.examples.map((e) => (
                <Pressable
                  key={e}
                  accessibilityRole="button"
                  onPress={() => setDescription((d) => (d ? `${d} ${e}` : e))}
                  style={({ pressed }) => [styles.suggest, pressed && { backgroundColor: colors.surfaceStrong }]}
                >
                  <Icon name="plus" size={14} strokeWidth={2.5} />
                  <Text variant="caption" style={{ fontSize: 13 }}>
                    {e}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={{ gap: spacing[3] }}>
            <Text variant="label">Quando?</Text>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { id: 'agora', label: 'O quanto antes', icon: 'zap' },
                { id: 'agendar', label: 'Agendar', icon: 'calendar' },
              ]}
            />
            {mode === 'agendar' ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing[2] }}>
                  {days.map((d) => (
                    <OptionChip key={d.id} label={d.label} sublabel={d.sub} active={d.id === day} onPress={() => setDay(d.id)} />
                  ))}
                </ScrollView>
                <View style={{ flexDirection: 'row', gap: spacing[2] }}>
                  {PERIODS.map((p) => (
                    <View key={p.id} style={{ flex: 1 }}>
                      <OptionChip label={p.label} sublabel={p.hint} active={p.id === period} onPress={() => setPeriod(p.id)} />
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </View>

          <View style={{ gap: spacing[2] }}>
            <Text variant="label">Onde?</Text>
            <View style={styles.box}>
              <ListRow
                icon="map-pin"
                label={defaultAddress.label}
                value={`${defaultAddress.line} · ${defaultAddress.area}`}
                onPress={() => notify('Troca de endereço em breve.')}
              />
            </View>
          </View>
        </ScrollView>

        <StickyFooter>
          <View style={styles.free}>
            <Icon name="shield-check" size={16} strokeWidth={2.25} color={colors.success} />
            <Text variant="caption" color={colors.inkMuted} style={{ flex: 1 }}>
              Nada é cobrado agora. Vocês combinam o valor no chat.
            </Text>
          </View>
          <Button variant="primary" block iconRight="arrow-right" disabled={!canSend} onPress={send}>
            {`Enviar para ${firstName(pro.name)}`}
          </Button>
        </StickyFooter>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[5], paddingTop: spacing[2], gap: spacing[6] },
  pro: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.brandTint },
  proMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reply: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.surface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 34, paddingHorizontal: spacing[3], borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  box: { borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: spacing[1] },
  free: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
});
