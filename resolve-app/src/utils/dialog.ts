import { Alert, Platform } from 'react-native';

/** Aviso simples (no web usa o alert do navegador). */
export function notify(msg: string) {
  if (Platform.OS === 'web') window.alert(msg);
  else Alert.alert('Resolve', msg);
}

/** Pede confirmação antes de uma ação destrutiva. */
export function confirm(msg: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(msg)) onYes();
  } else {
    Alert.alert('Resolve', msg, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Confirmar', style: 'destructive', onPress: onYes },
    ]);
  }
}
