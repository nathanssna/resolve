import { useState } from 'react';

import { Segmented } from '@/components';
import { AdminPage, Empty, QueueCard, useQueue } from '@/screens/admin/shared';

/** Tudo o que espera a equipe: denúncias (as mais antigas primeiro), pedidos de selo e mensagens do canal oficial. */
export default function AdminPendencias() {
  const queue = useQueue();
  const [kind, setKind] = useState<'tudo' | 'denuncia' | 'selo' | 'atendimento'>('tudo');
  const items = queue.items.filter((i) => kind === 'tudo' || i.kind === kind);
  const count = (k: 'denuncia' | 'selo' | 'atendimento') => queue.items.filter((i) => i.kind === k).length;

  return (
    <AdminPage title="Para resolver" loading={queue.loading && !queue.failed} failed={queue.failed} onRetry={queue.reload}>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { id: 'tudo', label: `Tudo (${queue.items.length})` },
          { id: 'denuncia', label: `Denúncias (${count('denuncia')})` },
          { id: 'selo', label: `Selos (${count('selo')})` },
          { id: 'atendimento', label: `Mensagens (${count('atendimento')})` },
        ]}
      />
      {items.map((item) => (
        <QueueCard key={item.key} item={item} />
      ))}
      {!items.length ? <Empty text="Nada esperando decisão." /> : null}
    </AdminPage>
  );
}
