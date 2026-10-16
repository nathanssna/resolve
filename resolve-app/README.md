# Rezolveaê — app

App de serviços para a casa, feito com **Expo (SDK 57) + React Native + TypeScript + Expo Router**,
com back-end no **Supabase** (Postgres, login por código, Realtime, Storage e pg_cron).

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

## Estrutura

```
src/
  app/          telas (cada arquivo é uma rota do Expo Router)
  components/   componentes do design system (Button, ServiceCard, Chat, ServicePanel…)
  screens/      telas grandes reaproveitadas pelas rotas (painel do profissional, admin)
  state/        dados do Supabase: auth, catálogo, conversas/pedidos (app.tsx, com Realtime), endereços
  lib/          cliente Supabase, tipos gerados do banco, fotos, push, CEP
  content/      textos: termos, privacidade, Ajuda, dados da empresa
  theme/        tokens.ts — cores, espaçamentos, raios, tipografia
  utils/        datas e períodos, ordem dos profissionais, formatação no padrão brasileiro
supabase/       migrations (o banco inteiro), seed.sql (catálogo de serviços)
tests/          testes do banco e de ponta a ponta (veja tests/README.md)
assets/logo/    logo (PNG) e a arte original do R — o app usa src/components/Logo.tsx
```

### Regras do design system

- Use as cores de `src/theme/tokens.ts` e não escreva hex soltos nas telas.
- Texto sempre com `<Text variant="…">`: `hero`, `display`, `titleLg`, `titleMd`, `titleSm`, `labelLg`, `label`, `body`, `bodySm`, `caption` ou `overline`.
- Use **um** botão amarelo (`variant="primary"`) por tela. Sobre fundo amarelo, use o botão `dark`.
- Telas raiz começam com um topo amarelo de cantos arredondados. Telas internas são brancas, com o botão principal no rodapé fixo (`StickyFooter`).
- Campos são preenchidos de cinza e sem borda (`Field`). Ao focar, ganham borda preta.
- Ícones de serviço usam o estilo duotone (`<Icon duotone />`), dentro de blocos com cantos bem arredondados.
- Os ícones são da biblioteca Lucide (`<Icon name="…" />`). Para adicionar um, copie o SVG em https://lucide.dev para `src/components/iconPaths.ts`.

## Antes de publicar

- **Textos legais:** razão social, CNPJ e contato em `src/content/company.ts`; ainda há `[placeholders]` em `src/content/legal.ts`.
- **E-mail de login:** configurar SMTP próprio no Supabase (o padrão tem limite de envios por hora).
- **Lojas:** build com o EAS (`npx eas-cli@latest build`), push real exige development build e credenciais FCM/APNs.

## Painel de moderação (no app)

Perfil → **Painel de moderação** (aparece só para administradores; no computador, abra a versão web).
Mostra os números do período, pessoas, pedidos e serviços, denúncias (com a conversa denunciada) e os
pedidos de selo Verificado, com as ações: aprovar/recusar o selo, resolver denúncia, suspender e reativar conta.

- **Segundo fator:** além do código do e-mail, o painel pede o código de um app autenticador
  (Google Authenticator, Microsoft Authenticator…). Na primeira entrada, o próprio painel ensina a cadastrar.
  O banco confere administrador + segundo fator em toda leitura e ação, e registra tudo em `private.admin_log`.
- **Novo administrador** (só pelo SQL Editor do Supabase, depois que a pessoa criar a conta no app):
  `insert into private.admins (user_id) select id from auth.users where email = 'fulano@exemplo.com';`
  Para tirar: `delete from private.admins where user_id = (select id from auth.users where email = 'fulano@exemplo.com');`
- **Perdeu o celular do autenticador:** no painel do Supabase, Authentication → Users → a conta → apague o
  fator de MFA. Na próxima entrada, o painel pede para cadastrar de novo.

## Moderação pelo painel do Supabase (alternativa)

- **Selo Verificado:** em Table Editor → `verifications`, os pedidos com `status = pending`.
  As fotos estão em Storage → `verification` → pasta com o id do profissional (`document_path` e `selfie_path`).
  Confira se o rosto da selfie é o do documento e se o nome bate com o do perfil. Depois mude `status` para
  `approved` (liga o selo e avisa por push) ou `rejected`, escrevendo em `reason` o motivo que ele vai ver
  (ex.: "A foto do documento ficou ilegível."). O app do profissional apaga as fotos depois da análise;
  se quiser, apague a pasta na hora.
- **Denúncias:** Table Editor → `reports`. Os termos prometem análise em até 24 horas.
- **Automático (pg_cron):** lembrete no dia do serviço, fim da pausa por cancelamentos, propostas vencidas,
  pedidos sem resposta e limpeza de tokens de push. Veja em Integrations → Cron.

## Comandos

```bash
npx expo start           # servidor de desenvolvimento
npm run typecheck        # checagem de tipos
npm run lint             # lint
npx expo install <pkg>   # sempre use este para adicionar bibliotecas
```
