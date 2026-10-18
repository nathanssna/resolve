/**
 * Aulas da Rezolveaê: o 4º passo obrigatório da entrada do profissional (ficha → teste → identidade → aulas).
 * Os ids precisam existir em public.lessons (migration 20261018140000_lessons.sql).
 *
 * Cada aula conta uma história com o próprio leitor dentro dela, e cada uma do seu jeito: os blocos
 * são livres (parágrafo, título, mensagem de chat, conta, destaque). As regras, a lei e os números
 * aparecem dentro da história, quando fazem sentido.
 *
 * No fim, perguntas sobre o porquê das coisas: fáceis para quem leu, difíceis para quem pulou.
 * Em cada pergunta, a primeira alternativa é a certa (a tela embaralha).
 * Valores de MEI e DAS são de 2026: revisar todo ano.
 */

export type LessonBlock =
  /** Parágrafo da história. */
  | { kind: 'p'; text: string }
  /** Virada da história (um subtítulo curto). */
  | { kind: 'h'; text: string }
  /** Mensagem de chat: de quem é e o que diz. `mine` = do profissional (você). */
  | { kind: 'say'; from: string; text: string; mine?: boolean }
  /** Uma conta, linha a linha. */
  | { kind: 'ledger'; title: string; rows: { label: string; value: string }[]; total: { label: string; value: string } }
  /** Uma frase para guardar. */
  | { kind: 'mark'; text: string };

export type LessonQuestion = { question: string; options: string[]; why: string };

export type Lesson = {
  id: string;
  title: string;
  minutes: number;
  /** Uma frase que convida a ler. */
  summary: string;
  blocks: LessonBlock[];
  questions: LessonQuestion[];
  sources: { label: string; url?: string }[];
};

export const LESSONS: Lesson[] = [
  // ---------------------------------------------------------------------------
  // 1. Orçamento: seguir o dinheiro
  // ---------------------------------------------------------------------------
  {
    id: 'orcamento',
    title: 'Para onde foi o dinheiro',
    minutes: 6,
    summary: 'Um serviço de R$ 600, um mês inteiro e uma pergunta: quanto disso ficou com você?',
    blocks: [
      { kind: 'p', text: 'Pense num serviço bom. Daqueles que dão orgulho. O cliente pediu para pintar a sala e o quarto, você olhou rápido, fez a conta de cabeça e disse: "Fica seiscentos, tudo." Ele achou justo. Você também. Aperto de mão, combinado para segunda.' },
      { kind: 'p', text: 'Agora vamos fazer uma coisa que pouca gente faz: seguir esses R$ 600 até o fim. Real por real.' },
      { kind: 'h', text: 'A semana' },
      { kind: 'p', text: 'Segunda de manhã você descobre que a parede do quarto tem umas rachaduras finas que você não tinha visto. Precisa de massa. Lá vai você para a loja de material. Na volta, a lixa acabou. Mais uma ida.' },
      { kind: 'p', text: 'Terça chove e a parede não seca. Você volta para casa mais cedo. Quarta, segunda demão. Quinta, acabamento e limpeza. Foram quatro dias, não dois. Em cada um deles você atravessou a cidade de ida e de volta.' },
      { kind: 'p', text: 'Sexta-feira o cliente paga, elogia, fica feliz. Você também. Até sentar com o caderno.' },
      {
        kind: 'ledger',
        title: 'O que saiu dos R$ 600',
        rows: [
          { label: 'Massa, lixa e fita que não estavam na conta', value: '− R$ 95' },
          { label: 'Gasolina de quatro dias de ida e volta, mais duas idas à loja', value: '− R$ 120' },
          { label: 'Rolo e trincha que já estavam no fim', value: '− R$ 45' },
          { label: 'Parte do celular, da internet e do DAS do mês', value: '− R$ 40' },
        ],
        total: { label: 'Ficou com você, por quatro dias de trabalho', value: 'R$ 300' },
      },
      { kind: 'p', text: 'Trezentos reais por quatro dias. Menos de oitenta por dia, trabalhando como profissional, com ferramenta sua e experiência sua. E o cliente nunca vai saber disso, porque para ele o serviço custou seiscentos e ficou ótimo.' },
      { kind: 'mark', text: 'Preço dado no olho não paga o que você não viu.' },
      { kind: 'h', text: 'De onde vem um preço que se sustenta' },
      { kind: 'p', text: 'Volte ao começo e faça diferente. Antes de pensar em qualquer serviço, pense no seu mês. Quanto você precisa ganhar para viver bem? Digamos R$ 4.000. Quanto gasta só para conseguir trabalhar: celular, internet, ferramenta que gasta, o DAS do MEI? Digamos R$ 800. Juntos, R$ 4.800.' },
      { kind: 'p', text: 'Agora a parte que quase todo mundo erra. Você não cobra todas as horas do mês. Tem o trânsito, a ida à loja, o tempo de responder cliente, de ir olhar serviço que não fecha. Se de verdade você consegue cobrar umas 120 horas, divida: R$ 4.800 por 120 horas dá R$ 40 a hora. É assim que o Sebrae ensina a calcular o valor da hora de quem trabalha por conta própria.' },
      { kind: 'p', text: 'Com esse número na cabeça, o orçamento muda de figura. Quatro dias de trabalho, mais o material, mais a gasolina, mais uma folga para o imprevisto e o seu lucro. A chuva de terça não sai mais do seu bolso, porque ela já estava prevista na folga.' },
      { kind: 'h', text: 'O papel que protege os dois' },
      { kind: 'p', text: 'Imagine que outro profissional manda para o mesmo cliente um "R$ 500, tudo incluso". Você manda o seu, mais caro, mas escrito assim: tanto de mão de obra, tanto de material, metade no começo e metade no fim, começa segunda e termina quinta.' },
      { kind: 'p', text: 'Muitos clientes escolhem o seu. Não pelo preço, mas porque entenderam exatamente o que estão pagando. "Tudo incluso" assusta quem já levou susto.' },
      { kind: 'p', text: 'E não é só costume. O Código de Defesa do Consumidor, no artigo 40, diz que quem presta serviço deve entregar um orçamento com o valor da mão de obra, dos materiais, as condições de pagamento e as datas de início e de término. Se vocês não combinarem outro prazo, esse orçamento vale por 10 dias depois que o cliente recebe. E depois de aprovado, ele vale para os dois: nem você aumenta por conta própria, nem o cliente pode exigir o que não estava lá.' },
      { kind: 'h', text: 'Quinta-feira, atrás do guarda-roupa' },
      { kind: 'p', text: 'Agora imagine que, no meio do serviço, vocês arrastam o guarda-roupa e lá atrás tem mofo, a parede úmida. Isso não estava no orçamento. O que você faz?' },
      { kind: 'p', text: 'Se pintar por cima, o mofo volta e a culpa vai ser sua. Se tratar e cobrar no fim sem ter avisado, o cliente se sente enganado, e com razão: o próprio Código trata como prática abusiva fazer serviço sem orçamento e sem autorização do cliente.' },
      { kind: 'p', text: 'O caminho é parar. Chamar o cliente, mostrar a parede, tirar uma foto, explicar o que precisa ser feito e quanto custa a mais. Ele decide. Se aceitar, você anota no chat. Se não, você segue o combinado e deixa registrado que avisou. Ninguém perde a confiança, porque ninguém foi surpreendido.' },
      { kind: 'h', text: 'E quando pedem para você ir só olhar' },
      { kind: 'p', text: 'Às vezes o cliente quer que você vá até lá só para dar o preço. É tentador cobrar a visita, afinal é o seu tempo. Mas o Idec considera abusivo cobrar pelo orçamento. A saída inteligente é outra: peça fotos, um vídeo curto, as medidas. Na maioria das vezes dá para orçar dali mesmo, sem gastar a sua tarde.' },
      { kind: 'p', text: 'Na Rezolveaê, a sua proposta no chat já é o seu orçamento: valor, dia e período. Use a observação para escrever o que está incluído e o que não está. Se o cliente demorar, a proposta vence, e você manda outra com a data atualizada. O pagamento é direto entre você e ele.' },
      { kind: 'mark', text: 'Um orçamento claro não é burocracia. É o que faz o cliente confiar em você e o que garante que o seu trabalho seja pago.' },
    ],
    questions: [
      {
        question: 'No serviço de R$ 600, por que sobraram só R$ 300?',
        options: [
          'O preço foi dado no olho, sem os custos',
          'O cliente pagou menos do que tinha sido combinado no começo',
          'Choveu demais na terça',
          'Pintura é um serviço que dá pouco lucro, não tem como mudar',
        ],
        why: 'O preço foi dado no olho. Tudo o que não entrou na conta saiu do bolso do profissional.',
      },
      {
        question: 'Como se calcula o valor da sua hora?',
        options: [
          'Ganho desejado mais custos, dividido pelas horas cobráveis',
          'O salário mínimo dividido por todas as horas que existem no mês',
          'O preço do concorrente',
          'O ganho desejado dividido por todas as horas, inclusive o trânsito e a loja',
        ],
        why: 'Nem toda hora é cobrável: trânsito, loja e orçamento também tomam tempo. Por isso divide-se só pelas horas que você consegue cobrar.',
      },
      {
        question: 'Pelo Código de Defesa do Consumidor, o que o orçamento precisa ter?',
        options: [
          'Mão de obra, materiais, pagamento e datas',
          'Só o valor total, escrito bem claro, para o cliente não se confundir',
          'O valor total, o seu nome completo e o seu telefone de contato',
          'A lista de material, a marca de cada item e a sua assinatura no fim',
        ],
        why: 'É o que diz o artigo 40. Com isso, o cliente sabe o que paga e você se protege.',
      },
      {
        question: 'Atrás do guarda-roupa aparece um problema que não estava no orçamento. O que fazer?',
        options: [
          'Parar, mostrar a parede ao cliente, explicar e combinar o novo valor antes de seguir',
          'Resolver o problema e cobrar no final, junto com o resto do serviço',
          'Pintar por cima e não comentar nada, para não atrasar a entrega',
          'Ir embora e deixar o cliente decidir sozinho o que fazer com a parede',
        ],
        why: 'Fazer serviço sem orçamento e sem autorização é prática abusiva. Parar e combinar mantém a confiança.',
      },
    ],
    sources: [
      { label: 'Código de Defesa do Consumidor, arts. 39 (VI) e 40', url: 'https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm' },
      { label: 'Idec: a obrigatoriedade de orçamento para a execução de serviços', url: 'https://idec.org.br/em-acao/artigo/a-obrigatoriedade-de-orcamento-para-a-execuco-de-servicos' },
      { label: 'Sebrae PR: como calcular o custo da sua hora trabalhada', url: 'https://sebraepr.com.br/?p=328498' },
    ],
  },

  // ---------------------------------------------------------------------------
  // 2. Fotos: a mesma semana, dois finais
  // ---------------------------------------------------------------------------
  {
    id: 'fotos',
    title: 'A foto que você não tirou',
    minutes: 4,
    summary: 'O mesmo vazamento, o mesmo conserto bem feito e dois finais muito diferentes.',
    blocks: [
      { kind: 'p', text: 'Você foi chamado para um vazamento embaixo da pia. Abriu, achou a conexão rachada, trocou, apertou, testou. Nenhuma gota. Serviço limpo. Você guarda a ferramenta, o cliente agradece e você vai embora com a sensação boa de dever cumprido.' },
      { kind: 'p', text: 'Agora vamos viver a semana seguinte duas vezes.' },
      { kind: 'h', text: 'Primeiro final' },
      { kind: 'p', text: 'Oito dias depois, chega uma mensagem.' },
      { kind: 'say', from: 'Cliente', text: 'Boa noite. A pia voltou a molhar. Acho que o serviço não ficou bom.' },
      { kind: 'p', text: 'Seu estômago gela. Você sabe que trocou a peça. Sabe que testou. Mas como mostrar? O filho do cliente mexeu no sifão no fim de semana, só que você não tem como provar nada disso. É a sua palavra contra a dele.' },
      { kind: 'p', text: 'O cliente marca que o serviço não foi feito. O serviço volta a ficar em aberto, e agora você vai ter que voltar lá, de graça, para explicar algo que já estava resolvido. Talvez ganhe uma nota baixa no caminho.' },
      { kind: 'h', text: 'Segundo final' },
      { kind: 'p', text: 'Agora rebobine. Mesmo serviço, mesmo conserto. A única diferença: antes de mexer em qualquer coisa, você tirou o celular do bolso e fotografou a conexão rachada. No fim, do mesmo lugar e do mesmo ângulo, fotografou a peça nova, seca, com o papel embaixo sem nenhuma gota.' },
      { kind: 'p', text: 'Ao marcar Serviço feito no app, você mandou essas fotos. O cliente viu, ficou tranquilo, e mesmo que tivesse esquecido de responder, o serviço seria concluído sozinho em 7 dias, porque teve foto. Sem foto, só o cliente pode concluir.' },
      { kind: 'p', text: 'E se a mensagem de oito dias depois chegar mesmo assim? Você responde com calma, mostrando a foto do depois. Se ainda assim ele disser que não foi feito, você pode discordar no app, e a equipe da Rezolveaê lê a conversa e olha as fotos para decidir. As fotos falam por você quando você não está lá.' },
      { kind: 'mark', text: 'O serviço bem feito você faz uma vez. A foto faz ele ser lembrado do jeito certo.' },
      { kind: 'h', text: 'O que faz uma foto contar a história' },
      { kind: 'p', text: 'Pense em como alguém de fora vê a sua foto. Ele não estava lá. Tudo o que ele sabe é o que aparece na tela.' },
      { kind: 'p', text: 'Por isso o antes e o depois precisam ser do mesmo lugar e do mesmo ângulo. Se o antes é de perto e o depois é de longe, a pessoa não reconhece que é a mesma coisa, e a comparação perde a força.' },
      { kind: 'p', text: 'A luz decide se a foto mostra ou esconde. Fotografar contra a janela ou contra o sol deixa tudo escuro, e o seu acabamento some. Acenda as luzes, prefira a luz do dia vindo de lado ou de trás de você. Antes de tirar, passe a camiseta na lente: uma digital ali deixa tudo embaçado, e você só percebe quando já foi embora.' },
      { kind: 'p', text: 'Mostre o detalhe que prova o capricho: a emenda dentro da caixa, o rejunte certinho, a peça nova encaixada, o nível do móvel. E arrume antes da foto final. Sobra de material e pó no chão contam uma história de pressa, mesmo quando o serviço ficou perfeito.' },
      { kind: 'h', text: 'A foto que você quer mostrar para o mundo' },
      { kind: 'p', text: 'Ficou tão bonito que dá vontade de postar. Ótimo, é a melhor propaganda que existe. Mas imagine agora que é a sua casa na foto de outra pessoa: o número do portão aparecendo, o porta-retratos da sua família no fundo, a placa do seu carro na garagem. Você gostaria?' },
      { kind: 'p', text: 'A imagem da casa e das pessoas é dado pessoal, protegido pela Lei Geral de Proteção de Dados. Então, antes de postar, peça autorização ao cliente. E fotografe só o serviço: nada de pessoas, documentos, número da casa ou objetos pessoais. Muitos clientes autorizam com prazer quando veem que você teve esse cuidado, e esse cuidado também vira propaganda.' },
    ],
    questions: [
      {
        question: 'Por que o antes e o depois devem ser do mesmo lugar e do mesmo ângulo?',
        options: [
          'Para quem não estava lá ver a diferença',
          'Porque o app só aceita fotos que foram tiradas exatamente do mesmo ponto',
          'Porque a câmera do celular ajusta melhor a luz quando o ângulo se repete',
          'Para economizar espaço'
        ],
        why: 'Quem vê a foto só sabe o que aparece nela. Com o mesmo ângulo, a comparação fala sozinha.',
      },
      {
        question: 'Você marcou Serviço feito com fotos e o cliente não respondeu. O que acontece?',
        options: [
          'Em 7 dias o serviço é concluído sozinho',
          'O serviço fica em aberto para sempre',
          'O serviço é cancelado depois de 3 dias',
          'Você precisa voltar lá para o cliente confirmar',
        ],
        why: 'Com foto, o app conclui o serviço em 7 dias sem resposta. Sem foto, só o cliente conclui.',
      },
      {
        question: 'Por que não fotografar contra a janela?',
        options: [
          'A luz de frente escurece o serviço',
          'Porque o reflexo do vidro da janela pode estragar a câmera do celular',
          'Porque os vizinhos podem ver, pela janela, que você está fotografando',
          'Porque o app recusa fotos em que aparece uma janela ao fundo'
        ],
        why: 'Contra a luz, o celular escurece o que está na frente. O seu trabalho some na foto.',
      },
      {
        question: 'Antes de postar a foto de um serviço na internet, o que fazer?',
        options: [
          'Pedir autorização ao cliente e fotografar só o serviço, sem pessoas nem dados da casa',
          'Nada, porque o serviço foi feito por você e a foto também é sua',
          'Só cobrir o rosto das pessoas com um desenho antes de publicar',
          'Postar logo e apagar depois, se o cliente reclamar da foto',
        ],
        why: 'A imagem da casa e das pessoas é dado pessoal. Com autorização e só o serviço na foto, você divulga sem expor ninguém.',
      },
    ],
    sources: [
      { label: 'Lei Geral de Proteção de Dados (Lei nº 13.709/2018)', url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm' },
      { label: 'Regras de Serviço feito, fotos e discordância na Rezolveaê (Ajuda do app)' },
    ],
  },

  // ---------------------------------------------------------------------------
  // 3. Chat: do outro lado da tela
  // ---------------------------------------------------------------------------
  {
    id: 'chat',
    title: 'Dez da noite, água no chão',
    minutes: 4,
    summary: 'Desta vez você é o cliente. E descobre, do outro lado, por que uns profissionais são escolhidos e outros não.',
    blocks: [
      { kind: 'p', text: 'São dez da noite. Você chega em casa e o chão da cozinha está molhado. A água vem de baixo da pia e não para. Você fecha o registro, junta pano, e com a mão ainda molhada abre o app e chama três profissionais.' },
      { kind: 'p', text: 'Sente esse momento. Você está cansado, preocupado, sem saber se é grave. Agora olhe o que acontece no seu celular.' },
      { kind: 'h', text: 'O primeiro' },
      { kind: 'p', text: 'Nada. Meia hora, uma hora. Você vai dormir sem resposta. Na manhã seguinte chega um "oi, ainda precisa?". Você já tinha resolvido com outro.' },
      { kind: 'p', text: 'Ele talvez fosse o melhor dos três. Você nunca vai saber. Do lado de cá, quem não responde simplesmente não existe.' },
      { kind: 'h', text: 'O segundo' },
      { kind: 'p', text: 'Responde em dois minutos.' },
      { kind: 'say', from: 'Profissional 2', text: 'Faço por 250.' },
      { kind: 'p', text: 'Você fica sem saber o que são esses 250. Ele nem perguntou o que aconteceu. E se for só uma mangueira? E se for o cano dentro da parede e, na hora, virar 600? A rapidez foi boa, mas a sensação é de que ele chutou.' },
      { kind: 'h', text: 'O terceiro' },
      { kind: 'say', from: 'Profissional 3', text: 'Boa noite! Que chato isso. Já fechou o registro? Se puder, me manda uma foto ou um vídeo de baixo da pia, com a lanterna do celular.' },
      { kind: 'p', text: 'Você manda. Ele olha.' },
      { kind: 'say', from: 'Profissional 3', text: 'Pelo vídeo, parece a mangueira flexível da torneira, e não o cano. Então é trocar a mangueira e conferir a vedação do sifão, certo? Consigo amanhã de manhã. Fica 120 com a peça. Se for outra coisa, te mostro antes de mexer.' },
      { kind: 'p', text: 'Você respira. Ele entendeu o seu problema, disse o que vai fazer, quando e quanto, e ainda prometeu não te surpreender. Não precisa nem pensar: é ele.' },
      { kind: 'mark', text: 'O cliente não escolhe só o preço. Escolhe quem mostrou que entendeu o problema dele.' },
      { kind: 'h', text: 'Agora volte para o seu lado da tela' },
      { kind: 'p', text: 'Tudo o que você sentiu como cliente, o seu cliente sente quando fala com você.' },
      { kind: 'p', text: 'A demora tem custo, e não é só de imagem. No seu perfil aparece o tempo de resposta que você escolheu na ficha, e é a primeira promessa que o cliente lê. E um pedido que fica sem nenhuma resposta sua fecha sozinho: em 3 dias, ou em 24 horas quando o cliente marca que é urgente. Se não puder atender agora, responder "consigo amanhã às 8h" já te coloca na frente de quem ficou calado.' },
      { kind: 'p', text: 'Perguntar antes de dar o preço não é enrolação, é respeito. Peça a foto, o vídeo, as medidas, a marca do aparelho. Com isso você dá um preço que não muda na hora, e o cliente sente que está nas mãos de quem sabe. E repita com as suas palavras o que entendeu, como o terceiro fez. Se você entendeu errado, o cliente corrige agora, pelo chat, e não na casa dele, na frente da pia.' },
      { kind: 'p', text: 'Escreva como quem conversa: frases curtas, uma ideia de cada vez, sem abreviação que o cliente pode não entender. E avise sempre. Vai atrasar, faltou peça, apareceu outro problema: o cliente aceita quase tudo, menos ser pego de surpresa.' },
      { kind: 'h', text: 'O pedido do WhatsApp' },
      { kind: 'p', text: 'Uma hora alguém escreve: "me passa seu zap que é mais fácil". Pode parecer gentileza aceitar. Mas pense no que você perde.' },
      { kind: 'p', text: 'Combinando pelo app, fica tudo registrado: o que foi pedido, o preço, a data. Se o cliente disser depois que não foi aquilo, a conversa está lá. Você recebe avaliação, que é o que traz o próximo cliente. E se der problema, a equipe da Rezolveaê consegue ajudar. Fora do app, você está por sua conta. Por isso, até vocês combinarem, telefone, e-mail e redes sociais escritos no chat aparecem escondidos para os dois.' },
      { kind: 'p', text: 'E no fim do serviço, agradeça. Diga que ele pode avaliar no app, sem pressionar. Quem foi bem atendido do primeiro "boa noite" até o "obrigado" costuma avaliar sozinho.' },
    ],
    questions: [
      {
        question: 'Por que o terceiro profissional foi escolhido, mesmo sem ser o primeiro a responder?',
        options: [
          'Mostrou que entendeu o problema',
          'Porque cobrou menos',
          'Porque mandou a mensagem mais longa e mais educada da conversa',
          'Porque passou o telefone dele no chat para resolver mais rápido',
        ],
        why: 'O cliente escolhe quem mostra que entendeu o problema. Rapidez sozinha não basta.',
      },
      {
        question: 'Um pedido urgente fica sem nenhuma resposta sua. O que acontece?',
        options: [
          'Fecha sozinho em 24 horas',
          'Fica esperando até você responder',
          'Fecha em 3 dias, como os outros',
          'É passado automaticamente para outro profissional',
        ],
        why: 'Pedido sem resposta fecha em 3 dias, ou em 24 horas quando o cliente marca que é urgente.',
      },
      {
        question: 'Por que repetir com as suas palavras o que o cliente pediu?',
        options: [
          'Para o cliente corrigir o engano ainda no chat, antes de você chegar na casa dele',
          'Para a conversa ficar mais longa e o app mostrar você primeiro',
          'Porque o app só libera a proposta depois de uma confirmação escrita',
          'Para o cliente desistir logo se o serviço for complicado demais',
        ],
        why: 'Se você entendeu errado, o cliente corrige ali mesmo. Na hora do serviço, o erro sai caro.',
      },
      {
        question: 'O cliente pede seu WhatsApp antes de combinar. Por que vale manter a conversa no app?',
        options: [
          'Registro, avaliação e ajuda da equipe',
          'Porque no app a internet fica mais rápida do que no WhatsApp',
          'Porque fora do app o cliente sempre acaba pagando mais caro',
          'Não vale, passe o número',
        ],
        why: 'No app, a conversa protege os dois, a avaliação traz o próximo cliente e a equipe consegue ajudar.',
      },
    ],
    sources: [{ label: 'Regras do chat, dos pedidos e do contato escondido na Rezolveaê (Ajuda do app)' }],
  },

  // ---------------------------------------------------------------------------
  // 4. Data: o dia de quem espera
  // ---------------------------------------------------------------------------
  {
    id: 'data',
    title: 'O dia de quem espera',
    minutes: 4,
    summary: 'Uma terça-feira contada pelos olhos de quem está do lado de dentro do portão, olhando o relógio.',
    blocks: [
      { kind: 'p', text: 'Esta história não é sua. É de uma cliente. Mas é sobre você.' },
      { kind: 'h', text: '6h40' },
      { kind: 'p', text: 'Ela acorda mais cedo do que precisava. Ontem pediu ao chefe para entrar só depois do almoço, porque hoje de manhã vem o eletricista trocar o disjuntor que vive caindo. Ficou combinado no app: terça, de manhã. Ela arruma a sala, tira as coisas da frente do quadro de luz, deixa o café pronto.' },
      { kind: 'h', text: '8h30' },
      { kind: 'p', text: 'A manhã, no app, vai das 8h às 12h. Ainda é cedo. Ela não liga.' },
      { kind: 'h', text: '10h15' },
      { kind: 'p', text: 'Ela olha a janela pela quinta vez. Pensa em mandar mensagem, mas não quer parecer chata. Ele deve estar vindo.' },
      { kind: 'h', text: '11h50' },
      { kind: 'say', from: 'Profissional', text: 'Bom dia, surgiu um imprevisto aqui, consigo só depois das 14h.' },
      { kind: 'p', text: 'Ela olha o celular por um tempo. Depois das 14h ela já precisa estar no trabalho. A folga se foi. A manhã também. E o disjuntor continua caindo.' },
      { kind: 'mark', text: 'Para você, foi um atraso. Para ela, foi um dia de trabalho perdido.' },
      { kind: 'h', text: 'Agora volte para o seu lado' },
      { kind: 'p', text: 'Ninguém atrasa por maldade. O que quase sempre acontece é outra coisa: três serviços marcados na mesma manhã, em bairros diferentes, contando com um trânsito que não existe. Por isso a hora de evitar essa história não é no dia. É na hora de combinar.' },
      { kind: 'p', text: 'Quando você manda a proposta, escolhe o dia e o período: manhã, das 8h às 12h; tarde, das 13h às 17h; ou noite, das 18h às 20h. É uma promessa com começo e fim, e o cliente vai organizar o dia dele em cima dela. Antes de escolher, conte a ida, os outros serviços do dia, o tempo de comprar material. Prometer menos e cumprir vale muito mais do que prometer cedo e chegar tarde.' },
      { kind: 'p', text: 'No dia, às 7h, o app te lembra do serviço e pede para você confirmar. Confirme. Do outro lado, aquela cliente das 6h40 recebe um aviso e respira: ele vem. E se algo der errado no caminho, avise antes do horário, não depois. "Vou chegar umas 10h30, tudo bem?" às 8h é cuidado. Às 11h50 é desculpa.' },
      { kind: 'h', text: 'Quando não dá mesmo' },
      { kind: 'p', text: 'Às vezes não dá. Um filho doente, um serviço anterior que complicou. Nesse caso, o que separa o profissional sério do resto é quando ele avisa.' },
      { kind: 'p', text: 'Se você sabe na véspera, use Remarcar no serviço e proponha outro dia. O cliente aceita a nova data e ninguém perde nada. Cancelar também é possível: até 12 horas antes do começo do período combinado, sem nenhuma consequência.' },
      { kind: 'p', text: 'Depois disso, até o fim do dia do serviço, é cancelamento em cima da hora. O app pede um motivo, que vai para o chat do cliente. E ele conta: três cancelamentos em cima da hora em 30 dias pausam os seus pedidos por 7 dias. Se isso virar costume, a taxa de cancelamento em cima da hora aparece no seu perfil, para todo cliente ver antes de te chamar.' },
      { kind: 'p', text: 'Pode parecer duro. Mas lembre da cliente da folga perdida. Cada regra dessas existe por causa de alguém que esperou no portão.' },
      { kind: 'h', text: 'O final que você escolhe' },
      { kind: 'p', text: 'Agora imagine a mesma terça com você no controle. Na sexta anterior, você viu que a terça estava cheia e propôs a tarde. Ela trocou a folga. Na terça, às 7h, você confirmou. Às 13h10, tocou a campainha, se apresentou pelo nome e disse que veio pela Rezolveaê. Trocou o disjuntor, testou, tirou a foto do quadro pronto e marcou Serviço feito.' },
      { kind: 'p', text: 'À noite, chega a avaliação. Cinco estrelas e um comentário: "Chegou na hora". Parece pouco. Para quem lê antes de chamar alguém, é tudo.' },
    ],
    questions: [
      {
        question: 'Por que o atraso das 11h50 pesou tanto para a cliente?',
        options: [
          'Ela tirou folga contando com a manhã',
          'Porque ficou mais caro',
          'Porque o app cobra uma multa da cliente quando o serviço atrasa',
          'Porque o disjuntor acabou queimando de vez enquanto ela esperava',
        ],
        why: 'O período combinado é uma promessa: o cliente organiza o dia em cima dela.',
      },
      {
        question: 'Até quando dá para cancelar sem consequência?',
        options: [
          'Até 12 horas antes do período',
          'Até 1 hora antes do horário em que você ia chegar',
          'Até o fim do dia do serviço, desde que explique o motivo',
          'A qualquer momento, desde que avise o cliente pelo chat',
        ],
        why: 'Depois de 12 horas antes do começo do período, até o fim do dia, conta como em cima da hora.',
      },
      {
        question: 'O que acontece com três cancelamentos em cima da hora em 30 dias?',
        options: [
          'Pedidos pausados por 7 dias',
          'Nada acontece',
          'A sua conta é excluída e você precisa criar outra',
          'Você paga uma multa para cada cliente que ficou esperando',
        ],
        why: 'A pausa de 7 dias protege os clientes de quem cancela em cima da hora com frequência.',
      },
      {
        question: 'Você percebe na véspera que não vai conseguir ir. O que é melhor fazer?',
        options: [
          'Remarcar pelo app na mesma hora e avisar o cliente pelo chat do serviço',
          'Esperar o dia chegar para ver se no fim dá tempo de ir',
          'Não ir e explicar depois, quando o cliente perguntar',
          'Cancelar no próprio dia, uma hora antes do horário'
        ],
        why: 'Na véspera, com mais de 12 horas de antecedência, remarcar não tem consequência e o cliente consegue se organizar.',
      },
    ],
    sources: [{ label: 'Regras de períodos, confirmação, remarcação e cancelamento na Rezolveaê (Ajuda do app)' }],
  },

  // ---------------------------------------------------------------------------
  // 5. MEI: a porta que se abre
  // ---------------------------------------------------------------------------
  {
    id: 'mei',
    title: 'A porta que pede nota',
    minutes: 5,
    summary: 'Uma proposta de trabalho fixo, um site que cobra para abrir o MEI e um boleto que chega pelo WhatsApp.',
    blocks: [
      { kind: 'p', text: 'Imagine que um dia o telefone toca e é a administradora de um condomínio grande. Ela viu as suas avaliações e quer você todo mês, para os serviços das áreas comuns. É o tipo de cliente que muda o ano: trabalho certo, pagamento certo.' },
      { kind: 'p', text: 'Até que ela pergunta: "Você emite nota fiscal, né? Precisamos do CNPJ para o cadastro."' },
      { kind: 'p', text: 'É nesse momento que muita gente descobre que estava trabalhando com uma porta fechada sem saber.' },
      { kind: 'h', text: 'A chave dessa porta' },
      { kind: 'p', text: 'O MEI, Microempreendedor Individual, é um CNPJ feito para quem trabalha por conta própria. Com ele, você emite nota fiscal e pode atender empresas, condomínios e lojas que só contratam assim.' },
      { kind: 'p', text: 'Mas a chave abre outra porta, que quase ninguém lembra até precisar. Imagine que você machuca as costas carregando material e fica um mês sem poder trabalhar. Quem paga as suas contas nesse mês? Sendo MEI e com as guias em dia, você contribui para o INSS e passa a ter direitos como auxílio-doença, salário-maternidade e aposentadoria. O CNPJ não é só para o cliente. É para você também.' },
      { kind: 'h', text: 'Quanto custa essa chave' },
      { kind: 'p', text: 'O MEI paga um valor fixo por mês, a guia chamada DAS. Em 2026, para quem presta serviço, são R$ 86,05: R$ 81,05 vão para o INSS, que é 5% do salário mínimo, e R$ 5 são de ISS, o imposto do município. Tanto faz se o mês foi forte ou fraco: o valor é o mesmo, e o imposto da sua nota já está pago ali dentro.' },
      { kind: 'p', text: 'Pode ser MEI quem fatura até R$ 81 mil por ano, cerca de R$ 6.750 por mês em média, e trabalha numa ocupação da lista permitida. A lista tem mais de 400 atividades e está no Portal do Empreendedor: bombeiro hidráulico e diarista, por exemplo, estão lá. Antes de abrir, confira a sua.' },
      { kind: 'h', text: 'O site que cobra trezentos' },
      { kind: 'p', text: 'Você pesquisa "abrir MEI" e o primeiro site, bonito, com a bandeira do Brasil, pede R$ 300 para "agilizar a abertura". Parece oficial. Seu dedo está quase no botão de pagar.' },
      { kind: 'p', text: 'Pare. Abrir o MEI é gratuito, e é feito só pelo gov.br, no Portal do Empreendedor. Site que cobra para abrir não é do governo. Repare no endereço: o governo termina em gov.br. Na dúvida, o Sebrae atende de graça pelo 0800 570 0800.' },
      { kind: 'h', text: 'O boleto que chega sozinho' },
      { kind: 'p', text: 'Meses depois, com o MEI aberto e tudo indo bem, chega uma mensagem no WhatsApp:' },
      { kind: 'say', from: 'Número desconhecido', text: 'URGENTE: seu MEI tem pendência. Pague hoje via Pix para evitar multa e cancelamento do CNPJ.' },
      { kind: 'p', text: 'O medo de perder o CNPJ faz a mão tremer. É exatamente com isso que o golpe conta. Assim que você abre o MEI, os dados da empresa ficam públicos, e golpistas usam isso para mandar cobranças falsas.' },
      { kind: 'p', text: 'Guarde isto: o DAS verdadeiro não chega por WhatsApp, SMS, e-mail nem pelo correio. É você que gera a guia, todo mês, no Portal do Empreendedor ou no app oficial do MEI. Mensagem que ameaça multa e só aceita Pix é golpe. Não pague, não clique, e confira no Portal.' },
      { kind: 'h', text: 'A primeira nota' },
      { kind: 'p', text: 'De volta ao condomínio. Fim do primeiro mês, a administradora pede a nota. Você entra no Emissor Nacional da nota de serviço, no site nfse.gov.br ou no app NFS-e Mobile, com a mesma conta gov.br que usa para tudo, nível prata ou ouro. Não precisa de certificado digital. Coloca o CNPJ do condomínio, descreve o serviço, o valor, e pronto.' },
      { kind: 'p', text: 'Para cliente empresa, como esse condomínio, a nota é obrigatória. Para pessoa física, você emite quando o cliente pedir. E uma vez por ano, até 31 de maio, você entrega a declaração do que faturou no ano anterior, a DASN-SIMEI, também de graça no Portal.' },
      { kind: 'p', text: 'Uma última coisa: as regras de imposto e de nota estão mudando com a reforma tributária. Quando surgir dúvida, confira no Sebrae ou com um contador antes de decidir.' },
      { kind: 'mark', text: 'O MEI não é papelada. É a chave que abre o cliente grande e que te protege no mês em que você não puder trabalhar.' },
      { kind: 'p', text: 'Na Rezolveaê, o pagamento do serviço é sempre direto entre você e o cliente. Com o MEI, você está pronto para qualquer um deles, inclusive os que pedem nota.' },
    ],
    questions: [
      {
        question: 'Além de emitir nota, o que o MEI garante a quem paga as guias em dia?',
        options: [
          'Direitos do INSS, como auxílio-doença',
          'Isenção de impostos',
          'Um empréstimo automático do governo no primeiro ano de CNPJ',
          'Preferência nos pedidos da Rezolveaê, na frente dos outros'
        ],
        why: 'O DAS inclui a contribuição ao INSS. Por isso o MEI protege você no mês em que não puder trabalhar.',
      },
      {
        question: 'Quanto custa abrir o MEI e onde se abre?',
        options: [
          'É gratuito, só pelo gov.br',
          'R$ 300, em sites especializados',
          'R$ 86,05, no cartório',
          'É gratuito em qualquer site que tenha a bandeira do Brasil',
        ],
        why: 'A abertura é de graça no Portal do Empreendedor. Site que cobra para abrir não é do governo.',
      },
      {
        question: 'Chega pelo WhatsApp uma cobrança do MEI ameaçando multa e pedindo Pix. O que fazer?',
        options: [
          'Não pagar e conferir no Portal',
          'Pagar logo, para não correr o risco de perder o CNPJ',
          'Responder a mensagem pedindo um desconto na multa',
          'Pagar metade agora e conferir o resto depois com calma',
        ],
        why: 'O DAS verdadeiro não chega por mensagem. É você que gera a guia no Portal.',
      },
      {
        question: 'Para qual cliente a nota fiscal de serviço do MEI é obrigatória?',
        options: [
          'Para cliente empresa',
          'Para todo cliente',
          'Só para os serviços que passam de R$ 1.000',
          'Para nenhum cliente, porque a nota do MEI é sempre opcional'
        ],
        why: 'Para empresa a nota é obrigatória. Para pessoa física, você emite quando ela pedir.',
      },
    ],
    sources: [
      { label: 'Portal do Empreendedor (gov.br): abrir o MEI, guia DAS e declaração anual', url: 'https://www.gov.br/empresas-e-negocios/pt-br/empreendedor' },
      { label: 'Contábeis: MEI em 2026, valores do DAS e limite (com o Sebrae Nacional)', url: 'https://www.contabeis.com.br/noticias/74842/mei-em-2026-veja-o-que-muda-no-das-nota-fiscal-e-regras/' },
      { label: 'Emissor Nacional da NFS-e', url: 'https://www.nfse.gov.br/EmissorNacional' },
      { label: 'Sebrae: alerta sobre golpes contra MEI', url: 'https://jornalcontabil.com.br/noticia/mei-sebrae-alerta-sobre-golpes-contra-empreendedores/' },
    ],
  },
];
