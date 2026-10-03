/**
 * Endereços do usuário logado (tabela `addresses`, só o dono vê).
 * O principal aparece no Início e vem escolhido no pedido de orçamento.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/state/auth';

type Row = Database['public']['Tables']['addresses']['Row'];

export type SavedAddress = {
  id: string;
  label: string;
  /** Rua e número: "Av. Paulista, 1000". */
  line: string;
  complement: string;
  area: string;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
};

export type AddressInput = Omit<SavedAddress, 'id' | 'isDefault'> & { isDefault?: boolean };

const COLS = 'id, label, line, complement, area, city, state, postal_code, is_default, created_at';

const toSaved = (r: Pick<Row, 'id' | 'label' | 'line' | 'complement' | 'area' | 'city' | 'state' | 'postal_code' | 'is_default'>): SavedAddress => ({
  id: r.id,
  label: r.label,
  line: r.line,
  complement: r.complement ?? '',
  area: r.area,
  city: r.city,
  state: r.state,
  postalCode: r.postal_code ?? '',
  isDefault: r.is_default,
});

const toRow = (a: AddressInput) => ({
  label: a.label.trim() || 'Casa',
  line: a.line.trim(),
  complement: a.complement.trim() || null,
  area: a.area.trim(),
  city: a.city.trim(),
  state: a.state.trim().toUpperCase().slice(0, 2),
  postal_code: a.postalCode.trim() || null,
});

/** Endereço completo numa linha: "Av. Paulista, 1000, Apto 12 · Bela Vista". */
export const addressLine = (a: Pick<SavedAddress, 'line' | 'complement' | 'area'>) =>
  [[a.line, a.complement].filter(Boolean).join(', '), a.area].filter(Boolean).join(' · ');

type AddressValue = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  addresses: SavedAddress[];
  /** O principal (ou o primeiro). */
  primary?: SavedAddress;
  /** Último endereço adicionado nesta sessão (o pedido escolhe ele ao voltar). */
  lastAddedId: string | null;
  refresh: () => void;
  add: (input: AddressInput) => Promise<SavedAddress>;
  update: (id: string, input: AddressInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setPrimary: (id: string) => Promise<void>;
};

const Ctx = createContext<AddressValue | null>(null);

export function AddressProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [data, setData] = useState<{ uid: string; list: SavedAddress[] } | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);

  const loaded = !!uid && data?.uid === uid;
  const addresses = useMemo(() => (loaded ? data.list : []), [loaded, data]);
  const status = !uid ? 'idle' : loaded ? 'ready' : failedFor === uid ? 'error' : 'loading';

  const load = useCallback(() => {
    if (!uid) return;
    supabase
      .from('addresses')
      .select(COLS)
      .order('is_default', { ascending: false })
      .order('created_at')
      .then(({ data: rows, error }) => {
        if (error) return setFailedFor(uid);
        setData({ uid, list: rows.map(toSaved) });
        setFailedFor(null);
      });
  }, [uid]);

  useEffect(() => {
    if (uid && !loaded) load();
  }, [uid, loaded, load]);

  /** Garante um único principal (o banco também exige). */
  const clearPrimary = useCallback(
    async (exceptId?: string) => {
      if (!uid) return;
      let q = supabase.from('addresses').update({ is_default: false }).eq('user_id', uid).eq('is_default', true);
      if (exceptId) q = q.neq('id', exceptId);
      const { error } = await q;
      if (error) throw error;
    },
    [uid],
  );

  const add = useCallback(
    async (input: AddressInput) => {
      // O primeiro endereço já vira o principal.
      const makePrimary = input.isDefault || addresses.length === 0;
      if (makePrimary) await clearPrimary();
      const { data: row, error } = await supabase
        .from('addresses')
        .insert({ ...toRow(input), is_default: makePrimary })
        .select(COLS)
        .single();
      if (error) throw error;
      const saved = toSaved(row);
      setLastAddedId(saved.id);
      load();
      return saved;
    },
    [addresses.length, clearPrimary, load],
  );

  const update = useCallback(
    async (id: string, input: AddressInput) => {
      if (input.isDefault) await clearPrimary(id);
      const { error } = await supabase
        .from('addresses')
        .update({ ...toRow(input), ...(input.isDefault ? { is_default: true } : {}) })
        .eq('id', id);
      if (error) throw error;
      load();
    },
    [clearPrimary, load],
  );

  const remove = useCallback(
    async (id: string) => {
      const wasPrimary = addresses.find((a) => a.id === id)?.isDefault;
      const { error } = await supabase.from('addresses').delete().eq('id', id);
      if (error) throw error;
      // Apagou o principal: o próximo vira principal.
      const next = addresses.find((a) => a.id !== id);
      if (wasPrimary && next) await supabase.from('addresses').update({ is_default: true }).eq('id', next.id);
      load();
    },
    [addresses, load],
  );

  const setPrimary = useCallback(
    async (id: string) => {
      await clearPrimary(id);
      const { error } = await supabase.from('addresses').update({ is_default: true }).eq('id', id);
      if (error) throw error;
      load();
    },
    [clearPrimary, load],
  );

  const value = useMemo<AddressValue>(
    () => ({
      status,
      addresses,
      primary: addresses.find((a) => a.isDefault) ?? addresses[0],
      lastAddedId,
      refresh: load,
      add,
      update,
      remove,
      setPrimary,
    }),
    [status, addresses, lastAddedId, load, add, update, remove, setPrimary],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAddresses() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAddresses precisa estar dentro de <AddressProvider>');
  return ctx;
}
