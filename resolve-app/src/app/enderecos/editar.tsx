import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, OptionChip, StickyFooter, Text, TopBar } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { formatCep, lookupCep } from '@/lib/cep';
import { useAddresses } from '@/state/addresses';
import { colors, spacing } from '@/theme/tokens';
import { confirm, notify } from '@/utils/dialog';

const LABELS = ['Casa', 'Trabalho', 'Outro'];

/** "Av. Paulista, 1000" → ["Av. Paulista", "1000"] (o banco guarda rua e número juntos). */
function splitLine(line: string): [string, string] {
  const i = line.lastIndexOf(',');
  return i > 0 ? [line.slice(0, i).trim(), line.slice(i + 1).trim()] : [line, ''];
}

/** Adicionar ou editar endereço (`id` = editar). O CEP preenche rua, bairro e cidade. */
export default function EditarEndereco() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { addresses, add, update, remove } = useAddresses();
  const existing = id ? addresses.find((a) => a.id === id) : undefined;
  const [street0, number0] = existing ? splitLine(existing.line) : ['', ''];

  const [cep, setCep] = useState(existing?.postalCode ? formatCep(existing.postalCode) : '');
  const [street, setStreet] = useState(street0);
  const [number, setNumber] = useState(number0);
  const [complement, setComplement] = useState(existing?.complement ?? '');
  const [area, setArea] = useState(existing?.area ?? '');
  const [city, setCity] = useState(existing?.city ?? '');
  const [uf, setUf] = useState(existing?.state ?? '');
  const [label, setLabel] = useState(existing?.label ?? 'Casa');
  const [primary, setPrimary] = useState(existing?.isDefault ?? false);
  const [looking, setLooking] = useState(false);
  const [cepMsg, setCepMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lastLooked = useRef(existing?.postalCode?.replace(/\D/g, '') ?? '');

  // CEP completo → busca rua, bairro e cidade.
  useEffect(() => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8 || digits === lastLooked.current) return;
    lastLooked.current = digits;
    let alive = true;
    Promise.resolve()
      .then(() => {
        setLooking(true);
        setCepMsg(null);
        return lookupCep(digits);
      })
      .then((r) => {
        if (!alive) return;
        if (!r) return setCepMsg('CEP não encontrado. Preencha o endereço abaixo.');
        if (r.street) setStreet(r.street);
        if (r.area) setArea(r.area);
        setCity(r.city);
        setUf(r.state);
      })
      .catch(() => alive && setCepMsg('Sem conexão para buscar o CEP. Preencha o endereço abaixo.'))
      .finally(() => alive && setLooking(false));
    return () => {
      alive = false;
    };
  }, [cep]);

  const canSave = street.trim().length >= 3 && number.trim().length > 0 && area.trim().length > 0 && city.trim().length > 0 && uf.trim().length === 2 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const input = {
      label,
      line: `${street.trim()}, ${number.trim()}`,
      complement,
      area,
      city,
      state: uf,
      postalCode: cep.replace(/\D/g, '').length === 8 ? formatCep(cep) : '',
      isDefault: primary,
    };
    try {
      if (existing) await update(existing.id, input);
      else await add(input);
      router.back();
    } catch (e) {
      notify(`Não foi possível salvar o endereço. ${authErrorMessage(e)}`);
      setSaving(false);
    }
  };

  const del = () =>
    existing &&
    confirm(`Apagar o endereço "${existing.label}"?`, async () => {
      try {
        await remove(existing.id);
        router.back();
      } catch (e) {
        notify(authErrorMessage(e));
      }
    });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TopBar title={existing ? 'Editar endereço' : 'Novo endereço'} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={{ gap: spacing[2] }}>
            <Field
              label="CEP"
              placeholder="00000-000"
              value={cep}
              onChangeText={(t) => setCep(formatCep(t))}
              keyboardType="number-pad"
              inputMode="numeric"
              autoComplete="postal-code"
              textContentType="postalCode"
              maxLength={9}
              autoFocus={!existing}
            />
            {looking ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                <ActivityIndicator size="small" color={colors.ink} />
                <Text variant="caption" color={colors.inkMuted}>
                  Buscando endereço…
                </Text>
              </View>
            ) : null}
            {cepMsg ? (
              <Text variant="caption" color={colors.inkMuted} accessibilityLiveRegion="polite">
                {cepMsg}
              </Text>
            ) : null}
          </View>

          <Field label="Rua" placeholder="Ex.: Av. Paulista" value={street} onChangeText={setStreet} autoComplete="street-address" maxLength={150} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Número" placeholder="Ex.: 1000" value={number} onChangeText={setNumber} maxLength={20} />
            </View>
            <View style={{ flex: 1.4 }}>
              <Field label="Complemento" placeholder="Ex.: Apto 12" value={complement} onChangeText={setComplement} maxLength={120} />
            </View>
          </View>
          <Field label="Bairro" value={area} onChangeText={setArea} maxLength={120} />
          <View style={styles.row}>
            <View style={{ flex: 3 }}>
              <Field label="Cidade" value={city} onChangeText={setCity} maxLength={120} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="UF" value={uf} onChangeText={(t) => setUf(t.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2))} maxLength={2} autoCapitalize="characters" />
            </View>
          </View>

          <View style={{ gap: spacing[3] }}>
            <Text variant="label">Apelido</Text>
            <View style={styles.row}>
              {LABELS.map((l) => (
                <View key={l} style={{ flex: 1 }}>
                  <OptionChip label={l} active={label === l} onPress={() => setLabel(l)} />
                </View>
              ))}
            </View>
          </View>

          {!existing?.isDefault ? (
            <OptionChip label={primary ? 'Endereço principal' : 'Usar como endereço principal'} active={primary} onPress={() => setPrimary((p) => !p)} />
          ) : null}

          <Text variant="caption" color={colors.inkMuted}>
            O profissional só vê rua e número depois que vocês combinarem o serviço. Antes, vê só o bairro.
          </Text>

          {existing ? (
            <Button variant="link" onPress={del} style={{ alignSelf: 'center' }}>
              Apagar endereço
            </Button>
          ) : null}
        </ScrollView>

        <StickyFooter>
          <Button variant="primary" block iconLeft="check" disabled={!canSave} onPress={save}>
            {saving ? 'Salvando…' : 'Salvar endereço'}
          </Button>
        </StickyFooter>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing[5], paddingTop: spacing[2], gap: spacing[5] },
  row: { flexDirection: 'row', gap: spacing[3] },
});
