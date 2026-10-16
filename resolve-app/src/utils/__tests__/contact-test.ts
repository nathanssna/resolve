import { hasContact, hideContact } from '../contact';
// Os mesmos exemplos conferem private.hide_contact no banco (tests/db/contact.test.js).
import cases from './contact-cases.json';

describe('hideContact', () => {
  it.each(cases.hide)('%j', (input, expected) => {
    expect(hideContact(input)).toBe(expected);
  });

  it.each(cases.keep)('mantém: %j', (input) => {
    expect(hasContact(input)).toBe(false);
  });
});
