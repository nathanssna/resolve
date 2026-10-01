import { Text as RNText, type TextProps } from 'react-native';

import { colors, type as typeStyles, type TypeVariant } from '@/theme/tokens';

type Props = TextProps & {
  variant?: TypeVariant;
  color?: string;
};

/** Texto com os estilos do design system (`display`, `titleLg`, `body`, `caption`…). */
export function Text({ variant = 'body', color = colors.ink, style, ...rest }: Props) {
  return <RNText {...rest} style={[typeStyles[variant], { color }, style]} />;
}
