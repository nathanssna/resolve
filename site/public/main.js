/* Animações da página inicial. Sem a classe `motion` (movimento reduzido), nada roda e tudo aparece parado. */
(() => {
  const root = document.documentElement;
  if (!root.classList.contains('motion')) return;

  /* Entrada ao rolar: [data-reveal] ganha `.in` quando aparece. */
  const reveal = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        reveal.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  document.querySelectorAll('[data-reveal]').forEach((el) => reveal.observe(el));

  /* Progresso de rolagem: [data-scroll] recebe --p de 0 a 1 enquanto o topo vai de data-from a data-to (fração da tela). */
  const scrubbed = [...document.querySelectorAll('[data-scroll]')].map((el) => ({
    el,
    from: parseFloat(el.dataset.from ?? '1'),
    to: parseFloat(el.dataset.to ?? '0'),
  }));
  const hero = document.querySelector('[data-hero]');
  /* Seções presas: [data-pin] é alta e o filho fica sticky; --p vai de 0 a 1 enquanto ele está preso. */
  const pins = [...document.querySelectorAll('[data-pin]')];
  /* Computador: celular fixo ao lado do texto. Celular: os mesmos passos viram cartões que andam para o lado. */
  const wide = matchMedia('(min-width: 961px)');

  /*
   * Celular: [data-hscroll] fica preso e a rolagem para baixo passa os cartões para o lado.
   * Cada cartão para no lugar por um trecho da rolagem (a tela dele anima) antes de seguir.
   */
  const HOLD = 0.35; // fração de cada trecho em que o cartão fica parado
  const smooth = (t) => t * t * (3 - 2 * t);
  const hscroll = [...document.querySelectorAll('[data-hscroll]')].map((el) => ({ el, pin: el.querySelector('.hs-pin'), track: el.querySelector('[data-track]') }));
  function measureHscroll() {
    for (const h of hscroll) {
      if (wide.matches) {
        h.el.style.height = '';
        h.track.style.transform = '';
        continue;
      }
      const cards = h.track.children;
      h.n = cards.length;
      h.step = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : 0;
      h.dots = [...h.el.querySelectorAll('.step-dots i')];
      h.el.style.height = `${h.pin.offsetHeight + (h.n - 1) * innerHeight * 0.65}px`;
    }
  }

  let ticking = false;
  function update() {
    ticking = false;
    const vh = innerHeight;
    for (const s of scrubbed) {
      const top = s.el.getBoundingClientRect().top;
      const p = (vh * s.from - top) / (vh * (s.from - s.to));
      s.el.style.setProperty('--p', Math.min(1, Math.max(0, p)).toFixed(3));
    }
    for (const el of pins) {
      const r = el.getBoundingClientRect();
      // Seção com filho preso abaixo do cabeçalho: conta o progresso só enquanto ele está preso.
      const pin = !wide.matches && el.querySelector(':scope > .hs-pin, :scope > * > .hs-pin');
      const p = pin
        ? (parseFloat(getComputedStyle(pin).top) - r.top) / Math.max(1, r.height - pin.offsetHeight)
        : -r.top / Math.max(1, r.height - vh);
      const pc = Math.min(1, Math.max(0, p));
      el.style.setProperty('--p', pc.toFixed(4));
      /* Com data-steps, o progresso também escolhe o item ativo ([data-i] ganha .on). */
      const n = Number(el.dataset.steps);
      if (n && !(wide.matches && el.hasAttribute('data-mobile-only'))) {
        const active = String(Math.min(n - 1, Math.floor(pc * n)));
        if (el.dataset.active !== active) {
          el.dataset.active = active;
          el.querySelectorAll('[data-i]').forEach((x) => x.classList.toggle('on', x.dataset.i === active));
        }
      }
    }
    if (!wide.matches) {
      for (const h of hscroll) {
        if (!h.n) continue;
        // Um pouco de folga no começo e no fim, para o primeiro e o último cartão também pararem.
        const p = Math.min(1, Math.max(0, (Number(h.el.style.getPropertyValue('--p') || 0) - 0.08) / 0.84));
        const u = p * (h.n - 1);
        const k = Math.min(h.n - 2, Math.floor(u));
        const f = Math.min(1, Math.max(0, (u - k - HOLD / 2) / (1 - HOLD)));
        const pos = h.n > 1 ? k + smooth(f) : 0;
        h.track.style.transform = `translateX(${(-pos * h.step).toFixed(1)}px)`;
        h.dots.forEach((d, i) => d.style.setProperty('--f', Math.min(1, Math.max(0, p * h.n - i)).toFixed(3)));
        const active = String(Math.round(pos));
        if (h.active !== active) {
          h.active = active;
          h.el.querySelectorAll('[data-i]').forEach((x) => x.classList.toggle('on', x.dataset.i === active));
        }
      }
    }
    if (hero) {
      const h = hero.offsetHeight;
      hero.style.setProperty('--hp', Math.min(1, Math.max(0, scrollY / h)).toFixed(3));
    }
  }
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => {
    measureHscroll();
    onScroll();
  });
  measureHscroll();
  document.fonts?.ready.then(() => {
    measureHscroll();
    update();
  });
  update();

  /*
   * Celular fixo ao lado dos textos do Como funciona: a tela troca quando o texto
   * chega à altura do celular, não quando o bloco do passo começa a entrar na tela.
   * Ativo = o último texto cujo centro já passou de 60% da altura da tela.
   */
  const synced = [
    { items: [...document.querySelectorAll('.story-step')], text: '.story-txt', key: 'step', targets: document.querySelectorAll('.story-screen'), targetKey: 'screen' },
  ];
  function syncPhones() {
    if (!wide.matches) return;
    const line = innerHeight * 0.6;
    for (const g of synced) {
      if (!g.items.length) continue;
      let active = g.items[0].dataset[g.key];
      for (const item of g.items) {
        const r = (item.querySelector(g.text) ?? item).getBoundingClientRect();
        if (r.top + r.height / 2 <= line) active = item.dataset[g.key];
      }
      if (g.active === active) continue;
      g.active = active;
      g.items.forEach((x) => x.classList.toggle('on', x.dataset[g.key] === active));
      g.targets?.forEach((x) => x.classList.toggle('on', x.dataset[g.targetKey] === active));
    }
  }
  addEventListener('scroll', () => requestAnimationFrame(syncPhones), { passive: true });
  addEventListener('resize', syncPhones);
  wide.addEventListener('change', () => {
    for (const g of synced) g.active = undefined;
    pins.forEach((el) => delete el.dataset.active);
    hscroll.forEach((h) => (h.active = undefined));
    measureHscroll();
    update();
    syncPhones();
  });

  syncPhones();
})();
