import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authErrorMessage } from '@/lib/authErrors';
import { PermissionDeniedError, pickPhotos, REQUEST_PHOTO_SIDE, type LocalPhoto } from '@/lib/photos';
import { colors, radius, spacing } from '@/theme/tokens';
import { periodEnded, soonest, type Schedule } from '@/utils/schedule';
import { Button } from './Button';
import { PhotoThumbs } from './Photos';
import { pickerDays, SchedulePicker } from './SchedulePicker';
import { Text } from './Text';

/** Fotos do trabalho pronto (o banco aceita até 3). */
const MAX_DONE_PHOTOS = 3;

/** Folha que sobe de baixo, com título, texto e o conteúdo. */
function Sheet({ visible, onClose, title, text, children }: { visible: boolean; onClose: () => void; title: string; text: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
          <View style={styles.handle} />
          <Text variant="titleMd" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="bodySm" color={colors.inkMuted}>
            {text}
          </Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Remarcar: escolhe o novo dia e período; o outro precisa aceitar. */
export function RescheduleSheet({
  visible,
  other,
  current,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  /** Primeiro nome de quem vai responder. */
  other: string;
  /** A data combinada (vem escolhida, se ainda der). */
  current?: Schedule;
  onClose: () => void;
  onSubmit: (schedule: Schedule) => Promise<void>;
}) {
  const fallback = current && pickerDays().some((d) => d.day === current.day) && !periodEnded(current) ? current : soonest();
  const [picked, setPicked] = useState<Schedule | null>(null);
  const schedule = picked ?? fallback;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const same = !!current && current.day === schedule.day && current.period === schedule.period;

  const submit = async () => {
    if (sending || same) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit(schedule);
      setPicked(null);
      onClose();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Remarcar" text={`Escolha o novo dia e período. ${other} precisa aceitar a nova data.`}>
      <SchedulePicker value={schedule} onChange={setPicked} />
      {error ? (
        <Text variant="bodySm" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button variant="primary" block iconLeft="calendar-clock" disabled={sending || same} onPress={submit}>
        {sending ? 'Enviando…' : 'Pedir nova data'}
      </Button>
      <Button variant="link" onPress={onClose} style={{ alignSelf: 'center' }}>
        Voltar
      </Button>
    </Sheet>
  );
}

/** Serviço feito: o profissional pode anexar fotos do trabalho pronto; o cliente confirma. */
export function DoneSheet({
  visible,
  client,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  /** Primeiro nome do cliente. */
  client: string;
  onClose: () => void;
  onSubmit: (photos: LocalPhoto[], onProgress: (sent: number, total: number) => void) => Promise<void>;
}) {
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sending = progress !== null;

  const add = async (source: 'library' | 'camera') => {
    if (adding || photos.length >= MAX_DONE_PHOTOS) return;
    setAdding(true);
    setError(null);
    try {
      const picked = await pickPhotos({ source, limit: MAX_DONE_PHOTOS - photos.length, maxSide: REQUEST_PHOTO_SIDE });
      setPhotos((p) => [...p, ...picked].slice(0, MAX_DONE_PHOTOS));
    } catch (e) {
      setError(
        e instanceof PermissionDeniedError
          ? 'Permita o acesso à câmera nas configurações do celular para tirar fotos.'
          : 'Não foi possível usar essa foto. Tente outra.',
      );
    } finally {
      setAdding(false);
    }
  };

  const submit = async () => {
    if (sending) return;
    setError(null);
    setProgress('Enviando…');
    try {
      await onSubmit(photos, (sent, total) => setProgress(total ? `Enviando fotos (${sent} de ${total})…` : 'Enviando…'));
      setPhotos([]);
      onClose();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Serviço feito"
      text={`${client} vai confirmar se foi feito. Com foto do trabalho pronto, se ${client} não responder em 7 dias, o serviço é concluído sozinho.`}
    >
      {photos.length ? <PhotoThumbs uris={photos.map((p) => p.uri)} size={76} onRemove={(i) => setPhotos((p) => p.filter((_, j) => j !== i))} /> : null}
      {photos.length < MAX_DONE_PHOTOS ? (
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          {Platform.OS !== 'web' ? (
            <View style={{ flex: 1 }}>
              <Button variant="secondary" block iconLeft="camera" disabled={adding || sending} onPress={() => add('camera')}>
                Tirar foto
              </Button>
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button variant="secondary" block iconLeft="image" disabled={adding || sending} onPress={() => add('library')}>
              Galeria
            </Button>
          </View>
        </View>
      ) : null}
      <Text variant="caption" color={colors.inkMuted}>
        {`Fotos do trabalho pronto (até ${MAX_DONE_PHOTOS}). Só ${client} e a equipe da Rezolveaê veem.`}
      </Text>
      {error ? (
        <Text variant="bodySm" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Button variant="primary" block iconLeft="check" disabled={sending || adding} onPress={submit}>
        {progress ?? (photos.length ? 'Marcar como feito' : 'Marcar como feito sem foto')}
      </Button>
      <Button variant="link" onPress={onClose} style={{ alignSelf: 'center' }}>
        Voltar
      </Button>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,18,19,0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: spacing[5],
    gap: spacing[4],
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceStrong },
});
