/**
 * Central de ajuda (/ajuda): perguntas frequentes.
 * As respostas descrevem o que o app faz hoje; ao mudar um fluxo, revise aqui.
 */
export type HelpTopic = { q: string; a: string };
export type HelpSection = { title: string; topics: HelpTopic[] };

const CLIENT: HelpSection = {
  title: 'Pedidos e serviços',
  topics: [
    {
      q: 'Como peço um orçamento?',
      a: 'Escolha o serviço na tela inicial ou na busca, abra o perfil de um profissional e toque em Pedir orçamento. Conte o que precisa, quando e onde, e mande fotos se ajudar. O pedido chega no chat do profissional.',
    },
    {
      q: 'Como funciona a proposta?',
      a: 'O profissional responde no chat com o valor e quando pode ir. Você aceita, recusa ou toca em Negociar para sugerir outro valor. Ao aceitar, o serviço fica combinado e aparece em Pedidos.',
    },
    {
      q: 'Como pago o profissional?',
      a: 'Direto a ele, no valor combinado e do jeito que vocês acertarem. O Resolve não intermedeia o pagamento.',
    },
    {
      q: 'Quem vê meu endereço e telefone?',
      a: 'Antes de combinar, o profissional vê só o bairro e a cidade. O endereço completo e o telefone aparecem para ele depois que você aceita uma proposta.',
    },
    {
      q: 'Como cancelo?',
      a: 'Antes de combinar, toque em Cancelar pedido no card do pedido, no chat. Depois de combinado, abra o serviço em Pedidos e toque em Cancelar serviço. Avise o profissional pelo chat.',
    },
    {
      q: 'Como avalio o profissional?',
      a: 'Quando o serviço for marcado como concluído, abra-o em Pedidos e dê sua nota. A avaliação aparece no perfil do profissional com o seu primeiro nome.',
    },
    {
      q: 'O que é o selo Verificado?',
      a: 'O profissional enviou um documento com foto e uma selfie segurando o documento, e nossa equipe confirmou a identidade dele. O selo não garante a qualidade do serviço: veja também as avaliações.',
    },
    {
      q: 'Quero oferecer meus serviços',
      a: 'Crie uma conta de profissional: saia da sua conta e entre com outro e-mail, escolhendo Sou profissional.',
    },
  ],
};

const PRO: HelpSection = {
  title: 'Pedidos e propostas',
  topics: [
    {
      q: 'Como recebo pedidos?',
      a: 'Complete sua ficha em Perfil → Editar ficha, com os serviços que você faz e onde atende. Os clientes da sua região encontram você na lista do serviço e mandam o pedido pelo chat.',
    },
    {
      q: 'Como envio uma proposta?',
      a: 'No chat do pedido, toque em Enviar proposta e informe o valor e quando você pode ir. O cliente aceita, recusa ou negocia. Se precisar mudar algo, envie uma nova proposta: ela substitui a anterior.',
    },
    {
      q: 'Posso recusar um pedido?',
      a: 'Sim. No card do pedido, no chat, toque em Recusar pedido. O cliente vê no chat que o pedido foi recusado.',
    },
    {
      q: 'Quando vejo o endereço e o telefone do cliente?',
      a: 'Depois que o cliente aceita sua proposta. Antes disso, você vê só o bairro e a cidade.',
    },
    {
      q: 'Como ganho o selo Verificado?',
      a: 'Em Perfil → Selo Verificado, envie a foto de um documento com foto e uma selfie segurando o documento. Nossa equipe analisa e você recebe um aviso. As fotos são apagadas depois da análise.',
    },
    {
      q: 'Como recebo o pagamento?',
      a: 'Direto do cliente, no valor combinado. O Resolve não intermedeia o pagamento.',
    },
  ],
};

const ACCOUNT: HelpSection = {
  title: 'Conta e segurança',
  topics: [
    {
      q: 'Não recebi o código de acesso',
      a: 'Confira se o e-mail está certo e olhe a caixa de spam. Se não chegar, espere o tempo indicado na tela e toque em Reenviar código.',
    },
    {
      q: 'Como bloqueio ou denuncio alguém?',
      a: 'No chat, toque no menu ⋮ e escolha Bloquear ou Denunciar. Quem é bloqueado não consegue mais mandar mensagens, pedidos ou propostas para você. Analisamos as denúncias em até 24 horas.',
    },
    {
      q: 'Como excluo minha conta?',
      a: 'Em Perfil → Conta e privacidade → Excluir minha conta. A tela mostra o que é apagado e o que continua para quem conversou com você.',
    },
  ],
};

/** Seções na ordem de quem está vendo. */
export function helpSections(role: 'cliente' | 'profissional' | undefined): HelpSection[] {
  return role === 'profissional' ? [PRO, ACCOUNT] : [CLIENT, ACCOUNT];
}
