import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { colors, fonts, radius, shadows, spacing } from '@/theme/tokens';
import { formatBRL, formatTime } from '@/utils/format';
import { Icon, type IconName } from './Icon';
import { PhotoThumbs } from './Photos';
import { Avatar } from './ProfessionalCard';
import { Badge } from './Surfaces';
import { Text } from './Text';

const webNoOutline = { outlineStyle: 'none' } as object;

/** Balão de mensagem de texto. */
export function Bubble({ mine, text, at }: { mine: boolean; text: string; at: number }) {
  return (
    <View style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text variant="body" color={mine ? colors.onBrand : colors.ink}>
          {text}
        </Text>
        <Text variant="caption" color={mine ? colors.onBrand : colors.inkMuted} style={styles.time}>
          {formatTime(at)}
        </Text>
      </View>
    </View>
  );
}

function CardRow({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.cardRow}>
      <Icon name={icon} size={16} strokeWidth={2.25} />
      <Text variant="bodySm" color={colors.inkBody} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/** Pedido enviado pelo cliente — abre a conversa. */
export function RequestCard({
  serviceTitle,
  description,
  when,
  address,
  at,
  photos = [],
  onOpenPhoto,
  mine = true,
  addressHint,
}: {
  /** Nota embaixo do endereço (ex.: "Endereço completo depois de combinar"). */
  addressHint?: string;
  /** true: quem vê é o cliente que fez o pedido (card à direita). */
  mine?: boolean;
  serviceTitle: string;
  description: string;
  when: string;
  address: string;
  at: number;
  /** URLs das fotos (vazio = carregando). */
  photos?: (string | undefined)[];
  onOpenPhoto?: (index: number) => void;
}) {
  return (
    <View style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
      <View style={[styles.card, styles.requestCard, !mine && styles.requestTheirs]}>
        <View style={styles.cardHead}>
          <Badge tone="ink" icon="clipboard-list">
            PEDIDO
          </Badge>
          <Text variant="caption" color={colors.inkMuted}>
            {formatTime(at)}
          </Text>
        </View>
        <Text variant="labelLg">{serviceTitle}</Text>
        <Text variant="body" color={colors.inkBody}>
          {description}
        </Text>
        {photos.length ? <PhotoThumbs uris={photos} size={64} onOpen={onOpenPhoto} /> : null}
        <View style={{ gap: 6 }}>
          <CardRow icon="calendar-clock" text={when} />
          <CardRow icon="map-pin" text={address} />
          {addressHint ? (
            <Text variant="caption" color={colors.inkMuted} style={{ paddingLeft: 24 }}>
              {addressHint}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** Proposta enviada pelo profissional: valor + quando, com Aceitar/Recusar. */
export function ProposalCard({
  serviceTitle,
  amount,
  when,
  note,
  status,
  at,
  onAccept,
  onDecline,
  onCounter,
  mine = false,
}: {
  /** true: quem vê é o profissional que enviou (sem Aceitar/Recusar). */
  mine?: boolean;
  /** Para qual pedido (quando a conversa tem mais de um). */
  serviceTitle?: string;
  amount: number;
  when: string;
  note?: string;
  status: 'pending' | 'accepted' | 'declined';
  at: number;
  onAccept?: () => void;
  onDecline?: () => void;
  onCounter?: () => void;
}) {
  return (
    <View style={[styles.bubbleRow, mine && { justifyContent: 'flex-end' }]}>
      <View style={[styles.card, styles.proposal, mine && styles.proposalMine, status === 'declined' && { opacity: 0.6 }]}>
        <View style={styles.cardHead}>
          <Badge tone={status === 'accepted' ? 'success' : status === 'declined' ? 'muted' : 'brand'} icon={status === 'accepted' ? 'check' : 'receipt'}>
            {status === 'accepted' ? 'ACEITA' : status === 'declined' ? 'RECUSADA' : 'PROPOSTA'}
          </Badge>
          <Text variant="caption" color={colors.inkMuted}>
            {formatTime(at)}
          </Text>
        </View>
        {serviceTitle ? <Text variant="label">{serviceTitle}</Text> : null}
        <Text style={[styles.amount, status === 'declined' && { textDecorationLine: 'line-through' }]}>{formatBRL(amount)}</Text>
        <View style={{ gap: 6 }}>
          <CardRow icon="calendar-clock" text={when} />
          {note ? <CardRow icon="info" text={note} /> : null}
        </View>
        {status === 'pending' && mine ? (
          <View style={styles.waiting}>
            <Icon name="clock" size={16} strokeWidth={2.25} color={colors.inkMuted} />
            <Text variant="bodySm" color={colors.inkMuted}>
              Aguardando resposta do cliente
            </Text>
          </View>
        ) : null}
        {status === 'pending' && !mine ? (
          <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
            <Pressable accessibilityRole="button" onPress={onAccept} style={({ pressed }) => [styles.accept, pressed && { opacity: 0.88 }]}>
              <Icon name="check" size={18} strokeWidth={2.5} color={colors.onBrand} />
              <Text variant="labelLg">Aceitar proposta</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <Pressable accessibilityRole="button" onPress={onCounter} style={({ pressed }) => [styles.ghost, pressed && { backgroundColor: colors.surfaceStrong }]}>
                <Text variant="label">Negociar</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={onDecline} style={({ pressed }) => [styles.ghost, pressed && { backgroundColor: colors.surfaceStrong }]}>
                <Text variant="label">Recusar</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Aviso do sistema no meio da conversa ("Serviço combinado…"). */
export function SystemNote({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'success' }) {
  return (
    <View style={styles.systemRow}>
      <View style={[styles.system, tone === 'success' && { backgroundColor: colors.successTint }]}>
        {tone === 'success' ? <Icon name="badge-check" size={14} strokeWidth={2.25} color={colors.success} /> : null}
        <Text variant="caption" color={tone === 'success' ? colors.success : colors.inkMuted} style={{ fontFamily: fonts.semibold }}>
          {text}
        </Text>
      </View>
    </View>
  );
}

/** "digitando…" com três pontos animados. */
export function TypingBubble() {
  const v = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const loops = v.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(a, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(a, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.delay((2 - i) * 150),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [v]);
  return (
    <View style={styles.bubbleRow} accessibilityLabel="digitando">
      <View style={[styles.bubble, styles.bubbleTheirs, styles.typing]}>
        {v.map((a, i) => (
          <Animated.View key={i} style={[styles.dot, { opacity: a }]} />
        ))}
      </View>
    </View>
  );
}

/** Campo de mensagem com respostas rápidas. */
export function Composer({
  onSend,
  onTyping,
  quickReplies = [],
  prefill,
}: {
  onSend: (text: string) => void;
  /** Chamado enquanto a pessoa digita (para o "digitando…" do outro lado). */
  onTyping?: () => void;
  quickReplies?: string[];
  /** Quando muda, preenche o campo e foca (ex.: "Negociar"). */
  prefill?: { text: string; key: number };
}) {
  const [text, setText] = useState('');
  const ref = useRef<TextInput>(null);
  useEffect(() => {
    if (prefill) {
      setText(prefill.text);
      ref.current?.focus();
    }
  }, [prefill]);
  const send = (t = text) => {
    const v = t.trim();
    if (!v) return;
    onSend(v);
    setText('');
  };
  return (
    <View style={styles.composerWrap}>
      {quickReplies.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.quick}>
          {quickReplies.map((q) => (
            <Pressable key={q} accessibilityRole="button" onPress={() => send(q)} style={({ pressed }) => [styles.quickChip, pressed && { backgroundColor: colors.surfaceStrong }]}>
              <Text variant="caption" style={{ fontFamily: fonts.semibold }}>
                {q}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.composer}>
        <TextInput
          ref={ref}
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (t.trim()) onTyping?.();
          }}
          placeholder="Escreva uma mensagem"
          placeholderTextColor={colors.inkMuted}
          accessibilityLabel="Escreva uma mensagem"
          onSubmitEditing={() => send()}
          returnKeyType="send"
          style={[styles.composerInput, webNoOutline]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enviar"
          onPress={() => send()}
          disabled={!text.trim()}
          style={({ pressed }) => [styles.send, !text.trim() && { backgroundColor: colors.surfaceStrong }, pressed && { opacity: 0.85 }]}
        >
          <Icon name="arrow-right" size={22} strokeWidth={2.5} color={text.trim() ? colors.onBrand : colors.inkMuted} />
        </Pressable>
      </View>
    </View>
  );
}

/** Linha da lista de conversas. */
export function ConversationRow({
  name,
  service,
  preview,
  time,
  unread,
  typing,
  done,
  onPress,
  avatarUrl,
}: {
  avatarUrl?: string;
  name: string;
  service: string;
  preview: string;
  time: string;
  unread: number;
  typing?: boolean;
  done?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.convRow, pressed && { backgroundColor: colors.surfaceMuted }]}>
      <View>
        <Avatar size={52} uri={avatarUrl} />
        {done ? (
          <View style={styles.convCheck}>
            <Icon name="check" size={11} strokeWidth={3} color={colors.onInk} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.convTop}>
          <Text variant="labelLg" numberOfLines={1} style={{ flex: 1 }}>
            {name}
          </Text>
          <Text variant="caption" color={unread ? colors.ink : colors.inkMuted}>
            {time}
          </Text>
        </View>
        <Text variant="caption" color={colors.inkMuted}>
          {service}
        </Text>
        <View style={styles.convTop}>
          <Text variant="bodySm" color={typing ? colors.success : unread ? colors.ink : colors.inkMuted} numberOfLines={1} style={[{ flex: 1 }, unread ? { fontFamily: fonts.semibold } : null]}>
            {typing ? 'digitando…' : preview}
          </Text>
          {unread ? (
            <View style={styles.unread}>
              <Text variant="overline" style={{ fontSize: 11 }}>
                {unread}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bubbleRow: { flexDirection: 'row', paddingHorizontal: spacing[4] },
  bubble: { maxWidth: '80%', paddingHorizontal: spacing[4], paddingTop: 10, paddingBottom: 6, borderRadius: 20, gap: 2 },
  bubbleMine: { backgroundColor: colors.brand, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: colors.surfaceMuted, borderBottomLeftRadius: 6 },
  time: { alignSelf: 'flex-end', fontSize: 10, lineHeight: 12, opacity: 0.8 },
  card: { width: '84%', padding: spacing[4], borderRadius: radius.xl, gap: spacing[3] },
  requestCard: { backgroundColor: colors.brandTint, borderBottomRightRadius: 6 },
  requestTheirs: { borderBottomRightRadius: radius.xl, borderBottomLeftRadius: 6 },
  proposal: { backgroundColor: colors.surface, borderBottomLeftRadius: 6, boxShadow: shadows.card, borderWidth: 1, borderColor: colors.line },
  proposalMine: { borderBottomLeftRadius: radius.xl, borderBottomRightRadius: 6 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[1] },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  amount: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 34, letterSpacing: -0.6, color: colors.ink },
  accept: {
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: { flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  systemRow: { alignItems: 'center', paddingHorizontal: spacing[6] },
  system: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  typing: { flexDirection: 'row', gap: 5, paddingVertical: 14, paddingBottom: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.inkMuted },
  composerWrap: { gap: spacing[2] },
  quick: { flexDirection: 'row', gap: spacing[2] },
  quickChip: { height: 34, paddingHorizontal: spacing[3], borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, justifyContent: 'center' },
  composer: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  composerInput: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing[5],
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  send: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  convRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], paddingHorizontal: spacing[5] },
  convTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  convCheck: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unread: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
});
