# Resolve — app

App de serviços para a casa, feito com **Expo (SDK 57) + React Native + TypeScript + Expo Router**.
Visual e componentes seguem o design system **Resolve**.

## Rodar no seu celular (5 minutos)

1. Instale o **Node.js 20 ou mais novo**: https://nodejs.org
2. No celular, instale o app **Expo Go** (App Store ou Google Play).
3. No terminal, dentro desta pasta:

   ```bash
   npm install
   npx expo start
   ```

4. Escaneie o QR code que aparece no terminal:
   - **iPhone:** com a câmera.
   - **Android:** pelo próprio app Expo Go.

O celular e o computador precisam estar na mesma rede Wi‑Fi. Se não conectar, rode `npx expo start --tunnel`.

Para abrir no navegador: `npx expo start --web` (ou aperte `w` no terminal).

Toda alteração que você salvar no código aparece no celular na hora.

## Como o app funciona (v2)

A negociação acontece **no chat, entre o cliente e o profissional**. A plataforma só conecta as pessoas e organiza o que foi combinado.

1. **Início:** busca, grade de serviços, banners e "Peça de novo".
2. **Serviço:** o que dá pra resolver e como funciona. Leva a "Ver profissionais".
3. **Escolher profissional:** lista ordenável (recomendados, nota, distância, quem responde rápido).
4. **Pedir orçamento:** descrição do problema, quando e onde. Não tem custo.
5. **Chat:** o profissional responde e manda uma **proposta** (valor + horário). O cliente aceita, recusa ou negocia com uma contraproposta.
6. **Pedidos:** depois que a proposta é aceita, o serviço aparece aqui com andamento, ações (mensagem, ligar, compartilhar) e avaliação no fim.

| Tela | Arquivo |
| --- | --- |
| Boas-vindas | `src/app/index.tsx` |
| Início | `src/app/(tabs)/inicio.tsx` |
| Busca | `src/app/buscar.tsx` |
| Serviço | `src/app/servico/[id].tsx` |
| Profissionais | `src/app/profissionais/[serviceId].tsx` |
| Pedir orçamento | `src/app/pedido/novo.tsx` |
| Chat | `src/app/chat/[id].tsx` |
| Mensagens | `src/app/(tabs)/mensagens.tsx` |
| Pedidos / detalhe | `src/app/(tabs)/pedidos.tsx` · `src/app/pedido/[id].tsx` |
| Perfil / Favoritos | `src/app/(tabs)/perfil.tsx` · `src/app/(tabs)/favoritos.tsx` |

> **Simulação:** as respostas do profissional no chat são simuladas em `src/state/app.tsx` (`proSays`). Se você mandar uma mensagem com um valor (ex.: "faz por 120?"), ele responde com uma proposta nova. Com back-end, troque isso por mensagens em tempo real.

## Estrutura

```
src/
  app/          telas (cada arquivo é uma rota do Expo Router)
  components/   componentes do design system (Button, ServiceCard, ProfessionalCard…)
  theme/        tokens.ts — cores, espaçamentos, raios, tipografia
  data/         catalog.ts — dados de exemplo (trocar pela API)
  state/        app.tsx — conversas, propostas, pedidos e favoritos (em memória)
  utils/        formatação no padrão brasileiro (4,8 · 1.245 · 2,3 km)
assets/logo/    logo em vetor (SVG) — o app usa src/components/Logo.tsx
```

### Regras do design system

- Use as cores de `src/theme/tokens.ts` e não escreva hex soltos nas telas.
- Texto sempre com `<Text variant="…">`: `hero`, `display`, `titleLg`, `titleMd`, `titleSm`, `labelLg`, `label`, `body`, `bodySm`, `caption` ou `overline`.
- Use **um** botão amarelo (`variant="primary"`) por tela. Sobre fundo amarelo, use o botão `dark`.
- Telas raiz começam com um topo amarelo de cantos arredondados. Telas internas são brancas, com o botão principal no rodapé fixo (`StickyFooter`).
- Campos são preenchidos de cinza e sem borda (`Field`). Ao focar, ganham borda preta.
- Ícones de serviço usam o estilo duotone (`<Icon duotone />`), dentro de blocos com cantos bem arredondados.
- Os ícones são da biblioteca Lucide (`<Icon name="…" />`). Para adicionar um, copie o SVG em https://lucide.dev para `src/components/iconPaths.ts`.

## O que trocar antes de publicar

- **Logo:** agora é vetor (`src/components/Logo.tsx` e `assets/logo/*.svg`), refeito a partir do mockup. Os PNGs antigos em `assets/images/` não são mais usados e podem ser apagados.
- **Ícone do app e splash:** `assets/icon.png`, `assets/splash-icon.png` e os `android-icon-*` ainda são os padrões do Expo.
- **Textos e números de exemplo** em `src/data/catalog.ts` e os valores das propostas simuladas em `src/state/app.tsx`.
- **Fonte:** usei a Plus Jakarta Sans (Google Fonts) como substituta da fonte do mockup.

## Próximos passos sugeridos

1. **Back-end e login.** Supabase ou Firebase são os caminhos mais rápidos. Troque `src/data/catalog.ts` por chamadas à API, mantendo os mesmos tipos.
2. **Telas que faltam:** perfil público do profissional, login/cadastro, envio de fotos no pedido e área do profissional (receber pedidos e mandar propostas).
3. **Publicar nas lojas** com o EAS: `npx eas-cli@latest build` gera os apps para iOS e Android na nuvem, sem precisar de Xcode ou Android Studio. Você vai precisar de uma conta Apple Developer e de uma conta Google Play.

## Comandos

```bash
npx expo start           # servidor de desenvolvimento
npm run typecheck        # checagem de tipos
npx expo install <pkg>   # sempre use este para adicionar bibliotecas
```
