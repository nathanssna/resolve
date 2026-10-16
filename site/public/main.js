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
      const p = -r.top / Math.max(1, r.height - vh);
      const pc = Math.min(1, Math.max(0, p));
      el.style.setProperty('--p', pc.toFixed(4));
      /* Com data-steps, o progresso também escolhe o item ativo ([data-i] ganha .on). */
      const n = Number(el.dataset.steps);
      if (n) {
        const active = String(Math.min(n - 1, Math.floor(pc * n)));
        if (el.dataset.active !== active) {
          el.dataset.active = active;
          el.querySelectorAll('[data-i]').forEach((x) => x.classList.toggle('on', x.dataset.i === active));
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
  addEventListener('resize', onScroll);
  update();

  /*
   * Celular fixo ao lado de textos (Como funciona, Seu painel): a tela troca quando o texto
   * chega à altura do celular, não quando o bloco do passo começa a entrar na tela.
   * Ativo = o último texto cujo centro já passou de 60% da altura da tela.
   */
  const synced = [
    { items: [...document.querySelectorAll('.story-step')], text: '.story-txt', key: 'step', targets: document.querySelectorAll('.story-screen'), targetKey: 'screen' },
    { items: [...document.querySelectorAll('.pd-item')], text: ':scope > div', key: 'part', panel: document.querySelector('.pd-phone') },
  ];
  const wide = matchMedia('(min-width: 961px)');
  function syncPhones() {
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
      if (g.panel && wide.matches) g.panel.setAttribute('data-focus', active);
    }
  }
  addEventListener('scroll', () => requestAnimationFrame(syncPhones), { passive: true });
  addEventListener('resize', syncPhones);
  syncPhones();
})();
