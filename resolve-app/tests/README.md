# Testes da Rezolveaê

Duas partes, fora do app (não entram no bundle):

- **`db/`**: testes do banco. Cada suíte cria um banco do zero num Postgres 17 local,
  aplica todas as migrations de `supabase/migrations` e o `seed.sql` (algumas suítes
  também carregam `db/fixtures/professionals.sql`, 13 profissionais de exemplo), e confere RLS, RPCs,
  triggers e regras de negócio como cliente, profissional, estranho e anônimo.
  O `bootstrap.sql` imita o mínimo do Supabase (`auth`, `storage`, `net`, papéis) e
  `db/stubs` traz um `pg_cron` falso (o `db:start` instala no Postgres embutido).
- **`e2e/`**: o app de verdade num Chrome sem janela, contra o **Supabase real** do projeto,
  com duas contas temporárias (`teste+cli` e `teste+pro` @exemplo.invalid).

Só Linux x64 (o Postgres embutido é `@embedded-postgres/linux-x64`).

## Banco

```bash
cd tests
npm install          # primeira vez
npm run db:start     # sobe o Postgres na porta 54999
npm run test:db      # roda todas as suítes
npm run db:stop
```

| Suíte | O que cobre |
|---|---|
| `schema` | cadastro, catálogo, ficha, endereços, conversa, propostas, pedido, avaliação, realtime, permissões das tabelas |
| `photos-push` | buckets, políticas de Storage e push pela API da Expo |
| `addr` | endereço completo só depois de combinar |
| `merge` | migration de "uma conversa por profissional" sobre dados antigos |
| `close` | cancelar/recusar pedido, avaliações no perfil, telefone, favoritos |
| `account` | excluir conta, bloquear, denunciar |
| `area` | área de atendimento e `professional_distances` |
| `notif` | preferências de notificação e limpeza dos tokens de push inválidos (tickets e recibos da Expo) |
| `search` | busca por frase (`search_services`): radicais, sem acento, começo de palavra, erro de digitação, ranking |
| `pause` | profissional pausa os pedidos: some das listas, sem conversa/pedido novo, o resto continua |
| `reminder` | lembrete no dia do serviço (push às 7h): quem recebe, texto, uma vez só, lotes de 100 |
| `cancel` | cancelamento em cima da hora (12 h): motivo, pausa automática de 7 dias, histórico do cliente, taxa do profissional |
| `limits` | proposta (teto, data), proposta vencida, pedido sem resposta fecha, limites de pedidos e mensagens, e-mail descartável |
| `verify` | selo Verificado: bucket privado, envio, revisão no painel (aprova/recusa + push), fotos apagadas, conta excluída |
| `done` | concluir o serviço: "feito" do profissional, confirmação do cliente, remarcar, cancelar depois do dia, lembretes, automático com foto, disputa e decisão da equipe |
| `support` | canal oficial: a pessoa escreve para a equipe, a equipe responde pelo painel (segundo fator), push, registro, limite |
| `admin` | painel de moderação: só administrador com segundo fator; números, pessoas, serviços, denúncias, selo, suspensão, registro |

## Ponta a ponta

Precisa do Google Chrome em `/usr/bin/google-chrome`, do `.env` do app e do projeto
ligado ao Supabase (`npx supabase link`).

```bash
# 1. app na web (CI=1: sem recarga automática — reinicie depois de mudar o código)
cd .. && CI=1 npx expo start --web --port 8099

# 2. em outro terminal
cd tests
npm run e2e:users              # cria as contas temporárias
node e2e/block2.e2e.js         # uma suíte por vez; recrie as contas entre elas
npm run e2e:cleanup            # apaga as contas (sempre, no fim)
```

| Suíte | Fluxo |
|---|---|
| `pair` | dois pedidos ao mesmo profissional na mesma conversa |
| `block2` | favoritos, telefone, perfil, escolha de serviço, cancelar/recusar, avaliação |
| `block3` | termos, denunciar, bloquear, excluir conta |
| `alert` | quando uma mensagem deixa o painel do profissional em alerta |
| `notif` | Notificações (preferências gravadas no banco) e Ajuda, para cliente e profissional |
| `chat` | "Negociar" preenche o campo; "digitando…" com os pontos animados |
| `busca` | busca por frase na tela Buscar, como visitante (não precisa das contas); sem internet, cai na busca local |
| `pause` | pausar no painel do profissional; lista, perfil e pedido do lado do cliente |
| `cancela` | cancelar no prazo e em cima da hora (motivo), histórico do cliente, pausa automática e taxa no perfil |
| `limites` | e-mail descartável no login, folha de proposta (teto e períodos passados), proposta vencida |
| `verifica` | profissional envia documento e selfie, aprovação no banco, selo no perfil e fotos apagadas |
| `admin` | painel: acesso restrito, cadastro do autenticador (código gerado no teste), selo, denúncia, suspender/reativar, nova sessão |

As contas de teste nunca tocam nos dados reais: são marcadas com `e2e=true` e o
`e2e:cleanup` apaga tudo o que elas criaram. Capturas de tela vão para `e2e/shots/`.
