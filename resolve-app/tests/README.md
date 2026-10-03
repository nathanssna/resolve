# Testes do Resolve

Duas partes, fora do app (não entram no bundle):

- **`db/`**: testes do banco. Cada suíte cria um banco do zero num Postgres 17 local,
  aplica todas as migrations de `supabase/migrations` e os seeds, e confere RLS, RPCs,
  triggers e regras de negócio como cliente, profissional, estranho e anônimo.
  O `bootstrap.sql` imita o mínimo do Supabase (`auth`, `storage`, `net`, papéis).
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
| `schema` | cadastro, catálogo, ficha, endereços, conversa, propostas, pedido, avaliação, realtime |
| `bot` | robô de demonstração (seeds/demo_bot.sql) |
| `demo` | seed dos profissionais de demonstração e `demo_cleanup.sql` |
| `photos-push` | buckets, políticas de Storage e push pela API da Expo |
| `addr` | endereço completo só depois de combinar |
| `merge` | migration de "uma conversa por profissional" sobre dados antigos |
| `close` | cancelar/recusar pedido, avaliações no perfil, telefone, favoritos |
| `account` | excluir conta, bloquear, denunciar |
| `area` | área de atendimento e `professional_distances` |

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
| `area` | lista por distância e área na ficha |
| `alert` | quando uma mensagem deixa o painel do profissional em alerta |

As contas de teste nunca tocam nos dados reais: são marcadas com `e2e=true` e o
`e2e:cleanup` apaga tudo o que elas criaram. Capturas de tela vão para `e2e/shots/`.
