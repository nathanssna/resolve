Resolve é um app de serviços para a casa: o usuário encontra um encanador, eletricista, técnico de informática ou montador perto dele, compara profissionais e solicita o serviço. A marca é amarela, direta e prestativa — "Serviços que facilitam sua vida."

## Conteúdo e voz

- Português do Brasil, tratamento por **você**: "O que você precisa resolver hoje?", "Mais segurança para você."
- O verbo da marca é **resolver**. Use-o em chamadas e vazios ("Nada por aqui ainda — que tal resolver algo hoje?").
- Frases curtas, sem ponto de exclamação e sem emoji.
- Títulos e botões com só a primeira letra maiúscula: "Serviços em destaque", "Solicitar serviço", "Ver todos".
- Números no padrão brasileiro: nota "4,8", milhar "1.245", distância "2,3 km de você", "5 anos de experiência".
- Subtítulos de card descrevem o que o serviço cobre, sem ponto final: "Instalação e reparos em geral".

## Cores

- O amarelo `brand` é a marca. Use-o em grandes áreas (tela de boas-vindas, bloco de ícone do detalhe) e em **um** elemento de ação por tela (botão principal, chip ativo, categoria ativa).
- Texto e ícones sobre `brand` são sempre `on-brand` (quase preto), nunca branco.
- Sobre fundo `brand`, a ação principal é o botão escuro (`ink` + `on-ink`), não outro amarelo.
- Telas de conteúdo são `surface` (branco). Blocos de ícone, chips inativos, tags e faixas informativas usam `surface-muted`.
- Hierarquia de texto: `ink` para títulos e nomes, `ink-body` para texto corrido, `ink-muted` para metadados.
- `star` só na estrela da nota, sempre com o número ao lado (a estrela sozinha não tem contraste suficiente).
- `brand-soft` é apenas a curva decorativa da boas-vindas.

## Tipografia

Uma família, Plus Jakarta Sans (Google Fonts), substituta mais próxima da fonte do mockup. Quando a fonte oficial for definida, adicione os arquivos em `fonts/` e troque a família `sans`.

- `display` para a frase de abertura; `title-lg` para o nome do serviço; `title-md` na barra superior; `title-sm` para títulos de seção.
- `label-lg` para títulos de card e botões; `body` para descrições; `body-sm` para subtítulos e metadados; `caption` para tags, chips, abas e rótulos de categoria.
- Pesos: 700 para títulos e rótulos, 500 para legendas, 400 para texto corrido.

## Espaço, forma e profundidade

- Margem lateral das telas: `space-5` (20px); na boas-vindas, `space-8`.
- Entre cards de uma lista: `space-3`. Entre seções: `space-6`.
- Cantos: `radius-md` em cards e campos, `radius-lg` nos blocos de categoria, `radius-xl` no ícone grande do detalhe, `radius-pill` em botões, chips, tags e avatar.
- Cards têm borda `line` de 1px e `shadow-card` bem suave — nunca sombra forte.
- Foco do teclado: contorno sólido de 2px em `focus`, afastado 2px.

## Iconografia

- Ícones de linha Lucide (ISC), 24px, traço 1.75, cantos e pontas arredondados, em `ink`. Disponíveis no componente `Icon` e em `assets/Icons/`.
- Preenchidos só em dois casos: a estrela da nota (`star`) e o pin de localização.
- Na barra de abas, a aba ativa tem o ícone preenchido de `brand` com contorno `ink`.
- Hidráulica usa `droplets` como substituto do ícone de cano do mockup — troque quando houver o ícone próprio.

## Telas de referência

`assets/Referencia/mockup-telas.png` mostra as quatro telas de origem: boas-vindas, Início, detalhe do serviço e lista de profissionais. Monte telas novas com os componentes: `TopBar` ou logo + `LocationPill` no topo, conteúdo em `surface`, `TabBar` nas telas raiz e um único `Button` primário no rodapé das telas de ação.

## Componentes

Os componentes são React 18 e ficam em `components/bundle.js`, expostos como `window.Resolve` (`Resolve.Button`, `Resolve.ServiceCard`…). Carregue os tokens como variáveis CSS, depois `components/bundle.css`, React 18 e o bundle. Componentes que navegam (`Button`, `ServiceCard`, `ProfessionalCard`, ações da `TopBar`) aceitam `href` e viram links; sem `href`, são botões com `onClick`.
