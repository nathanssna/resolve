/**
 * Contato escrito no chat antes de combinar (telefone, e-mail, @perfil, link de WhatsApp…).
 * O banco esconde de verdade (private.hide_contact, mesmas regras); aqui o app só avisa
 * enquanto a pessoa digita.
 */

export const HIDDEN_CONTACT = '[contato oculto]';

const LINK = /(https?:\/\/)?(www\.)?(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|t\.me|instagram\.com|facebook\.com)\/\S*/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const HANDLE = /(^|[^A-Za-z0-9_.])@[A-Za-z0-9._]{3,}/g;
// Sequência de algarismos com espaço, ponto, hífen ou parênteses no meio.
const NUMBER = /\+?\(?\d[\d\s.()-]{6,}\d/g;

/** Número que parece telefone, CPF ou chave: 8 algarismos ou mais, menos CEP e valor com milhar. */
function isContactNumber(m: string) {
  if ((m.match(/\d/g) ?? []).length < 8) return false;
  if (/^\d{5}-\d{3}$/.test(m)) return false;
  if (/^\d{1,3}(\.\d{3})+$/.test(m)) return false;
  return true;
}

export function hideContact(text: string) {
  return text
    .replace(LINK, HIDDEN_CONTACT)
    .replace(EMAIL, HIDDEN_CONTACT)
    .replace(HANDLE, `$1${HIDDEN_CONTACT}`)
    .replace(NUMBER, (m) => (isContactNumber(m) ? HIDDEN_CONTACT : m));
}

export function hasContact(text: string) {
  return hideContact(text) !== text;
}
