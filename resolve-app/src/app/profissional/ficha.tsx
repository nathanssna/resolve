import { router, Stack, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, CatalogFallback, Field, goBack, Icon, OptionChip, ProgressBar, StickyFooter, Tag, Text, TopBar } from '@/components';
import { authErrorMessage } from '@/lib/authErrors';
import { formatCep, lookupCep } from '@/lib/cep';
import { currentPlace, GENERIC_PLACE, geocodeAddress, LocationDeniedError, roundCoord, type Coords } from '@/lib/geo';
import { registerPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/state/auth';
import { useCatalog } from '@/state/catalog';
import { colors, spacing } from '@/theme/tokens';
import { notify } from '@/utils/dialog';

const REPLY_OPTIONS = [5, 15, 30, 60];
const RADIUS_OPTIONS = [5, 10, 20, 30];
const MAX_TAGS = 6;

const STEPS = [
  { title: 'O que você faz?', short: 'Serviços', hint: 'Escolha os serviços e diga sua profissão. É o que faz você aparecer para os clientes.' },
  { title: 'Sobre você', short: 'Sobre você', hint: 'Opcional, mas ajuda o cliente a escolher você.' },
  { title: 'Atendimento', short: 'Atendimento', hint: 'Onde você atende e como os clientes falam com você.' },
] as const;

const toTags = (text: string) =>
  [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, MAX_TAGS).map((t) => t.slice(0, 30));

/**
 * Ficha do profissional em 3 passos: o que faz → sobre você → atendimento.
 * `primeira=1`: logo depois do cadastro (sem sair antes de salvar; ao salvar, vai para o Início).
 * Editando (pelo Perfil/painel): dá para salvar em qualquer passo.
 */
export default function Ficha() {
  const { primeira } = useLocalSearchParams<{ primeira?: string }>();
  const first = primeira === '1';
  const { session, profile, refreshProfile } = useAuth();
  const { services, status: catalogStatus, refresh: refreshCatalog } = useCatalog();
  const uid = session?.user.id;
  const focused = useIsFocused();

  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [initialServices, setInitialServices] = useState<string[]>([]);
  const [roleTitle, setRoleTitle] = useState('');
  const [bio, setBio] = useState('');
  const [years, setYears] = useState('');
  const [reply, setReply] = useState(30);
  const [tags, setTags] = useState('');
  const [phone, setPhone] = useState('');
  // Área: o bairro aparece para o cliente; as coordenadas, não (o banco não as devolve).
  const [area, setArea] = useState<{ label: string; coords?: Coords } | null>(null);
  const [radius, setRadius] = useState(10);
  const [areaCep, setAreaCep] = useState('');
  const [locating, setLocating] = useState(false);
  const [areaMsg, setAreaMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    Promise.all([
      supabase
        .from('professionals')
        .select('role_title, bio, years_experience, reply_minutes, tags, base_area, service_radius_km, professional_services(service_id)')
        .eq('id', uid)
        .maybeSingle(),
      supabase.rpc('get_my_profile'),
    ]).then(([pro, me]) => {
      if (!alive) return;
      if (pro.data) {
        const ids = pro.data.professional_services.map((s) => s.service_id);
        setServiceIds(ids);
        setInitialServices(ids);
        setRoleTitle(pro.data.role_title);
        setBio(pro.data.bio);
        setYears(pro.data.years_experience ? String(pro.data.years_experience) : '');
        setReply(pro.data.reply_minutes);
        setTags(pro.data.tags.join(', '));
        setArea(pro.data.base_area ? { label: pro.data.base_area } : null);
        setRadius(pro.data.service_radius_km);
      }
      setPhone(me.data?.phone ?? '');
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [uid]);

  // Botão "voltar" do Android volta um passo (no 1º passo do primeiro acesso, não sai).
  useEffect(() => {
    if (!focused || (step === 0 && !first)) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 0) setStep((s) => s - 1);
      return true;
    });
    return () => sub.remove();
  }, [focused, step, first]);

  const phoneDigits = phone.replace(/\D/g, '');
  const phoneOk = phoneDigits.length === 0 || (phoneDigits.length >= 10 && phoneDigits.length <= 13);
  const yearsNum = years.trim() ? Number(years) : 0;
  const yearsOk = Number.isInteger(yearsNum) && yearsNum >= 0 && yearsNum <= 80;
  const step1Ok = serviceIds.length > 0 && roleTitle.trim().length >= 2;
  const stepOk = [step1Ok, yearsOk, phoneOk][step];
  const allOk = step1Ok && yearsOk && phoneOk;
  const canSave = !!uid && loaded && allOk && !saving;

  const pickMyLocation = async () => {
    if (locating) return;
    setLocating(true);
    setAreaMsg(null);
    try {
      const place = await currentPlace();
      setArea({ label: place.label, coords: place });
    } catch (e) {
      setAreaMsg(e instanceof LocationDeniedError ? 'Sem permissão de localização. Use o CEP abaixo.' : 'Não foi possível pegar sua localização. Use o CEP abaixo.');
    } finally {
      setLocating(false);
    }
  };

  // CEP de onde sai → bairro e coordenadas (sem número: só precisamos da região).
  const searchCep = async (text: string) => {
    const cep = formatCep(text);
    setAreaCep(cep);
    if (cep.replace(/\D/g, '').length !== 8) return;
    setLocating(true);
    setAreaMsg(null);
    try {
      const found = await lookupCep(cep);
      if (!found) return setAreaMsg('CEP não encontrado.');
      const coords = await geocodeAddress({ line: found.street, area: found.area, city: found.city, state: found.state, postalCode: cep });
      if (!coords) return setAreaMsg('Não foi possível localizar esse CEP. Tente a localização atual.');
      setArea({ label: [found.area, found.city].filter(Boolean).join(', '), coords });
    } catch {
      setAreaMsg('Sem conexão para buscar o CEP.');
    } finally {
      setLocating(false);
    }
  };

  const toggleService = (id: string) => setServiceIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const back = () => (step > 0 ? setStep(step - 1) : goBack());

  const save = async () => {
    if (!canSave || !uid) return;
    setSaving(true);
    try {
      const fields = {
        role_title: roleTitle.trim(),
        bio: bio.trim(),
        years_experience: yearsNum,
        reply_minutes: reply,
        tags: toTags(tags),
        base_area: area?.label ?? '',
        service_radius_km: radius,
        // Só manda coordenadas novas (as salvas não voltam do banco).
        ...(area?.coords ? { latitude: roundCoord(area.coords.latitude), longitude: roundCoord(area.coords.longitude) } : {}),
      };
      // A ficha nasce no cadastro; update (não upsert: o usuário não pode alterar o id).
      const { data: updated, error } = await supabase.from('professionals').update(fields).eq('id', uid).select('id');
      if (error) throw error;
      if (!updated.length) {
        const { error: insertError } = await supabase.from('professionals').insert({ id: uid, ...fields });
        if (insertError) throw insertError;
      }

      const added = serviceIds.filter((s) => !initialServices.includes(s));
      const removed = initialServices.filter((s) => !serviceIds.includes(s));
      if (added.length) {
        const { error: e } = await supabase.from('professional_services').insert(added.map((service_id) => ({ professional_id: uid, service_id })));
        if (e) throw e;
      }
      if (removed.length) {
        const { error: e } = await supabase.from('professional_services').delete().eq('professional_id', uid).in('service_id', removed);
        if (e) throw e;
      }
      setInitialServices(serviceIds);

      if (phoneDigits !== (profile?.phone ?? '').replace(/\D/g, '')) {
        // Mesmo formato da tela de telefone: +55 e só dígitos.
        const normalized = phoneDigits ? (phoneDigits.startsWith('55') && phoneDigits.length > 11 ? `+${phoneDigits}` : `+55${phoneDigits}`) : null;
        const { error: e } = await supabase.from('profiles').update({ phone: normalized }).eq('id', uid);
        if (e) throw e;
        await refreshProfile();
      }

      // Aparece (ou some) na lista dos clientes na hora.
      await refreshCatalog();
      // Bom momento para pedir permissão: os pedidos chegam por notificação.
      registerPush({ ask: true });

      if (first) {
        if (router.canDismiss()) router.dismissAll();
        router.navigate('/inicio');
      } else {
        router.back();
      }
    } catch (e) {
      notify(`Não foi possível salvar a ficha. ${authErrorMessage(e)}`);
      setSaving(false);
    }
  };

  const suggestedTitle = services.find((s) => s.id === serviceIds[0])?.title;
  const ready = loaded && catalogStatus === 'ready';
  const last = step === STEPS.length - 1;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* No primeiro acesso não dá para sair sem salvar (é o que faz o profissional aparecer). */}
      <Stack.Screen options={{ gestureEnabled: !first && step === 0 }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TopBar title="Sua ficha profissional" onBack={first && step === 0 ? false : back} />

        <View
          style={styles.progress}
          accessibilityRole="progressbar"
          accessibilityLabel={`Passo ${step + 1} de ${STEPS.length}: ${STEPS[step].short}`}
        >
          <View style={styles.progressHead}>
            <Text variant="overline" color={colors.inkMuted}>
              {`PASSO ${step + 1} DE ${STEPS.length}`}
            </Text>
            <Text variant="caption" color={colors.inkMuted}>
              {STEPS[step].short}
            </Text>
          </View>
          <ProgressBar value={(step + 1) / STEPS.length} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={{ gap: spacing[2] }}>
            <Text variant="titleMd" accessibilityRole="header">
              {STEPS[step].title}
            </Text>
            <Text variant="body" color={colors.inkBody}>
              {first && step === 0 ? 'Falta pouco! ' : ''}
              {STEPS[step].hint}
            </Text>
          </View>

          {!ready ? <CatalogFallback status={catalogStatus === 'error' ? 'error' : 'loading'} onRetry={refreshCatalog} /> : null}

          {ready && step === 0 ? (
            <>
              <View style={{ gap: spacing[3] }}>
                <Text variant="label">Serviços que você faz</Text>
                <View style={styles.chips}>
                  {services.map((s) => (
                    <OptionChip key={s.id} label={s.short} active={serviceIds.includes(s.id)} onPress={() => toggleService(s.id)} />
                  ))}
                </View>
                {serviceIds.length === 0 ? (
                  <Text variant="caption" color={colors.inkMuted}>
                    Escolha pelo menos um.
                  </Text>
                ) : null}
              </View>
              <Field
                label="Sua profissão"
                placeholder={suggestedTitle ? `Ex.: ${suggestedTitle}` : 'Ex.: Encanador'}
                value={roleTitle}
                onChangeText={setRoleTitle}
                maxLength={80}
                autoCapitalize="sentences"
              />
            </>
          ) : null}

          {ready && step === 1 ? (
            <>
              <Field
                label="Sobre você (opcional)"
                placeholder="Conte sua experiência, como trabalha, o que leva…"
                value={bio}
                onChangeText={setBio}
                multiline
                maxLength={2000}
              />
              <Field
                label="Anos de experiência"
                placeholder="Ex.: 5"
                value={years}
                onChangeText={(t) => setYears(t.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad"
                inputMode="numeric"
              />
              <View style={{ gap: spacing[2] }}>
                <Field
                  label="Especialidades (opcional)"
                  placeholder="Ex.: Vazamentos, Chuveiros, Caixa d’água"
                  value={tags}
                  onChangeText={setTags}
                  autoCapitalize="sentences"
                />
                <Text variant="caption" color={colors.inkMuted}>
                  Separe por vírgula (até {MAX_TAGS}).
                </Text>
                {toTags(tags).length ? (
                  <View style={styles.chips}>
                    {toTags(tags).map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </View>
                ) : null}
              </View>
            </>
          ) : null}

          {ready && step === 2 ? (
            <>
              <View style={{ gap: spacing[3] }}>
                <Text variant="label">Onde você atende</Text>
                {area ? (
                  <View style={styles.areaRow}>
                    <Icon name="map-pin" size={20} />
                    <Text variant="labelLg" style={{ flex: 1 }} numberOfLines={1}>
                      {area.label}
                    </Text>
                    <Pressable accessibilityRole="button" onPress={() => setArea(null)} hitSlop={8}>
                      <Text variant="label" color={colors.inkBody} style={{ textDecorationLine: 'underline' }}>
                        Trocar
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Button variant="secondary" block iconLeft="navigation" disabled={locating} onPress={pickMyLocation}>
                      Usar minha localização atual
                    </Button>
                    <Field
                      label="Ou o CEP de onde você sai"
                      placeholder="00000-000"
                      value={areaCep}
                      onChangeText={searchCep}
                      keyboardType="number-pad"
                      inputMode="numeric"
                      maxLength={9}
                    />
                    {locating ? <ActivityIndicator color={colors.ink} style={{ alignSelf: 'flex-start' }} /> : null}
                  </>
                )}
                {areaMsg ? (
                  <Text variant="caption" color={colors.danger} accessibilityLiveRegion="polite">
                    {areaMsg}
                  </Text>
                ) : null}
                <Text variant="label">Até que distância</Text>
                <View style={{ flexDirection: 'row', gap: spacing[2] }}>
                  {RADIUS_OPTIONS.map((km) => (
                    <View key={km} style={{ flex: 1 }}>
                      <OptionChip label={`${km} km`} active={radius === km} onPress={() => setRadius(km)} />
                    </View>
                  ))}
                </View>
                <Text variant="caption" color={colors.inkMuted}>
                  {area
                    ? `Você aparece para clientes até ${radius} km ${area.label === GENERIC_PLACE ? 'de onde você está' : `de ${area.label.split(',')[0]}`}. Eles veem só o bairro, nunca o seu endereço.`
                    : 'Sem área, você aparece no fim da lista, como "área não informada".'}
                </Text>
              </View>

              <View style={{ gap: spacing[3] }}>
                <Text variant="label">Costuma responder em</Text>
                <View style={{ flexDirection: 'row', gap: spacing[2] }}>
                  {REPLY_OPTIONS.map((m) => (
                    <View key={m} style={{ flex: 1 }}>
                      <OptionChip label={m === 60 ? '1 h' : `${m} min`} active={reply === m} onPress={() => setReply(m)} />
                    </View>
                  ))}
                </View>
              </View>
              <View style={{ gap: spacing[2] }}>
                <Field
                  label="Telefone (opcional)"
                  placeholder="(11) 91234-5678"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  inputMode="tel"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  maxLength={20}
                />
                <Text variant="caption" color={phoneOk ? colors.inkMuted : colors.danger}>
                  {phoneOk ? 'Só aparece para o cliente depois que vocês combinarem um serviço.' : 'Confira o número, com DDD.'}
                </Text>
              </View>
            </>
          ) : null}
        </ScrollView>

        <StickyFooter>
          {last ? (
            <Button variant="primary" block iconLeft="check" disabled={!canSave} onPress={save}>
              {saving ? 'Salvando…' : first ? 'Salvar e começar' : 'Salvar ficha'}
            </Button>
          ) : (
            <>
              <Button variant="primary" block iconRight="arrow-right" disabled={!ready || !stepOk} onPress={() => setStep(step + 1)}>
                Continuar
              </Button>
              {/* Editando: não precisa passar por todos os passos para salvar. */}
              {!first ? (
                <Button variant="link" disabled={!canSave} onPress={save} style={{ alignSelf: 'center' }}>
                  {saving ? 'Salvando…' : 'Salvar alterações'}
                </Button>
              ) : null}
            </>
          )}
        </StickyFooter>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderRadius: 14, backgroundColor: colors.surfaceMuted },
  safe: { flex: 1, backgroundColor: colors.surface },
  progress: { paddingHorizontal: spacing[5], paddingBottom: spacing[2], gap: spacing[2] },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  content: { padding: spacing[5], paddingTop: spacing[3], gap: spacing[6] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
});
