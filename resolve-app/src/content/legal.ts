/**
 * Termos de uso e Política de privacidade (mostrados em /legal/termos e /legal/privacidade).
 *
 * RASCUNHO: descreve o que o app faz hoje, mas precisa de revisão jurídica.
 * Complete os campos entre colchetes antes de publicar nas lojas. As lojas
 * também pedem a política num endereço público (URL).
 */
export type LegalDoc = { title: string; updated: string; intro: string; sections: { title: string; body: string[] }[] };

const COMPANY = '[RAZÃO SOCIAL]';
const CNPJ = '[CNPJ]';
const EMAIL = '[E-MAIL DE CONTATO]';

export const LEGAL: Record<'termos' | 'privacidade', LegalDoc> = {
  termos: {
    title: 'Termos de uso',
    updated: '[DATA]',
    intro: `Estes termos valem para o uso do aplicativo Resolve, oferecido por ${COMPANY}, CNPJ ${CNPJ}. Ao criar uma conta, você concorda com eles.`,
    sections: [
      {
        title: 'O que é o Resolve',
        body: [
          'O Resolve aproxima clientes e profissionais autônomos de serviços para casa. O cliente descreve o que precisa, o profissional envia uma proposta e os dois combinam tudo pelo chat.',
          'O Resolve não presta os serviços, não é parte do acordo entre cliente e profissional e não intermedeia o pagamento: o valor é combinado e pago diretamente entre os dois.',
        ],
      },
      {
        title: 'Sua conta',
        body: [
          'Para usar o Resolve você precisa ter 18 anos ou mais e informar dados verdadeiros. O acesso é feito por um código enviado ao seu e-mail; não compartilhe esse código com ninguém.',
          'Você é responsável pelo que acontece na sua conta. Pode excluí-la a qualquer momento em Perfil → Conta e privacidade → Excluir conta.',
        ],
      },
      {
        title: 'Para profissionais',
        body: [
          'As informações da sua ficha (profissão, experiência, serviços) devem ser verdadeiras. Você é responsável pela qualidade e segurança do serviço, pelas habilitações exigidas por lei e pelos tributos sobre o que recebe.',
        ],
      },
      {
        title: 'Para clientes',
        body: [
          'Descreva o serviço com honestidade, garanta o acesso combinado ao local e pague o valor acordado diretamente ao profissional.',
        ],
      },
      {
        title: 'Conduta: tolerância zero',
        body: [
          'Não é permitido, em mensagens, fotos, avaliações ou perfis: assédio, ameaças, ofensas, discriminação, conteúdo sexual ou violento, golpes, pedidos de pagamento fora do combinado, dados pessoais de terceiros sem autorização ou qualquer atividade ilegal.',
          'Conteúdo ou contas que violem estas regras podem ser removidos, sem aviso prévio.',
        ],
      },
      {
        title: 'Denúncias e bloqueios',
        body: [
          'Você pode denunciar e bloquear qualquer pessoa pelo menu do chat ou pelo perfil do profissional. Quem é bloqueado não consegue mais enviar mensagens, pedidos ou propostas para você.',
          'Analisamos as denúncias em até 24 horas e podemos remover o conteúdo e suspender ou excluir a conta de quem descumprir estes termos.',
        ],
      },
      {
        title: 'Avaliações',
        body: [
          'Depois de um serviço concluído, o cliente pode avaliar o profissional. A avaliação aparece no perfil público dele, com o primeiro nome de quem avaliou. Avaliações falsas ou ofensivas podem ser removidas.',
        ],
      },
      {
        title: 'Responsabilidade',
        body: [
          'O Resolve se esforça para manter o app funcionando e seguro, mas não garante a qualidade, a pontualidade ou o resultado dos serviços combinados entre usuários, nem responde por danos decorrentes deles, nos limites da lei.',
        ],
      },
      {
        title: 'Mudanças e lei aplicável',
        body: [
          'Podemos atualizar estes termos; avisaremos no app quando houver mudanças importantes. Vale a lei brasileira, e fica eleito o foro de [CIDADE/UF], salvo regra legal em contrário (como a do consumidor).',
          `Dúvidas: ${EMAIL}.`,
        ],
      },
    ],
  },

  privacidade: {
    title: 'Política de privacidade',
    updated: '[DATA]',
    intro: `Esta política explica quais dados o Resolve trata, para quê e quais são os seus direitos, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018). O controlador é ${COMPANY}, CNPJ ${CNPJ}. Encarregado de dados: [NOME DO ENCARREGADO], ${EMAIL}.`,
    sections: [
      {
        title: 'Dados que coletamos',
        body: [
          'Conta: e-mail, nome, se você é cliente ou profissional e, se quiser, foto e telefone.',
          'Endereços que você salva (rua, número, complemento, bairro, cidade, UF e CEP).',
          'Pedidos e conversas: descrição do serviço, data desejada, fotos que você envia, mensagens, propostas, serviços combinados e avaliações.',
          'Profissionais: profissão, apresentação, tempo de experiência e serviços oferecidos.',
          'Aparelho: o identificador para notificações (se você permitir) e registros técnicos de acesso.',
        ],
      },
      {
        title: 'Para que usamos',
        body: [
          'Para fazer o app funcionar (contrato): entrar na conta, enviar pedidos, conversar, combinar e acompanhar serviços, avisar sobre mensagens.',
          'Para segurança (legítimo interesse): prevenir fraudes e abusos e analisar denúncias.',
          'Para cumprir a lei: guardar registros de acesso pelo prazo do Marco Civil da Internet.',
          'Não vendemos seus dados nem os usamos para publicidade de terceiros.',
        ],
      },
      {
        title: 'O que o outro lado vê',
        body: [
          'Cliente e profissional veem o nome e a foto um do outro. Antes de combinar, o profissional vê só o bairro e a cidade do pedido. O endereço completo e o telefone só aparecem depois que vocês combinam um serviço.',
          'O perfil do profissional e as avaliações são públicos. Nas avaliações aparece só o primeiro nome de quem avaliou.',
        ],
      },
      {
        title: 'Com quem compartilhamos',
        body: [
          'Com prestadores que operam o app para nós: Supabase (banco de dados, arquivos e login), Expo (envio de notificações), o serviço de e-mail que envia o código de acesso e o ViaCEP (consulta do CEP que você digita). Alguns deles podem tratar dados fora do Brasil, com as garantias exigidas pela LGPD.',
          'Com autoridades, quando a lei exigir.',
        ],
      },
      {
        title: 'Por quanto tempo',
        body: [
          'Enquanto sua conta existir. Ao excluir a conta, apagamos seu login, nome, foto, telefone, endereços, favoritos e ficha de profissional. Conversas, serviços e avaliações continuam para a outra pessoa, sem seu nome (aparece "Conta excluída"). Registros de acesso e denúncias são guardados pelo tempo exigido por lei ou necessário à segurança.',
        ],
      },
      {
        title: 'Seus direitos',
        body: [
          'Você pode confirmar se tratamos seus dados, acessá-los, corrigi-los, pedir a portabilidade, a exclusão ou informações sobre o compartilhamento, e revogar consentimentos. Boa parte disso está no próprio app (Perfil); para o resto, escreva para ' + EMAIL + '.',
        ],
      },
      {
        title: 'Segurança',
        body: [
          'Os dados trafegam criptografados e o acesso a eles é limitado por regras no banco de dados: cada pessoa só lê o que lhe diz respeito.',
        ],
      },
      {
        title: 'Menores de idade',
        body: ['O Resolve não é destinado a menores de 18 anos.'],
      },
      {
        title: 'Mudanças',
        body: ['Se esta política mudar, avisaremos no app. A data da última atualização fica no topo.'],
      },
    ],
  },
};
