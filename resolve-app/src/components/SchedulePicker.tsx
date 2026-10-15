import { useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { spacing } from '@/theme/tokens';
import { nextDays, periodEnded, PERIODS, type Schedule } from '@/utils/schedule';
import { OptionChip } from './Surfaces';

/** Dias que dá para escolher (proposta e remarcação). */
const DAYS = 30;
/** Largura aproximada de um dia na faixa (chip + espaço), para rolar até o escolhido. */
const DAY_WIDTH = 72;

/** Faixa de dias e os três períodos; os que já terminaram ficam apagados. */
export function SchedulePicker({ value, onChange }: { value: Schedule; onChange: (s: Schedule) => void }) {
  const days = nextDays(DAYS);
  const daysRef = useRef<ScrollView>(null);
  // Hoje, os períodos que já terminaram não podem ser escolhidos.
  const open = (day: number) => PERIODS.filter((p) => !periodEnded({ day, period: p.id }));
  const pickDay = (day: number) => {
    const free = open(day);
    onChange({ day, period: free.some((p) => p.id === value.period) ? value.period : (free[0]?.id ?? value.period) });
  };

  return (
    <View style={{ gap: spacing[2] }}>
      <ScrollView
        ref={daysRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: spacing[2] }}
        onLayout={() => {
          // Abre com o dia escolhido à vista.
          const i = days.findIndex((d) => d.day === value.day);
          if (i > 3) daysRef.current?.scrollTo({ x: (i - 1) * DAY_WIDTH, animated: false });
        }}
      >
        {days.map((d) => {
          const full = open(d.day).length === 0;
          return (
            <View key={d.day} style={full && styles.unavailable} pointerEvents={full ? 'none' : 'auto'}>
              <OptionChip label={d.label} sublabel={d.sub} active={d.day === value.day} onPress={() => pickDay(d.day)} />
            </View>
          );
        })}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        {PERIODS.map((p) => {
          const ended = periodEnded({ day: value.day, period: p.id });
          return (
            <View key={p.id} style={[{ flex: 1 }, ended && styles.unavailable]} pointerEvents={ended ? 'none' : 'auto'}>
              <OptionChip label={p.label} sublabel={p.hint} active={p.id === value.period} onPress={() => onChange({ ...value, period: p.id })} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Os dias da faixa (para saber se uma data sugerida cabe nela). */
export const pickerDays = () => nextDays(DAYS);

const styles = StyleSheet.create({
  unavailable: { opacity: 0.35 },
});
