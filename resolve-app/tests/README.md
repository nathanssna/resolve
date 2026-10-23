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
| `reminder` | lembrete no dia do serviço (push às 7h): quem recebe, texto, botões, um resumo para quem tem vários serviços, uma vez só, lotes de 100 |
| `cancel` | cancelamento em cima da hora (12 h): motivo, pausa automática de 7 dias, histórico do cliente, taxa do profissional |
| `limits` | proposta (teto, data), proposta vencida, pedido sem resposta fecha, limites de pedidos e mensagens, e-mail descartável |
| `verify` | selo Verificado: bucket privado, envio, revisão no painel (aprova/recusa + push), fotos apagadas, conta excluída |
| `done` | concluir o serviço: "feito" do profissional, confirmação do cliente, remarcar, cancelar depois do dia, lembretes, automático com foto, disputa e decisão da equipe |
| `support` | canal oficial: a pessoa escreve para a equipe, a equipe responde pelo painel (segundo fator), push, registro, limite |
| `admin` | painel de moderação: só administrador com segundo fator; números, pessoas, serviços, denúncias, selo, suspensão, registro |
| `contact` | contato escondido antes de combinar: telefone, e-mail, @perfil e links no chat, no pedido e na proposta; liberado depois do aceite |
| `rateclient` | profissional avalia o cliente: só depois de concluído, uma vez; o cliente não lê as notas; média só com 3 avaliações (cliente e profissionais) |
| `confirm` | confirmar o serviço no dia: cliente e profissional, aviso no chat, só no dia, zera ao remarcar |
| `unread` | não lidas antes de um ponto (`unread_before`): só de outra pessoa, avisos contam, zera ao ler, só participante |
| `quiz` | teste de conhecimento e liberação: questões e gabarito nunca vazam, sorteio espalhado e sem repetição, retomar a mesma tentativa, correção, espera de 3 dias, tempo esgotado, aprovação por serviço + identidade = liberado (um aviso), cliente só vê e só pede no serviço aprovado |

As outras suítes rodam com `rezolveae.skip_qualification = 'on'` (em `db/bootstrap.sql`), para o profissional de teste aparecer sem fazer o teste; só vale em conexão direta como `postgres`. A suíte `quiz` desliga isso.

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
| `historico` | conversa longa abre com as 50 mensagens mais recentes; "Carregar mensagens anteriores" até o começo; tempo real e lista; contador com mais de 50 não lidas |
| `contato` | telefone no chat antes de combinar: aviso no campo, "[contato oculto]" para os dois; depois do aceite, aparece |
| `suspensa` | conta suspensa: aviso no início, Mensagens, chat e pedido novo; sem prazo; vencida ou reativada, some |
| `notacliente` | profissional dá estrelas ao cliente no serviço concluído; cliente vê no Perfil só "Aparece depois de 3 avaliações" |
| `sincroniza` | ao abrir, uma busca completa só; de volta ao app (depois de 30 s), só o que mudou, e a mensagem nova aparece |
| `confirma` | "Confirmar" no serviço do dia (cliente), botões do lembrete (`?acao=confirmar` / `?acao=remarcar`) e avisos no chat |
| `telas` | não confere nada: fotografa todas as telas (visitante, cliente, profissional) em `shots/telas/` para a revisão visual |
| `busca` | busca por frase na tela Buscar, como visitante (não precisa das contas); sem internet, cai na busca local |
| `pause` | pausar no painel do profissional; lista, perfil e pedido do lado do cliente |
| `entrada` | caminho do profissional novo: "Para começar" (3 passos), teste aprovado (com a fonte em cada questão) e reprovado (espera de 3 dias), identidade em análise e aprovada = liberado; aulas opcionais (a 1ª pelo app, lida tópico por tópico: 8 perguntas, errar 2 não conclui e espera 3 dias; as outras pela API), Profissional de Ouro no perfil do cliente (e a explicação ao tocar), escudo nos serviços aprovados; fotografa as telas em `shots/entrada-*.png`. As contas de teste nascem liberadas (`users.sh`); esta suíte refaz o caminho e devolve o estado |
| `cancela` | cancelar no prazo e em cima da hora (motivo), histórico do cliente, pausa automática e taxa no perfil |
| `limites` | e-mail descartável no login, folha de proposta (teto e períodos passados), proposta vencida |
| `verifica` | profissional envia documento e selfie, aprovação no banco, selo no perfil e fotos apagadas |
| `admin` | painel: acesso restrito, cadastro do autenticador (código gerado no teste), selo, denúncia, suspender/reativar, nova sessão |

As contas de teste nunca tocam nos dados reais: são marcadas com `e2e=true` e o
`e2e:cleanup` apaga tudo o que elas criaram. Capturas de tela vão para `e2e/shots/`.
