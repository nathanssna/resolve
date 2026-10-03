/**
 * Busca de endereço pelo CEP (ViaCEP: público, gratuito, sem chave).
 * O CEP digitado é enviado ao viacep.com.br.
 */
export type CepResult = { street: string; area: string; city: string; state: string };

/** "01310100" → "01310-100" (aceita o que estiver digitado pela metade). */
export function formatCep(text: string) {
  const d = text.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** null = CEP não encontrado. Lança erro se não houver conexão. */
export async function lookupCep(cep: string): Promise<CepResult | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!res.ok) return null;
  const data = (await res.json()) as { erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
  if (data.erro) return null;
  return { street: data.logradouro ?? '', area: data.bairro ?? '', city: data.localidade ?? '', state: data.uf ?? '' };
}
