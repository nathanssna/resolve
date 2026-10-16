import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';
import type { ServiceAction, ServiceStage } from '@/utils/serviceStage';
import { Button } from './Button';
import { PhotoThumbs } from './Photos';
import { Text } from './Text';

const LABEL: Record<ServiceAction, string> = {
  done: 'Serviço feito',
  confirm: 'Sim, foi feito',
  deny: 'Não foi feito',
  reschedule: 'Remarcar',
  acceptReschedule: 'Aceitar nova data',
  declineReschedule: 'Recusar',
  withdrawReschedule: 'Desistir',
  dispute: 'Discordo, foi feito',
  askTeam: 'Pedir ajuda à equipe',
};

/** Cartão com o estado do serviço e as ações de quem vê. */
export function ServicePanel({
  stage,
  photoUris = [],
  busy,
  onAction,
  onOpenPhoto,
}: {
  stage: ServiceStage;
  /** URLs das fotos do serviço feito (vazio = carregando). */
  photoUris?: (string | undefined)[];
  busy?: boolean;
  onAction: (a: ServiceAction) => void;
  onOpenPhoto?: (index: number) => void;
}) {
  return (
    <View style={[styles.panel, stage.tone === 'wait' && { backgroundColor: colors.surfaceMuted }]}>
      <View style={{ gap: spacing[1] }}>
        <Text variant="labelLg">{stage.title}</Text>
        {stage.text ? (
          <Text variant="bodySm" color={colors.inkBody}>
            {stage.text}
          </Text>
        ) : null}
      </View>
      {stage.photos && photoUris.length ? <PhotoThumbs uris={photoUris} size={72} onOpen={onOpenPhoto} /> : null}
      {stage.primary ? (
        <Button variant={stage.tone === 'action' ? 'primary' : 'dark'} block disabled={busy} onPress={() => onAction(stage.primary!)}>
          {LABEL[stage.primary]}
        </Button>
      ) : null}
      {stage.secondary ? (
        <Button variant={stage.primary ? 'secondary' : 'link'} block={!!stage.primary} disabled={busy} onPress={() => onAction(stage.secondary!)}>
          {LABEL[stage.secondary]}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: spacing[4], borderRadius: radius.xl, backgroundColor: colors.brandTint, gap: spacing[3] },
});
