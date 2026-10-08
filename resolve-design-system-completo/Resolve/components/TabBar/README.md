# TabBar

Barra de abas inferior com quatro destinos: Início, Favoritos, Mensagens, Perfil. Props: `items` (lista de `{id,label,icon}`; o padrão são as quatro), `active` (id), `onChange(id)`.

- A aba ativa tem ícone preenchido com `brand`, contorno e rótulo `ink`; as inativas ficam em `ink-muted`.
- Aparece só nas telas raiz; telas de detalhe usam `TopBar`.
