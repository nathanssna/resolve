/**
 * Gera o site da Rezolveaê em public/.
 *
 * Os textos vêm do app (resolve-app), para o site nunca contradizer o que o app diz:
 * - serviços: supabase/seed.sql
 * - passo a passo e dúvidas: src/content/help.ts
 * - aulas e testes do profissional: src/content/lessons.ts e supabase/quiz/*.json
 * - termos e privacidade: src/content/legal.ts (+ company.ts)
 * - ícones: src/components/iconPaths.ts
 *
 * Uso: node site/build.mjs
 */
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  const files = {
    company: 'src/content/company.ts',
    legal: 'src/content/legal.ts',
    help: 'src/content/help.ts',
    lessons: 'src/content/lessons.ts',
    icons: 'src/components/iconPaths.ts',
  };
  for (const [name, path] of Object.entries(files)) {
    const src = readFileSync(join(APP, path), 'utf8');
    const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
    writeFileSync(join(dir, `${name}.mjs`), outputText.replace(/from '\.\/company'/g, "from './company.mjs'"));
  }
  const load = (name) => import(pathToFileURL(join(dir, `${name}.mjs`)).href);
  const [company, legal, help, lessons, icons] = await Promise.all(Object.keys(files).map(load));
  rmSync(dir, { recursive: true, force: true });
  return { company, LEGAL: legal.LEGAL, help, LESSONS: lessons.LESSONS, iconPaths: icons.iconPaths };
}

/** Lê id, ícone, título e subtítulo de cada serviço do catálogo, na ordem do seed. */
function loadServices() {
  const sql = readFileSync(join(APP, 'supabase/seed.sql'), 'utf8');
  const re = /\(\s*'([a-z-]+)', '([a-z-]+)', '([^']+)', '([^']+)',\s*'([^']+)'/g;
  const list = [...sql.matchAll(re)].map(([, id, icon, title, short, subtitle]) => ({ id, icon, title, short, subtitle }));
  if (list.length < 4) throw new Error('Não achei os serviços em supabase/seed.sql');
  return list;
}

/** Quantas questões cada teste sorteia (supabase/quiz/<serviço>.json). */
function loadQuizDraws() {
  const dir = join(APP, 'supabase/quiz');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')).draw);
}

const { company, LEGAL, help, LESSONS, iconPaths: appIcons } = await loadContent();
/** Ícones Lucide que só o site usa. */
const iconPaths = {
  ...appIcons,
  smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/> <path d="M12 18h.01"/>',
};
const services = loadServices();
const quizDraws = loadQuizDraws();
const lessonMinutes = LESSONS.reduce((m, l) => m + l.minutes, 0);
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

/** Links do cabeçalho de cada página com animações; as páginas legais só têm o botão de voltar. */
const navs = {
  home: [
    ['#como-funciona', 'Como funciona'],
    ['#seguranca', 'Segurança'],
    ['profissionais/', 'Para profissionais'],
    ['#duvidas', 'Dúvidas'],
  ],
  pro: [
    ['#entrar', 'Como entrar'],
    ['#dia-a-dia', 'No dia a dia'],
    ['#duvidas', 'Dúvidas'],
    ['../', 'Para clientes'],
  ],
};

/** `page`: 'home' (raiz), 'pro' (/profissionais/) ou vazio (páginas legais). */
function layout({ title, description, body, page }) {
  const root = page === 'home';
  const base = root ? '' : '../';
  const nav = page
    ? `<nav class="nav" aria-label="Seções">
        ${navs[page].map(([href, label]) => `<a href="${href}">${label}</a>`).join('\n        ')}
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
<link rel="apple-touch-icon" href="${base}assets/apple-touch-icon.png">
<link rel="preload" href="${base}assets/fonts/PlusJakartaSans_800ExtraBold.ttf" as="font" type="font/ttf" crossorigin>
<link rel="stylesheet" href="${base}style.css">${
    page
      ? `
<script>if (!matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('motion');</script>
<script src="${base}main.js" defer></script>`
      : ''
  }
</head>
<body class="${page ? `home${page === 'pro' ? ' pro-page' : ''}` : 'page'}">
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
      <a href="${base}profissionais/">Para profissionais</a>
      <a class="footer-ig" href="${INSTAGRAM_URL}" target="_blank" rel="noopener">@${INSTAGRAM}</a>
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

/* ---------- Partes comuns ---------- */

/** Perguntas da Ajuda em sanfona. */
const faqList = (questions) =>
  questions
    .map(topic)
    .map((t, i) => `<details class="faq" data-reveal style="--i:${i}"><summary>${esc(t.q)}${icon('chevron-down', { size: 20 })}</summary><p>${esc(t.a)}</p></details>`)
    .join('');

const ctaSection = (base = '') => `
<section class="cta" id="baixar" aria-labelledby="baixar-t">
  <div class="wrap cta-in">
    <img src="${base}assets/rezolveae-r.png" alt="" width="78" height="100" class="cta-r" data-reveal>
    <h2 id="baixar-t" data-reveal style="--i:1">Chegando nas lojas</h2>
    <p data-reveal style="--i:2">O Rezolveaê está quase pronto para iPhone e Android.</p>
    <div data-reveal style="--i:3">${storeButtons}</div>
    <a class="cta-ig" href="${INSTAGRAM_URL}" target="_blank" rel="noopener" data-reveal style="--i:4">Enquanto isso, siga <b>@${INSTAGRAM}</b></a>
  </div>
</section>`;

/* ---------- Para profissionais ---------- */

/** Os recursos da lista de profissionais, cada um com uma mini tela do app. */
const proFeatures = [
  {
    title: 'Pedidos chegam no chat',
    text: 'O cliente conta o que precisa, com fotos e o bairro.',
    mini: `<div class="mini"><small class="mini-k">PEDIDO NOVO · há 5 min</small><b>Chuveiro não esquenta</b><span>Ana · Centro · Esta semana</span>
      <span class="mini-row">${icon('calendar-clock', { size: 14 })}Enviar proposta${icon('chevron-right', { size: 14 })}</span></div>`,
  },
  {
    title: 'Você dá o preço',
    text: 'Mande valor e data. O cliente aceita ou negocia.',
    mini: `<div class="mini"><small class="mini-k">PROPOSTA</small><b class="mini-price">R$ 180,00</b><span>${icon('calendar-clock', { size: 14 })} Sex 17/10, tarde</span>
      <span class="mini-tag">${icon('check', { size: 12, stroke: 3 })} Aceita</span></div>`,
  },
  {
    title: 'Agenda em ordem',
    text: 'Tudo o que foi combinado, em ordem de data.',
    mini: `<div class="mini mini-list">
      <div><span><b>Hoje, à tarde</b><small>Chuveiro · Ana · Centro</small></span><b>R$ 180</b></div>
      <div><span><b>Amanhã, de manhã</b><small>Tomada · Paulo · Jardins</small></span><b>R$ 90</b></div>
      <div><span><b>Sex, à tarde</b><small>Lustre · Rita · Pituba</small></span><b>R$ 150</b></div></div>`,
  },
  {
    title: 'Avaliações que contam',
    text: 'Só avalia quem contratou. Trabalho bem feito vira vitrine.',
    mini: `<div class="mini"><span class="mini-rate"><b>4,9</b>${stars(5, 16)}</span><small>128 avaliações</small><p class="mini-quote">“Rápido e caprichoso, explicou tudo.”<small>Ana</small></p></div>`,
  },
  {
    title: 'Pausa quando quiser',
    text: 'Desligue os pedidos e saia das buscas. O combinado continua.',
    mini: `<div class="mini mini-toggle"><span><b><i class="dot"></i>Recebendo pedidos</b><small>Eletricista · até 10 km do Centro</small></span><span class="switch"><i></i></span></div>`,
  },
];

/** Os quatro passos do "Para começar" do app (ficha → teste → identidade → aulas). */
const entrySteps = [
  ['Monte sua ficha', 'Seus serviços, sua profissão e até onde você atende.'],
  [
    'Passe no teste',
    `Um por serviço, com ${Math.min(...quizDraws)} a ${Math.max(...quizDraws)} questões de segurança e do jeito certo de fazer. Não passou? Tente de novo em 3 dias, com outras questões.`,
  ],
  ['Confirme quem você é', 'Foto de um documento e uma selfie. Nossa equipe confere em até 24 h e as fotos são apagadas depois.'],
  [
    'Faça as aulas',
    `${LESSONS.length} aulas curtas sobre orçamento, fotos, chat, data combinada e MEI. Cerca de ${lessonMinutes} minutos, uma vez só.`,
  ],
];

function proPage() {
  const lines = ['Seu serviço.', 'Seu preço.', 'Sua agenda.'];
  const items = proFeatures
    .map(
      (c, i) => `<li data-i="${i}"${i === 0 ? ' class="on"' : ''}><h3>${c.title}</h3><div class="pl-more"><div><p>${c.text}</p><div class="pl-inline">${c.mini}</div></div></div></li>`,
    )
    .join('');
  const shots = proFeatures.map((c, i) => `<div class="pl-shot${i === 0 ? ' on' : ''}" data-i="${i}">${c.mini}</div>`).join('');
  const steps = entrySteps
    .map(([t, d], i) => `<li class="start-step" data-reveal style="--i:${i}"><span class="start-n">${i + 1}</span><h3>${t}</h3><p>${esc(d)}</p></li>`)
    .join('');
  const faq = faqList([
    'Como funciona o teste da minha área?',
    'O que são as aulas da Rezolveaê?',
    'Como envio uma proposta?',
    'Como recebo o pagamento?',
    'Como concluo um serviço?',
    'Quando vejo o endereço e o telefone do cliente?',
  ]);

  const body = `
<section class="pro-hero" aria-labelledby="pro-t">
  <img class="pro-r" src="../assets/rezolveae-r.png" alt="" width="797" height="1024">
  <div class="wrap pro-intro-in">
    <p class="pro-eyebrow hero-fade" style="--d:0s">Para profissionais</p>
    <h1 id="pro-t" class="pro-lines">${lines.map((l, i) => `<span class="hw" style="--i:${i * 2}">${l}</span>`).join('')}</h1>
    <p class="pro-lead hero-fade" style="--d:.6s">Os pedidos da sua região chegam no seu celular. Você conversa, manda o valor e recebe direto do cliente.</p>
  </div>
</section>

<section class="start" id="entrar" aria-labelledby="start-t">
  <div class="wrap">
    <h2 id="start-t" data-reveal>4 passos antes do primeiro pedido</h2>
    <p class="start-sub" data-reveal style="--i:1">O cliente abre a porta sabendo que você foi conferido. Você chega preparado. Tudo pelo app, no seu tempo.</p>
    <ol class="start-list">${steps}</ol>
    <p class="start-note" data-reveal>Pronto: você recebe o aviso e passa a aparecer para os clientes da sua região.</p>
  </div>
</section>

<section class="pro-list" id="dia-a-dia" data-pin data-steps="${proFeatures.length}" aria-labelledby="pl-t">
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

<section class="section section-muted" id="duvidas" aria-labelledby="duv-t">
  <div class="wrap narrow">
    <h2 id="duv-t" data-reveal>Dúvidas</h2>
    <div class="faqs">${faq}</div>
    <p class="faq-more" data-reveal>Outra dúvida? Escreva para <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>
  </div>
</section>
${ctaSection('../')}`;

  return layout({
    page: 'pro',
    title: 'Para profissionais · Rezolveaê',
    description: 'Receba pedidos da sua região pelo app Rezolveaê. Você conversa, manda o valor e recebe direto do cliente.',
    body,
  });
}

/** Chamada curta no início para a página dos profissionais. */
const proTeaser = `
<section class="pro-teaser" aria-labelledby="pt-t">
  <div class="wrap pt-in">
    <img class="pt-r" src="assets/rezolveae-r.png" alt="" width="797" height="1024">
    <p class="pro-eyebrow" data-reveal>Para profissionais</p>
    <h2 id="pt-t" data-reveal style="--i:1"><span>Seu serviço.</span> <span>Seu preço.</span> <em>Sua agenda.</em></h2>
    <p data-reveal style="--i:2">Receba pedidos da sua região pelo app. Antes de aparecer, você passa por quatro passos simples, que protegem você e o cliente.</p>
    <a class="btn btn-brand" href="profissionais/" data-reveal style="--i:3">Conheça a área do profissional ${icon('arrow-right', { size: 18 })}</a>
  </div>
</section>`;

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
      (s, i) => `<li class="story-step" data-step="${i}" data-i="${i}">
        <div class="story-txt"><span class="step-n">${i + 1}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>
        ${phone(storyScreens[i](), { cls: 'phone-sm' })}
      </li>`,
    )
    .join('');
  const stickyScreens = storyScreens.map((f, i) => `<div class="story-screen${i === 0 ? ' on' : ''}" data-screen="${i}" data-i="${i}">${f()}</div>`).join('');

  // As três primeiras são a entrada do profissional (o 4º passo, a ficha, não protege ninguém).
  const safety = [
    ['badge-check', 'Identidade conferida', 'Todo profissional envia um documento com foto e uma selfie. Nossa equipe confere antes de ele aparecer para você.'],
    ['shield-check', 'Aprovado na área', 'Para atender um serviço, ele passa num teste sobre segurança e o jeito certo de fazer. O perfil mostra “Aprovado em” cada área.'],
    ['book-open', 'Preparado para atender', `Antes do primeiro pedido, ele conclui as ${LESSONS.length} aulas da Rezolveaê: orçamento claro, fotos do serviço, conversa pelo chat e data cumprida.`],
    ['map-pin', 'Endereço protegido', 'Antes de combinar, o profissional vê só o bairro. Endereço e telefone aparecem depois que você aceita a proposta.'],
  ]
    .map(
      ([ic, t, d], i) =>
        `<li class="card" data-reveal style="--i:${i}"><span class="card-ico">${icon(ic, { size: 22, duotone: ic !== 'book-open' })}</span><h3>${t}</h3><p>${esc(d)}</p></li>`,
    )
    .join('');

  const faq = faqList([
    'Como funciona a proposta?',
    'Como pago o profissional?',
    'Como o serviço é concluído?',
    'O que quer dizer "Aprovado em"?',
    'O que é o selo Verificado?',
    'Como bloqueio ou denuncio alguém?',
  ]);

  const statement = 'Do chuveiro que queimou ao guarda-roupa novo, tem alguém perto de você pronto para resolver.';

  const body = `
<section class="hero" data-hero>
  <div class="wrap hero-in">
    <div class="hero-copy">
      <h1 class="hero-title">${words('O que vamos resolver hoje?', 'hw')}</h1>
      <p class="lead hero-fade" style="--d:.55s">Eletricista, encanador, montador, faxina e mais, perto de você. Peça orçamento, converse pelo chat e combine tudo pelo app.</p>
      <div class="hero-fade hero-stores" style="--d:.7s">${storeButtons}</div>
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
    <div class="story" data-carousel data-hscroll data-pin>
      <div class="hs-pin">
      <ol class="story-steps" data-track>${steps}</ol>
      <div class="step-dots" aria-hidden="true">${Array.from({ length: stepsData.length }, (_, i) => `<i data-i="${i}"${i === 0 ? ' class="on"' : ''}></i>`).join('')}</div>
      </div>
      <div class="story-stage">${phone(stickyScreens, { cls: 'phone-story' })}</div>
    </div>
  </div>
</section>

<section class="section" id="seguranca" aria-labelledby="seg-t">
  <div class="wrap">
    <h2 id="seg-t" data-reveal>Segurança dos dois lados</h2>
    <p class="sub" data-reveal style="--i:1">Antes de aparecer para você, todo profissional passa por três etapas. E as regras protegem quem abre a porta e quem vai até ela.</p>
    <ul class="cards">${safety}</ul>
  </div>
</section>

${proTeaser}

<section class="section section-muted" id="duvidas" aria-labelledby="duv-t">
  <div class="wrap narrow">
    <h2 id="duv-t" data-reveal>Dúvidas</h2>
    <div class="faqs">${faq}</div>
    <p class="faq-more" data-reveal>Outra dúvida? Escreva para <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>
  </div>
</section>

${ctaSection()}`;

  return layout({
    page: 'home',
    title: 'Rezolveae',
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
  'profissionais/index.html': proPage(),
  'termos/index.html': legalPage(LEGAL.termos, { description: 'Termos de uso do app Rezolveaê.' }),
  'privacidade/index.html': legalPage(LEGAL.privacidade, { description: 'Como a Rezolveaê trata seus dados, conforme a LGPD.' }),
  'excluir-conta/index.html': deletionPage(),
};
for (const [path, html] of Object.entries(pages)) {
  mkdirSync(dirname(join(OUT, path)), { recursive: true });
  writeFileSync(join(OUT, path), html);
}
console.log(`Site gerado em ${OUT}: ${Object.keys(pages).join(', ')}`);
