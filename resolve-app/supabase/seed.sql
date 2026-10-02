-- Catálogo de serviços (copiado de src/data/catalog.ts).
-- Nota e total de avaliações são valores de EXEMPLO — revise antes de publicar.
-- Idempotente: pode rodar de novo para atualizar os textos.

insert into public.services
  (id, icon, title, short_title, subtitle, area, description, includes, examples, badge, rating, review_count, is_popular, sort_order)
values
  (
    'encanador', 'wrench', 'Encanador', 'Encanador',
    'Instalação e reparos em geral', 'Hidráulica',
    'Vazamentos, entupimentos, troca de torneiras, registros e instalação de chuveiros e caixas d’água.',
    array['Vazamentos e infiltrações', 'Desentupimento', 'Instalação de chuveiro e torneira', 'Caixa d’água e registros'],
    array['Torneira pingando', 'Pia entupida', 'Instalar chuveiro'],
    null, 4.8, 1245, true, 1
  ),
  (
    'eletricista', 'zap', 'Eletricista', 'Eletricista',
    'Instalação, manutenção e reparos', 'Elétrica',
    'Tomadas, disjuntores, iluminação, quadros de energia e instalação de aparelhos com segurança.',
    array['Tomadas e interruptores', 'Troca de disjuntor', 'Instalação de luminárias', 'Revisão do quadro de energia'],
    array['Tomada sem energia', 'Instalar lustre', 'Disjuntor desarmando'],
    null, 4.7, 982, false, 2
  ),
  (
    'informatica', 'laptop', 'Suporte de informática', 'Informática',
    'Formatação, limpeza e manutenção', 'Tecnologia',
    'Resolvemos problemas no seu computador, notebook ou rede. Instalação de programas, limpeza, formatação e muito mais, com atendimento rápido e seguro.',
    array['Formatação e reinstalação de sistema', 'Limpeza e otimização do equipamento', 'Instalação de programas', 'Suporte remoto e presencial'],
    array['Notebook lento', 'Formatar computador', 'Wi‑Fi caindo'],
    null, 4.8, 1245, true, 3
  ),
  (
    'montagem-moveis', 'hammer', 'Montagem de móveis', 'Montagem',
    'Residencial e comercial', 'Montagem',
    'Montagem e desmontagem de guarda-roupas, camas, estantes, escrivaninhas e móveis planejados.',
    array['Guarda-roupas e camas', 'Estantes e painéis de TV', 'Fixação na parede', 'Desmontagem para mudança'],
    array['Montar guarda-roupa', 'Fixar painel de TV', 'Montar cama box'],
    null, 4.9, 643, true, 4
  ),
  (
    'pintor', 'paint-roller', 'Pintor', 'Pintura',
    'Paredes, tetos e acabamentos', 'Reforma',
    'Pintura interna e externa, correção de paredes, textura e acabamentos.',
    array['Pintura de cômodos', 'Massa corrida e correções', 'Textura e grafiato', 'Portas e portões'],
    array['Pintar um quarto', 'Corrigir mofo na parede', 'Pintar portão'],
    null, 4.7, 412, false, 5
  ),
  (
    'limpeza', 'sparkles', 'Limpeza', 'Limpeza',
    'Residencial e pós-obra', 'Casa',
    'Faxina completa, limpeza pesada, pós-obra e limpeza de estofados.',
    array['Faxina residencial', 'Limpeza pós-obra', 'Vidros e janelas', 'Estofados e colchões'],
    array['Faxina no apartamento', 'Limpeza pós-obra', 'Limpar sofá'],
    null, 4.8, 1530, true, 6
  ),
  (
    'ar-condicionado', 'snowflake', 'Ar-condicionado', 'Ar-cond.',
    'Instalação e higienização', 'Climatização',
    'Instalação, manutenção preventiva, higienização e recarga de gás de aparelhos split e janela.',
    array['Instalação de split', 'Higienização completa', 'Recarga de gás', 'Manutenção preventiva'],
    array['Instalar ar split', 'Ar pingando água', 'Limpar ar-condicionado'],
    'NOVO', 4.8, 377, false, 7
  ),
  (
    'chaveiro', 'key-round', 'Chaveiro', 'Chaveiro',
    'Aberturas, cópias e fechaduras', 'Segurança',
    'Abertura de portas, troca de fechaduras e segredos, cópias de chaves e instalação de fechaduras digitais.',
    array['Abertura de portas', 'Troca de fechadura', 'Cópia de chaves', 'Fechadura digital'],
    array['Fiquei trancado para fora', 'Trocar fechadura', 'Instalar fechadura digital'],
    null, 4.6, 298, false, 8
  )
on conflict (id) do update set
  icon = excluded.icon,
  title = excluded.title,
  short_title = excluded.short_title,
  subtitle = excluded.subtitle,
  area = excluded.area,
  description = excluded.description,
  includes = excluded.includes,
  examples = excluded.examples,
  badge = excluded.badge,
  rating = excluded.rating,
  review_count = excluded.review_count,
  is_popular = excluded.is_popular,
  sort_order = excluded.sort_order;
