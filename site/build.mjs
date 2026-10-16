/**
 * Gera o site da Rezolveaê em public/.
 *
 * Os textos vêm do app (resolve-app), para o site nunca contradizer o que o app diz:
 * - serviços: supabase/seed.sql
 * - passo a passo e dúvidas: src/content/help.ts
 * - termos e privacidade: src/content/legal.ts (+ company.ts)
 * - ícones: src/components/iconPaths.ts
 *
 * Uso: node site/build.mjs
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SITE = dirname(fileURLToPath(import.meta.url));
const APP = join(SITE, '../resolve-app');
const OUT = join(SITE, 'public');
const ts = createRequire(join(APP, 'package.json'))('typescript');

/* ---------- Conteúdo do app ---------- */

/** Transpila os arquivos TS de conteúdo para um diretório temporário e importa. */
async function loadContent() {
  const dir = mkdtempSync(join(tmpdir(), 'rezolveae-site-'));
  const files = { company: 'src/content/company.ts', legal: 'src/content/legal.ts', help: 'src/content/help.ts', icons: 'src/components/iconPaths.ts' };
  for (const [name, path] of Object.entries(files)) {
    const src = readFileSync(join(APP, path), 'utf8');
    const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
    writeFileSync(join(dir, `${name}.mjs`), outputText.replace(/from '\.\/company'/g, "from './company.mjs'"));
  }
  const load = (name) => import(pathToFileURL(join(dir, `${name}.mjs`)).href);
  const [company, legal, help, icons] = await Promise.all(['company', 'legal', 'help', 'icons'].map(load));
  rmSync(dir, { recursive: true, force: true });
  return { company, LEGAL: legal.LEGAL, help, iconPaths: icons.iconPaths };
}

/** Lê id, ícone, título e subtítulo de cada serviço do catálogo, na ordem do seed. */
function loadServices() {
  const sql = readFileSync(join(APP, 'supabase/seed.sql'), 'utf8');
  const re = /\(\s*'([a-z-]+)', '([a-z-]+)', '([^']+)', '([^']+)',\s*'([^']+)'/g;
  const list = [...sql.matchAll(re)].map(([, id, icon, title, short, subtitle]) => ({ id, icon, title, short, subtitle }));
  if (list.length < 4) throw new Error('Não achei os serviços em supabase/seed.sql');
  return list;
}

const { company, LEGAL, help, iconPaths: appIcons } = await loadContent();
/** Ícones Lucide que só o site usa. */
const iconPaths = {
  ...appIcons,
  smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/> <path d="M12 18h.01"/>',
  instagram: '<rect width="20" height="20" x="2" y="2" rx="5" ry="5"/> <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/> <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>',
};
const services = loadServices();
const EMAIL = company.CONTACT_EMAIL;
const INSTAGRAM = 'rezolveae';
const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM}/`;

/* ---------- Ajudantes ---------- */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Texto corrido: escapa, destaca [campos a preencher] e transforma o e-mail em link. */
const prose = (s) =>
  esc(s)
    .replace(/\[([^\]]+)\]/g, '<mark title="A preencher">[$1]</mark>')
    .replaceAll(EMAIL, `<a href="mailto:${EMAIL}">${EMAIL}</a>`);

const isPlaceholder = (s) => /^\[.*\]$/.test(s);

function icon(name, { size = 24, duotone = false, stroke = 2 } = {}) {
  const paths = iconPaths[name];
  if (!paths) throw new Error(`Ícone desconhecido: ${name}`);
  const fill = duotone ? 'var(--brand)' : 'none';
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

/** Pergunta da Ajuda pelo texto exato; quebra o build se ela mudar no app. */
function topic(q) {
  const all = [...help.helpSections('cliente'), ...help.helpSections('profissional')].flatMap((s) => s.topics);
  const t = all.find((x) => x.q === q);
  if (!t) throw new Error(`Pergunta não encontrada em help.ts: "${q}"`);
  return t;
}

const storeButtons = `
  <div class="stores">
    <span class="store" aria-label="App Store, em breve">${icon('smartphone', { size: 20 })}<span><small>Em breve na</small>App Store</span></span>
    <span class="store" aria-label="Google Play, em breve">${icon('smartphone', { size: 20 })}<span><small>Em breve no</small>Google Play</span></span>
  </div>`;

function layout({ title, description, path, body, root }) {
  const base = root ? '' : '../';
  const nav = root
    ? `<nav class="nav" aria-label="Seções">
        <a href="#como-funciona">Como funciona</a>
        <a href="#profissionais">Para profissionais</a>
        <a href="#seguranca">Segurança</a>
        <a href="#duvidas">Dúvidas</a>
      </nav>
      <a class="btn btn-dark btn-sm" href="#baixar">Baixar o app</a>`
    : `<a class="btn btn-dark btn-sm" href="${base}">Conheça a Rezolveaê</a>`;
  const legalName = isPlaceholder(company.COMPANY) ? 'Rezolveaê' : `${esc(company.COMPANY)} · CNPJ ${esc(company.CNPJ)}`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#FFD900">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="Rezolveaê">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${base}assets/rezolveae-r.png">
<link rel="icon" type="image/png" href="${base}assets/favicon.png">
<link rel="preload" href="${base}assets/fonts/PlusJakartaSans_800ExtraBold.ttf" as="font" type="font/ttf" crossorigin>
<link rel="stylesheet" href="${base}style.css">${
    root
      ? `
<script>if (!matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('motion');</script>
<script src="main.js" defer></script>`
      : ''
  }
</head>
<body class="${root ? 'home' : 'page'}">
<a class="skip" href="#conteudo">Pular para o conteúdo</a>
<header class="header">
  <div class="wrap header-in">
    <a class="logo" href="${base}${root ? '#' : ''}" aria-label="Rezolveaê, início"><img class="logo-r" src="${base}assets/rezolveae-r.png" alt="" width="31" height="40"><img class="logo-word" src="${base}assets/rezolveae-wordmark.png" alt="Rezolveaê" width="148" height="24"></a>
    ${nav}
  </div>
</header>
<main id="conteudo">
${body}
</main>
<footer class="footer">
  <div class="wrap footer-in">
    <div>
      <img src="${base}assets/rezolveae-wordmark.png" alt="Rezolveaê" width="128" height="21" class="footer-logo">
      <p>Profissionais de confiança para a sua casa.</p>
    </div>
    <nav aria-label="Rodapé">
      <a href="mailto:${EMAIL}">${EMAIL}</a>
      <a class="footer-ig" href="${INSTAGRAM_URL}" target="_blank" rel="noopener">${icon('instagram', { size: 18 })}@${INSTAGRAM}</a>
      <a href="${base}termos/">Termos de uso</a>
      <a href="${base}privacidade/">Política de privacidade</a>
      <a href="${base}excluir-conta/">Excluir conta</a>
    </nav>
  </div>
  <div class="wrap footer-legal">© ${new Date().getFullYear()} ${legalName}</div>
</footer>
</body>
</html>
`;
}

/* ---------- Página inicial ---------- */

/** Moldura de celular com uma tela dentro. */
const phone = (screen, { cls = '', label } = {}) =>
  `<div class="phone ${cls}"${label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true"'}><div class="phone-screen">${screen}</div></div>`;

const avatar = (name, i, seal = false) =>
  `<span class="m-avatar m-avatar-${i % 3}">${name[0]}${seal ? `<span class="m-seal">${icon('badge-check', { size: 16, duotone: true, stroke: 2.25 })}</span>` : ''}</span>`;

const stars = (n = 5, size = 12) => `<span class="m-stars">${icon('star', { size, stroke: 1 }).repeat(n)}</span>`;

/** Barra de título das telas internas. */
const appBar = (title) => `<div class="m-bar">${icon('arrow-left', { size: 18 })}<b>${title}</b></div>`;

function homeScreen() {
  const tiles = services
    .slice(0, 8)
    .map((s) => `<div class="m-tile"><span class="m-tile-ico">${icon(s.icon, { size: 20, duotone: true })}</span><span>${esc(s.short)}</span></div>`)
    .join('');
  const pros = [
    ['Carlos', 'Eletricista', '4,9', '1,2'],
    ['Ana', 'Limpeza', '5,0', '2,4'],
    ['João', 'Encanador', '4,8', '3,1'],
  ]
    .map(
      ([n, s, r, km], i) => `<div class="m-pro">${avatar(n, i, i === 0)}<b>${n}</b><small>${s}</small>
        <small class="m-meta"><span class="m-star">${icon('star', { size: 10, stroke: 1 })}</span><b>${r}</b> · ${km} km</small></div>`,
    )
    .join('');
  return `<div class="m-top">
      <div class="m-row">
        <span class="m-address">${icon('map-pin', { size: 14, stroke: 2.25 })}Casa · Rua das Flores, 120</span>
        <span class="m-bell">${icon('bell', { size: 16 })}</span>
      </div>
      <p class="m-title">O que vamos resolver hoje?</p>
    </div>
    <div class="m-search">${icon('search', { size: 16 })}Do que você precisa?</div>
    <div class="m-body">
      <p class="m-h">Serviços <small>Ver todos</small></p>
      <div class="m-grid">${tiles}</div>
      <p class="m-h">Perto de você</p>
      <div class="m-pros">${pros}</div>
    </div>`;
}

/** As quatro telas do "Como funciona", uma por passo. */
const storyScreens = [
  // 1. Escolha o profissional
  () => `${appBar('Eletricista')}
    <div class="m-chips"><span class="on">Mais bem avaliados</span><span>Perto</span><span>Verificados</span></div>
    <div class="m-list">${[
      ['Carlos Souza', '4,9', '128', '1,2', '~15 min', true],
      ['Marcos Lima', '4,8', '86', '2,0', '~30 min', true],
      ['Paulo Reis', '4,7', '41', '3,4', '~1 h', false],
    ]
      .map(
        ([n, r, c, km, t, v], i) => `<div class="m-card">${avatar(n, i, v)}<div class="m-card-txt"><b>${n}</b>
          <small><span class="m-star">${icon('star', { size: 10, stroke: 1 })}</span> <b>${r}</b> (${c}) · ${km} km</small>
          <small>Responde em ${t}</small></div></div>`,
      )
      .join('')}</div>`,
  // 2. Conte o que precisa
  () => `${appBar('Carlos')}
    <div class="m-chat">
      <div class="m-req"><small>PEDIDO</small><b>Chuveiro não esquenta</b><span>Liguei e só sai água fria. Disjuntor já foi trocado.</span>
        <div class="m-photos"><i></i><i></i></div>
        <small>${icon('calendar', { size: 12 })} Esta semana · Centro</small></div>
      <div class="m-msg in">Oi! Consigo ir sexta à tarde. É chuveiro de qual marca?</div>
      <div class="m-msg out">Lorenzetti, tem uns 3 anos</div>
      <div class="m-typing"><i></i><i></i><i></i></div>
    </div>`,
  // 3. Aceite a proposta
  () => `${appBar('Carlos')}
    <div class="m-chat">
      <div class="m-msg in">Provavelmente é a resistência. Te mando a proposta com a peça inclusa.</div>
      <div class="m-prop"><small>PROPOSTA</small><p class="m-price">R$ 180,00</p>
        <span>${icon('calendar-clock', { size: 14 })} Sex 17/10, tarde</span>
        <span>Troca da resistência, peça inclusa</span>
        <div class="m-btns"><span class="m-btn">Negociar</span><span class="m-btn m-btn-y">Aceitar</span></div></div>
    </div>`,
  // 4. Confirme e avalie
  () => `${appBar('Serviço')}
    <div class="m-done">
      <span class="m-check">${icon('check', { size: 28, stroke: 3 })}</span>
      <b>Serviço concluído</b>
      <small>Chuveiro · Carlos · Sex 17/10</small>
      <div class="m-rate"><p>Como foi com o Carlos?</p>${stars(5, 26)}</div>
      <div class="m-comment">Rápido e caprichoso, explicou tudo. Recomendo!</div>
      <span class="m-btn m-btn-y m-btn-full">Enviar avaliação</span>
    </div>`,
];

/** Divide um texto em palavras animáveis. `cls` vai em cada palavra. */
const words = (text, cls) =>
  text
    .split(' ')
    .map((w, i) => `<span class="${cls}" style="--i:${i}">${esc(w)}</span>`)
    .join(' ');

/* ---------- Para profissionais ---------- */

/** Os seis recursos da lista de profissionais, cada um com uma mini tela do app. */
const proFeatures = [
  {
    icon: 'message-circle',
    title: 'Pedidos chegam no chat',
    text: 'O cliente conta o que precisa, com fotos e o bairro.',
    mini: `<div class="mini"><small class="mini-k">PEDIDO NOVO · há 5 min</small><b>Chuveiro não esquenta</b><span>Ana · Centro · Esta semana</span>
      <span class="mini-row">${icon('calendar-clock', { size: 14 })}Enviar proposta${icon('chevron-right', { size: 14 })}</span></div>`,
  },
  {
    icon: 'banknote',
    title: 'Você dá o preço',
    text: 'Mande valor e data. O cliente aceita ou negocia.',
    mini: `<div class="mini"><small class="mini-k">PROPOSTA</small><b class="mini-price">R$ 180,00</b><span>${icon('calendar-clock', { size: 14 })} Sex 17/10, tarde</span>
      <span class="mini-tag">${icon('check', { size: 12, stroke: 3 })} Aceita</span></div>`,
  },
  {
    icon: 'calendar',
    title: 'Agenda em ordem',
    text: 'Tudo o que foi combinado, em ordem de data.',
    mini: `<div class="mini mini-list">
      <div><span><b>Hoje, à tarde</b><small>Chuveiro · Ana · Centro</small></span><b>R$ 180</b></div>
      <div><span><b>Amanhã, de manhã</b><small>Tomada · Paulo · Jardins</small></span><b>R$ 90</b></div>
      <div><span><b>Sex, à tarde</b><small>Lustre · Rita · Pituba</small></span><b>R$ 150</b></div></div>`,
  },
  {
    icon: 'badge-check',
    title: 'Selo Verificado',
    text: 'Documento e selfie conferidos pela nossa equipe.',
    mini: `<div class="mini mini-pro">${avatar('Carlos', 0, true)}<span><b>Carlos Souza</b><small>Eletricista · 8 anos</small><span class="mini-seal">${icon('badge-check', { size: 14, duotone: true, stroke: 2.25 })} Verificado</span></span></div>`,
  },
  {
    icon: 'star',
    title: 'Avaliações que contam',
    text: 'Só avalia quem contratou. Trabalho bem feito vira vitrine.',
    mini: `<div class="mini"><span class="mini-rate"><b>4,9</b>${stars(5, 16)}</span><small>128 avaliações</small><p class="mini-quote">“Rápido e caprichoso, explicou tudo.”<small>Ana</small></p></div>`,
  },
  {
    icon: 'clock',
    title: 'Pausa quando quiser',
    text: 'Desligue os pedidos e saia das buscas. O combinado continua.',
    mini: `<div class="mini mini-toggle"><span><b><i class="dot"></i>Recebendo pedidos</b><small>Eletricista · até 10 km do Centro</small></span><span class="switch"><i></i></span></div>`,
  },
];

/** Tela do painel do profissional; data-r marca as áreas explicadas ao lado. */
function proHomeScreen() {
  const badge = (n) => `<span class="pd-badge">${n}</span>`;
  return `<div class="ph-top" data-r="0">${badge(1)}
      <div class="ph-hello"><b>Olá, Carlos!</b>${avatar('Carlos', 0)}</div>
      <div class="ph-accept"><span><b><i class="dot"></i>Recebendo pedidos</b><small>Eletricista · até 10 km do Centro</small></span><span class="switch"><i></i></span></div>
    </div>
    <div class="ph-body">
      <div class="ph-block" data-r="1">${badge(2)}
        <p class="ph-h">Para responder <span class="ph-count">2</span></p>
        <div class="ph-req"><small>PEDIDO NOVO · há 5 min</small><b>Chuveiro não esquenta</b><span>Liguei e só sai água fria.</span><small>Ana · Centro · Esta semana</small>
          <span class="ph-send">Enviar proposta ${icon('chevron-right', { size: 14 })}</span></div>
      </div>
      <div class="ph-block" data-r="2">${badge(3)}
        <p class="ph-h">Agenda</p>
        <div class="ph-line"><span><b>Hoje, à tarde</b><small>Tomada · Paulo · Jardins</small></span><b>R$ 90</b></div>
        <div class="ph-line"><span><b>Sex, à tarde</b><small>Lustre · Rita · Pituba</small></span><b>R$ 150</b></div>
      </div>
      <div class="ph-block" data-r="3">${badge(4)}
        <div class="ph-month">${icon('calendar-clock', { size: 16 })}<span>Outubro · 12 serviços · R$ 2.340,00</span>${icon('chevron-right', { size: 14 })}</div>
      </div>
    </div>`;
}

const panelParts = [
  ['Recebendo pedidos', 'Ligado, você aparece para os clientes da sua região, nos serviços que escolheu. Precisa de folga? Desligue e saia das buscas: o que já está combinado continua.'],
  ['Para responder', 'Os pedidos novos chegam aqui e na notificação, com a descrição, as fotos e o bairro. Os urgentes vêm primeiro.'],
  ['Agenda', 'Os serviços combinados em ordem de data. No dia, chega um lembrete; quando terminar, toque em Serviço feito e mande fotos do trabalho pronto.'],
  ['Seu mês', 'Quantos serviços você fez no mês e quanto eles somam. Um toque abre o histórico completo.'],
];

const startSteps = [
  ['Baixe o app', 'Crie a conta com seu e-mail e escolha Sou profissional.'],
  ['Monte sua ficha', 'Escolha seus serviços, sua profissão e até onde você atende.'],
  ['Capriche no perfil', 'Foto, apresentação com sua experiência e telefone para o cliente ligar.'],
  ['Peça o selo', 'Documento e selfie. Nossa equipe confere e você recebe o aviso.'],
];

function proSection() {
  const lines = ['Seu serviço.', 'Seu preço.', 'Sua agenda.'];
  const items = proFeatures
    .map(
      (c, i) => `<li data-i="${i}"${i === 0 ? ' class="on"' : ''}><h3>${c.title}</h3><div class="pl-more"><div><p>${c.text}</p><div class="pl-inline">${c.mini}</div></div></div></li>`,
    )
    .join('');
  const shots = proFeatures.map((c, i) => `<div class="pl-shot${i === 0 ? ' on' : ''}" data-i="${i}">${c.mini}</div>`).join('');
  const parts = panelParts
    .map(([t, d], i) => `<li class="pd-item" data-part="${i}"><div><span class="pd-n">${i + 1}</span><h3>${t}</h3><p>${d}</p></div></li>`)
    .join('');
  const steps = startSteps
    .map(([t, d], i) => `<li class="start-step" data-reveal style="--i:${i}"><span class="start-n">${i + 1}</span><h3>${t}</h3><p>${d}</p></li>`)
    .join('');

  return `
<section class="pro-intro" id="profissionais" data-pin aria-labelledby="pro-t">
  <div class="pro-pin">
    <img class="pro-r" src="assets/rezolveae-r.png" alt="" width="797" height="1024">
    <div class="wrap pro-intro-in">
      <p class="pro-eyebrow">Para profissionais</p>
      <h2 id="pro-t" class="pro-lines">${lines.map((l, i) => `<span style="--i:${i}">${l}</span>`).join('')}</h2>
      <p class="pro-lead" style="--i:3">Os pedidos da sua região chegam no seu celular. Você conversa, manda o valor e recebe direto do cliente.</p>
    </div>
  </div>
</section>

<section class="pro-list" data-pin data-steps="${proFeatures.length}" aria-labelledby="pl-t">
  <div class="pl-pin">
    <div class="wrap pl-in">
      <div>
        <h2 id="pl-t">Tudo para você <em>trabalhar mais.</em></h2>
        <ol class="pl-items">${items}</ol>
      </div>
      <div class="pl-panel" aria-hidden="true">${shots}</div>
    </div>
  </div>
</section>

<section class="section pro-detail" aria-labelledby="pd-t">
  <div class="wrap">
    <h2 id="pd-t" data-reveal>Seu painel, por dentro</h2>
    <p class="sub" data-reveal style="--i:1">É a primeira tela que você vê ao abrir o app.</p>
    <div class="pd">
      <div class="pd-stage">${phone(proHomeScreen(), { cls: 'pd-phone', label: 'Painel do profissional no app Rezolveaê' })}</div>
      <ol class="pd-list">${parts}</ol>
    </div>
  </div>
</section>

<section class="start" aria-labelledby="start-t">
  <div class="wrap">
    <h2 id="start-t" data-reveal>Comece em 4 passos</h2>
    <ol class="start-list">${steps}</ol>
    <p class="start-note" data-reveal>O app chega em breve na App Store e no Google Play.</p>
  </div>
</section>`;
}

function home() {
  const serviceCards = services
    .map(
      (s, i) => `<li class="svc" data-reveal style="--i:${i % 4}">
        <span class="svc-ico">${icon(s.icon, { size: 28, duotone: true })}</span>
        <span><b>${esc(s.title)}</b><small>${esc(s.subtitle)}</small></span>
      </li>`,
    )
    .join('');

  const marquee = services.map((s) => `<span>${esc(s.title)}</span>${icon(s.icon, { size: 40, duotone: true })}`).join('');

  const stepsData = [
    ...help.howItWorks,
    { title: 'Confirme e avalie', text: 'Quando o serviço termina, você confirma que foi feito e dá sua nota. O pagamento é direto com o profissional.' },
  ];
  const steps = stepsData
    .map(
      (s, i) => `<li class="story-step" data-step="${i}">
        <div class="story-txt"><span class="step-n">${i + 1}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>
        ${phone(storyScreens[i](), { cls: 'phone-sm' })}
      </li>`,
    )
    .join('');
  const stickyScreens = storyScreens.map((f, i) => `<div class="story-screen${i === 0 ? ' on' : ''}" data-screen="${i}">${f()}</div>`).join('');

  const safety = [
    ['map-pin', 'Endereço protegido', topic('Quem vê meu endereço e telefone?').a],
    ['badge-check', 'Identidade conferida', 'Profissionais com o selo Verificado enviaram documento com foto e selfie, conferidos pela nossa equipe.'],
    ['star', 'Avaliações reais', 'Só quem contratou e confirmou o serviço pode avaliar o profissional.'],
    ['shield-check', 'Equipe de olho', 'Denuncie ou bloqueie qualquer conta direto no app. Nossa equipe analisa as denúncias em até 24 horas.'],
  ]
    .map(
      ([ic, t, d], i) =>
        `<li class="card" data-reveal style="--i:${i}"><span class="card-ico">${icon(ic, { size: 22, duotone: ic !== 'shield-check' })}</span><h3>${t}</h3><p>${esc(d)}</p></li>`,
    )
    .join('');

  const faq = [
    'Como funciona a proposta?',
    'Como pago o profissional?',
    'Como o serviço é concluído?',
    'O que é o selo Verificado?',
    'Como recebo pedidos?',
    'Como ganho o selo Verificado?',
  ]
    .map(topic)
    .map((t, i) => `<details class="faq" data-reveal style="--i:${i}"><summary>${esc(t.q)}${icon('chevron-down', { size: 20 })}</summary><p>${esc(t.a)}</p></details>`)
    .join('');

  const statement = 'Do chuveiro que queimou ao guarda-roupa novo, tem alguém perto de você pronto para resolver.';

  const body = `
<section class="hero" data-hero>
  <div class="wrap hero-in">
    <div class="hero-copy">
      <h1 class="hero-title">${words('O que vamos resolver hoje?', 'hw')}</h1>
      <p class="lead hero-fade" style="--d:.55s">Eletricista, encanador, montador, faxina e mais, perto de você. Peça orçamento, converse pelo chat e combine tudo pelo app.</p>
      <div class="hero-fade" style="--d:.7s">${storeButtons}</div>
    </div>
    <div class="hero-visual">
      ${phone(homeScreen(), { cls: 'phone-hero', label: 'Tela inicial do app Rezolveaê, com a busca, os serviços e profissionais perto de você' })}
    </div>
  </div>
</section>

<section class="statement" data-scroll data-from=".85" data-to=".3" aria-label="${esc(statement)}">
  <div class="wrap"><p aria-hidden="true" style="--n:${statement.split(' ').length}">${words(statement, 'sw')}</p></div>
</section>

<div class="marquee" aria-hidden="true"><div class="marquee-track">${marquee}${marquee}</div></div>

<section class="section" id="servicos" aria-labelledby="servicos-t">
  <div class="wrap">
    <h2 id="servicos-t" data-reveal>Para a casa toda</h2>
    <p class="sub" data-reveal style="--i:1">Os serviços que mais aparecem no dia a dia de uma casa.</p>
    <ul class="svc-grid">${serviceCards}</ul>
  </div>
</section>

<section class="section section-muted" id="como-funciona" aria-labelledby="como-t">
  <div class="wrap">
    <h2 id="como-t" data-reveal>Como funciona</h2>
    <p class="sub" data-reveal style="--i:1">Sem formulário longo e sem intermediário: você fala direto com quem vai fazer.</p>
    <div class="story">
      <ol class="story-steps">${steps}</ol>
      <div class="story-stage">${phone(stickyScreens, { cls: 'phone-story' })}</div>
    </div>
  </div>
</section>

${proSection()}

<section class="section" id="seguranca" aria-labelledby="seg-t">
  <div class="wrap">
    <h2 id="seg-t" data-reveal>Segurança dos dois lados</h2>
    <p class="sub" data-reveal style="--i:1">Regras pensadas para quem abre a porta de casa e para quem vai até ela.</p>
    <ul class="cards">${safety}</ul>
  </div>
</section>

<section class="section section-muted" id="duvidas" aria-labelledby="duv-t">
  <div class="wrap narrow">
    <h2 id="duv-t" data-reveal>Dúvidas</h2>
    <div class="faqs">${faq}</div>
    <p class="faq-more" data-reveal>Outra dúvida? Escreva para <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>
  </div>
</section>

<section class="cta" id="baixar" aria-labelledby="baixar-t">
  <div class="wrap cta-in">
    <img src="assets/rezolveae-r.png" alt="" width="78" height="100" class="cta-r" data-reveal>
    <h2 id="baixar-t" data-reveal style="--i:1">Chegando nas lojas</h2>
    <p data-reveal style="--i:2">O Rezolveaê está quase pronto para iPhone e Android.</p>
    <div data-reveal style="--i:3">${storeButtons}</div>
    <a class="cta-ig" href="${INSTAGRAM_URL}" target="_blank" rel="noopener" data-reveal style="--i:4">${icon('instagram', { size: 20 })}Enquanto isso, siga <b>@${INSTAGRAM}</b></a>
  </div>
</section>`;

  return layout({
    root: true,
    title: 'Rezolveaê — profissionais para a sua casa',
    description: 'Encontre eletricista, encanador, montador, faxina e mais perto de você. Peça orçamento, converse pelo chat e combine tudo pelo app Rezolveaê.',
    body,
  });
}

/* ---------- Páginas legais ---------- */

function legalPage(doc, { description, extra = '' }) {
  const sections = doc.sections
    .map((s) => `<h2>${esc(s.title)}</h2>${s.body.map((p) => `<p>${prose(p)}</p>`).join('')}`)
    .join('\n');
  const body = `
<article class="wrap narrow doc">
  <h1>${esc(doc.title)}</h1>
  <p class="doc-date">Última atualização: ${prose(doc.updated)}</p>
  <p class="doc-intro">${prose(doc.intro)}</p>
  ${extra}
  ${sections}
</article>`;
  return layout({ title: `${doc.title} · Rezolveaê`, description, body });
}

function deletionPage() {
  const retention = LEGAL.privacidade.sections.find((s) => s.title === 'Por quanto tempo');
  if (!retention) throw new Error('Seção "Por quanto tempo" não encontrada em legal.ts');
  return legalPage(
    {
      title: 'Excluir sua conta',
      updated: LEGAL.privacidade.updated,
      intro: 'Você pode excluir sua conta da Rezolveaê e os dados ligados a ela a qualquer momento.',
      sections: [
        { title: 'Pelo app', body: ['Abra o app e toque em Perfil → Conta e privacidade → Excluir conta. A exclusão é imediata.'] },
        {
          title: 'Sem acesso ao app',
          body: [`Escreva para ${EMAIL} a partir do e-mail cadastrado na sua conta, pedindo a exclusão. Confirmamos por e-mail quando estiver feito.`],
        },
        // O parágrafo da privacidade começa respondendo "por quanto tempo"; aqui só interessa o que acontece ao excluir.
        { title: 'O que é apagado e o que fica', body: retention.body.map((p) => p.replace(/^Enquanto sua conta existir\.\s*/, '')) },
      ],
    },
    { description: 'Como excluir sua conta da Rezolveaê e quais dados são apagados.' },
  );
}

/* ---------- Saída ---------- */

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(SITE, 'assets'), join(OUT, 'assets'), { recursive: true });
cpSync(join(SITE, 'style.css'), join(OUT, 'style.css'));
cpSync(join(SITE, 'main.js'), join(OUT, 'main.js'));

const pages = {
  'index.html': home(),
  'termos/index.html': legalPage(LEGAL.termos, { description: 'Termos de uso do app Rezolveaê.' }),
  'privacidade/index.html': legalPage(LEGAL.privacidade, { description: 'Como a Rezolveaê trata seus dados, conforme a LGPD.' }),
  'excluir-conta/index.html': deletionPage(),
};
for (const [path, html] of Object.entries(pages)) {
  mkdirSync(dirname(join(OUT, path)), { recursive: true });
  writeFileSync(join(OUT, path), html);
}
console.log(`Site gerado em ${OUT}: ${Object.keys(pages).join(', ')}`);
