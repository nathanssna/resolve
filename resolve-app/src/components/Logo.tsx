/**
 * Logo Rezolveaê. O R é a logo principal; a palavra é o complemento.
 * Arte original (fundo transparente): assets/logo/RESOLVE (2).png e RESOLVE (3).png;
 * rezolveae-r.png e rezolveae-wordmark.png são as mesmas, só sem a margem.
 */
import { Image } from 'expo-image';
import { View } from 'react-native';

import { colors } from '@/theme/tokens';

type Tone = 'onWhite' | 'onYellow' | 'onDark';

const WORD_RATIO = 2133 / 345;
const MARK_RATIO = 797 / 1024;

/** O R, a logo principal. `height` em px. */
export function LogoMark({ height = 56 }: { height?: number }) {
  return (
    <Image
      source={require('../../assets/logo/rezolveae-r.png')}
      style={{ width: height * MARK_RATIO, height }}
      contentFit="contain"
      accessibilityLabel="Rezolveaê"
      accessible
    />
  );
}

type Props = { tone?: Tone; width?: number; /** Com o R na frente da palavra. */ mark?: boolean };

/** A palavra "Rezolveaê" (com o R na frente, se `mark`). `width`: largura da palavra. */
export function Logo({ tone = 'onWhite', width = 120, mark }: Props) {
  const word = (
    <Image
      source={require('../../assets/logo/rezolveae-wordmark.png')}
      style={{ width, height: width / WORD_RATIO }}
      contentFit="contain"
      // A arte é preta; sobre fundo escuro, branca.
      tintColor={tone === 'onDark' ? colors.onInk : undefined}
      accessibilityLabel={mark ? undefined : 'Rezolveaê'}
      accessible={!mark}
    />
  );
  if (!mark) return word;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: width * 0.06 }} accessible accessibilityLabel="Rezolveaê">
      <LogoMark height={(width / WORD_RATIO) * 1.9} />
      {word}
    </View>
  );
}
