import { memo } from 'react';
import { SvgXml } from 'react-native-svg';

import { colors } from '@/theme/tokens';
import { iconPaths, type IconName } from './iconPaths';

export type { IconName };

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  /** Traço padrão do sistema: 2 (arredondado). */
  strokeWidth?: number;
  /** Cor de preenchimento — use só na estrela, no pin e na aba ativa. */
  fill?: string;
  /** Estilo duotone: formas fechadas preenchidas de amarelo, traço `ink`. Use nos blocos de serviço. */
  duotone?: boolean;
  /** Rótulo para leitores de tela quando o ícone está sozinho e tem significado. */
  label?: string;
};

function IconBase({ name, size = 24, color = colors.ink, strokeWidth = 2, fill = 'none', duotone, label }: Props) {
  if (duotone) fill = colors.brand;
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name]}</svg>`;
  return (
    <SvgXml
      xml={xml}
      width={size}
      height={size}
      accessible={!!label}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    />
  );
}

export const Icon = memo(IconBase);
