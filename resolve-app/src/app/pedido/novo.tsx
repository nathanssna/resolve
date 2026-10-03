import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avatar,
  Button,
  CatalogFallback,
  EmptyState,
  Field,
  goBack,
  Icon,
  OptionChip,
  PhotoThumbs,
  ProgressBar,
  Segmented,
  StickyFooter,
  Text,
  TopBar,
} from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { PermissionDeniedError, pickPhotos, REQUEST_PHOTO_SIDE, type LocalPhoto } from '@/lib/photos';
import { registerPush } from '@/lib/push';
import { addressLine, useAddresses } from '@/state/addresses';
import { useApp } from '@/state/app';
import { useAuth } from '@/state/auth';
import { useCatalog } from '@/state/catalog';
import { colors, radius, spacing } from '@/theme/tokens';
import { firstName, formatDecimal } from '@/utils/format';
import { notify } from '@/utils/dialog';

const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PERIODS = [
  { id: 'manha', label: 'Manhã', hint: '8h–12h' },
  { id: 'tarde', label: 'Tarde', hint: '13h–17h' },
  { id: 'noite', label: 'Noite', hint: '18h–20h' },
];
const MAX_PHOTOS = 4;

const STEPS = [
  { title: 'O que você precisa?', short: 'O que precisa' },
  { title: 'Quando e onde?', short: 'Quando e onde' },
  { title: 'Quer mandar fotos?', short: 'Fotos' },
] as const;

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

/** Pedido de orçamento em 3 passos: o que precisa → quando e onde → fotos (opcional) e enviar. */
export default function NovoPedido() {
  const { serviceId, proId } = useLocalSearchParams<{ serviceId: string; proId: string }>();
  const { getService, getProfessional, status, refresh } = useCatalog();
  const service = getService(serviceId);
  const pro = getProfessional(proId);
  const { startRequest } = useApp();
  const { session } = useAuth();

  const [step, setStep] = useState(0);
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'agora' | 'agendar'>('agendar');
  const days = useMemo(() => nextDays(), []);
  const [day, setDay] = useState('1');
  const [period, setPeriod] = useState('tarde');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [adding, setAdding] = useState(false);
  const [sending, setSending] = useState<{ sent: number; total: number } | null>(null);
  const { addresses, primary, lastAddedId, status: addrStatus, refresh: refreshAddresses } = useAddresses();
  const [addressId, setAddressId] = useState<string>();
  // Quem sai para adicionar um endereço volta com ele já escolhido.
  const [addingFrom, setAddingFrom] = useState<{ before: string | null } | null>(null);
  const exists = (id?: string | null) => !!id && addresses.some((a) => a.id === id);
  const newlyAdded = addingFrom && lastAddedId !== addingFrom.before && exists(lastAddedId) ? lastAddedId : null;
  const chosenId = newlyAdded ?? (exists(addressId) ? addressId : primary?.id);
  const address = addresses.find((a) => a.id === chosenId);

  const focused = useIsFocused();
  const back = () => (step > 0 ? setStep(step - 1) : goBack());

  // Botão "voltar" do Android volta um passo, não sai do pedido
  // (só com esta tela na frente; com o login por cima, fecha o login).
  useEffect(() => {
    if (!focused || step === 0) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep((s) => s - 1);
      return true;
    });
    return () => sub.remove();
  }, [focused, step]);

  if (!service || !pro) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <TopBar title="Pedir orçamento" />
        <View style={{ padding: spacing[5] }}>
          {status === 'ready' ? (
            <EmptyState icon="user-round" title="Profissional não encontrado" description="Volte e escolha outro profissional." />
          ) : (
            <CatalogFallback status={status} onRetry={refresh} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const when =
    mode === 'agora'
      ? 'O quanto antes'
      : `${days.find((d) => d.id === day)?.long}, ${PERIODS.find((p) => p.id === period)?.label.toLowerCase()}`;
  const descriptionOk = description.trim().length >= 5;

  const addPhotos = async (source: 'library' | 'camera') => {
    if (adding || photos.length >= MAX_PHOTOS) return;
    setAdding(true);
    try {
      const picked = await pickPhotos({ source, limit: MAX_PHOTOS - photos.length, maxSide: REQUEST_PHOTO_SIDE });
      setPhotos((p) => [...p, ...picked].slice(0, MAX_PHOTOS));
    } catch (e) {
      notify(
        e instanceof PermissionDeniedError
          ? 'Permita o acesso à câmera nas configurações do celular para tirar fotos.'
          : 'Não foi possível usar essa foto. Tente outra.',
      );
    } finally {
      setAdding(false);
    }
  };

  const send = async () => {
    // Sem login: entra e volta para esta tela, com tudo preservado.
    if (!session) return router.push('/entrar');
    if (sending || !address) return;
    setSending({ sent: 0, total: photos.length });
    try {
      const id = await startRequest({
        proId: pro.id,
        serviceId: service.id,
        description: description.trim(),
        when,
        address: {
          label: address!.label,
          line: address!.line,
          complement: address!.complement || undefined,
          area: address!.area,
          city: address!.city,
          state: address!.state,
          postalCode: address!.postalCode || undefined,
        },
        photos,
        onProgress: (sent, total) => setSending({ sent, total }),
      });
      // Bom momento para pedir permissão de notificação: a resposta vem pelo chat.
      registerPush({ ask: true });
      router.dismissTo('/inicio');
      router.push({ pathname: '/chat/[id]', params: { id } });
    } catch (e) {
      notify(`Não foi possível enviar o pedido. ${authErrorMessage(e)}`);
      setSending(null);
    }
  };

  const sendLabel = !session
    ? 'Entrar para enviar'
    : sending
      ? sending.total && sending.sent < sending.total
        ? `Enviando fotos ${sending.sent + 1} de ${sending.total}…`
        : 'Enviando…'
      : `Enviar para ${firstName(pro.name)}`;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TopBar title="Pedir orçamento" onBack={back} />

        <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel={`Passo ${step + 1} de 3: ${STEPS[step].short}`}>
          <View style={styles.progressHead}>
            <Text variant="overline" color={colors.inkMuted}>
              {`PASSO ${step + 1} DE 3`}
            </Text>
            <Text variant="caption" color={colors.inkMuted}>
              {STEPS[step].short}
            </Text>
          </View>
          <ProgressBar value={(step + 1) / 3} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 0 ? (
            <>
              <View style={styles.pro}>
                <Avatar size={48} uri={pro.avatarUrl} />
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
                  label={STEPS[0].title}
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
            </>
          ) : null}

          {step === 1 ? (
            <>
              <View style={{ gap: spacing[3] }}>
                <Text variant="titleSm" accessibilityRole="header">
                  Quando?
                </Text>
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
                <Text variant="titleSm" accessibilityRole="header">
                  Onde?
                </Text>
                {!session ? (
                  <View style={[styles.box, { padding: spacing[4], gap: spacing[3] }]}>
                    <Text variant="body" color={colors.inkBody}>
                      Entre para escolher o endereço.
                    </Text>
                    <Button variant="secondary" size="md" onPress={() => router.push('/entrar')}>
                      Entrar
                    </Button>
                  </View>
                ) : addrStatus !== 'ready' ? (
                  <CatalogFallback status={addrStatus === 'error' ? 'error' : 'loading'} onRetry={refreshAddresses} />
                ) : (
                  <View accessibilityRole="radiogroup" style={{ gap: spacing[2] }}>
                    {addresses.map((a) => {
                      const on = a.id === chosenId;
                      return (
                        <Pressable
                          key={a.id}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: on }}
                          aria-checked={on}
                          accessibilityLabel={`${a.label}: ${addressLine(a)}`}
                          onPress={() => {
                            setAddressId(a.id);
                            setAddingFrom(null);
                          }}
                          style={[styles.addr, on && styles.addrOn]}
                        >
                          <Icon name="map-pin" size={20} strokeWidth={2} />
                          <View style={{ flex: 1, gap: 1 }}>
                            <Text variant="label">{a.label}</Text>
                            <Text variant="bodySm" color={colors.inkBody} numberOfLines={2}>
                              {addressLine(a)}
                            </Text>
                          </View>
                          <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                        </Pressable>
                      );
                    })}
                    <Button
                      variant="secondary"
                      block
                      size="md"
                      iconLeft="plus"
                      onPress={() => {
                        setAddingFrom({ before: lastAddedId });
                        router.push('/enderecos/editar');
                      }}
                    >
                      {addresses.length ? 'Adicionar outro endereço' : 'Adicionar endereço'}
                    </Button>
                    <Text variant="caption" color={colors.inkMuted}>
                      O profissional vê só o bairro até vocês combinarem o serviço.
                    </Text>
                  </View>
                )}
              </View>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <View style={{ gap: spacing[2] }}>
                <Text variant="titleSm" accessibilityRole="header">
                  {STEPS[2].title}
                </Text>
                <Text variant="body" color={colors.inkBody}>
                  {`Fotos do problema ajudam ${firstName(pro.name)} a entender o serviço e dar um preço mais certo. É opcional (até ${MAX_PHOTOS}).`}
                </Text>
              </View>

              {photos.length || adding ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                  <PhotoThumbs uris={photos.map((p) => p.uri)} size={76} onRemove={(i) => setPhotos((p) => p.filter((_, j) => j !== i))} />
                  {adding ? <ActivityIndicator color={colors.ink} accessibilityLabel="Preparando foto" /> : null}
                </View>
              ) : null}

              {photos.length < MAX_PHOTOS ? (
                <View style={{ flexDirection: 'row', gap: spacing[2] }}>
                  {Platform.OS !== 'web' ? (
                    <View style={{ flex: 1 }}>
                      <Button variant="secondary" block iconLeft="camera" disabled={adding || !!sending} onPress={() => addPhotos('camera')}>
                        Tirar foto
                      </Button>
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Button variant="secondary" block iconLeft="image" disabled={adding || !!sending} onPress={() => addPhotos('library')}>
                      Galeria
                    </Button>
                  </View>
                </View>
              ) : null}

              <View style={styles.summary}>
                <Text variant="overline" color={colors.inkMuted}>
                  RESUMO DO PEDIDO
                </Text>
                <Text variant="body" numberOfLines={3}>
                  {description.trim()}
                </Text>
                <View style={{ gap: 4 }}>
                  <View style={styles.summaryRow}>
                    <Icon name="calendar-clock" size={16} strokeWidth={2} color={colors.inkMuted} />
                    <Text variant="bodySm" color={colors.inkBody}>
                      {when}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Icon name="map-pin" size={16} strokeWidth={2} color={colors.inkMuted} />
                    <Text variant="bodySm" color={colors.inkBody} numberOfLines={1} style={{ flex: 1 }}>
                      {address ? addressLine(address) : 'Endereço a escolher'}
                    </Text>
                  </View>
                </View>
              </View>
            </>
          ) : null}
        </ScrollView>

        <StickyFooter>
          {step < 2 ? (
            <Button
              variant="primary"
              block
              iconRight="arrow-right"
              disabled={(step === 0 && !descriptionOk) || (step === 1 && !!session && !address)}
              onPress={() => setStep((s) => s + 1)}
            >
              Continuar
            </Button>
          ) : (
            <>
              <View style={styles.free}>
                <Icon name="shield-check" size={16} strokeWidth={2.25} color={colors.success} />
                <Text variant="caption" color={colors.inkMuted} style={{ flex: 1 }}>
                  Nada é cobrado agora. Vocês combinam o valor no chat.
                </Text>
              </View>
              <Button variant="primary" block iconRight="arrow-right" disabled={!!sending || adding || (!!session && !address)} onPress={send}>
                {sendLabel}
              </Button>
            </>
          )}
        </StickyFooter>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  progress: { paddingHorizontal: spacing[5], paddingBottom: spacing[2], gap: spacing[2] },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  content: { padding: spacing[5], paddingTop: spacing[3], gap: spacing[6] },
  pro: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.brandTint },
  proMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reply: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.surface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 34, paddingHorizontal: spacing[3], borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  box: { borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: spacing[1] },
  addr: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[3], borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line },
  addrOn: { borderColor: colors.focus, backgroundColor: colors.brandTint },
  radio: { width: 22, height: 22, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.inkMuted, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.ink },
  radioDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.ink },
  summary: { padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.surfaceMuted, gap: spacing[2] },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  free: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
});
