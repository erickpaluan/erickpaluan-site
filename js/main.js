(() => {
  const root = document.documentElement;
  const button = document.querySelector('.theme-toggle');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let storedTheme = null;
  try { storedTheme = localStorage.getItem('theme'); } catch (e) { /* sem armazenamento: usa o tema do sistema */ }

  if (storedTheme === 'light' || storedTheme === 'dark') {
    root.dataset.theme = storedTheme;
  }

  if (button) {
    let turns = 0;
    let fadeTimer;
    button.addEventListener('click', () => {
      const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = current === 'dark' ? 'light' : 'dark';
      if (!reduceMotion) {
        // troca de tema com transição suave das cores e meia-volta no ícone
        root.classList.add('theme-fade');
        clearTimeout(fadeTimer);
        fadeTimer = setTimeout(() => root.classList.remove('theme-fade'), 450);
        const icon = button.querySelector('svg');
        if (icon) icon.style.transform = `rotate(${++turns * 180}deg)`;
      }
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) { /* ignora */ }
      button.setAttribute('aria-label', next === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro');
    });
  }

  document.querySelectorAll('[data-year]').forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });
})();

// Filtro de tags na lista do blog (sem JS, a lista continua completa)
(() => {
  const bar = document.querySelector('.tag-filter');
  if (!bar) return;
  bar.hidden = false;
  const items = document.querySelectorAll('.post-item');
  bar.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-filter]');
    if (!btn) return;
    const tag = btn.dataset.filter;
    bar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    items.forEach((item) => {
      const hide = !!tag && !item.dataset.tags.split('|').includes(tag);
      const wasHidden = item.hidden;
      item.hidden = hide;
      if (wasHidden && !hide) { // reaparece com um leve fade
        item.classList.remove('reveal');
        void item.offsetWidth;
        item.classList.add('reveal');
      }
    });
  });
})();

// Barra fina de progresso de leitura nos artigos
(() => {
  const article = document.querySelector('.article');
  if (!article) return;
  const bar = document.createElement('div');
  bar.className = 'read-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  let queued = false;
  const update = () => {
    queued = false;
    const rect = article.getBoundingClientRect();
    const total = rect.height - innerHeight;
    const progress = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
    bar.style.transform = `scaleX(${progress})`;
  };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('resize', update);
  update();
})();

// Abrindo o site direto do arquivo (file://), onde "/projects" não existe: converte os links para arquivos reais.
// Na internet (e no "npm run dev") isto não faz nada.
(() => {
  if (location.protocol !== 'file:') return;
  const script = document.querySelector('script[src$="js/main.js"]');
  if (!script) return;
  const root = new URL('../', script.src).href;
  document.querySelectorAll('a[href^="/"]').forEach((a) => {
    const [path, hash] = a.getAttribute('href').split('#');
    let file = path === '/' ? 'index.html' : path.slice(1);
    if (file === 'blog') file = 'blog/index.html';
    else if (!/\.[a-z0-9]+$/i.test(file)) file += '.html';
    a.href = root + file + (hash ? `#${hash}` : '');
  });
})();

// Página 404: mostra o endereço procurado, sugere a página mais parecida e faz do "0" um atalho para o tema
(() => {
  const notFound = document.querySelector('.not-found');
  if (!notFound) return;

  const zero = notFound.querySelector('.nf-code svg');
  if (zero) zero.addEventListener('click', () => document.querySelector('.theme-toggle')?.click());

  const slot = notFound.querySelector('.nf-path');
  if (slot && location.pathname.length > 1) {
    slot.querySelector('code').textContent = location.pathname;
    slot.hidden = false;
  }

  const suggest = notFound.querySelector('.nf-suggest');
  const dataEl = document.getElementById('known-pages');
  if (!suggest || !dataEl) return;
  let known = [];
  try { known = JSON.parse(dataEl.textContent); } catch (e) { return; }

  const distance = (a, b) => { // distância de Levenshtein (quantas letras trocar para igualar)
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return row[b.length];
  };
  const segments = location.pathname.toLowerCase().replace(/\.html$/, '').split('/').filter(Boolean);
  const typed = segments[segments.length - 1] || '';
  let target = null;
  if (typed.length >= 3) {
    let best = null;
    for (const page of known) {
      for (const word of page.words) {
        const score = distance(typed, word) / Math.max(typed.length, word.length);
        if (!best || score < best.score) best = { page, score };
      }
    }
    if (best && best.score <= 0.4) target = best.page;
  }
  // endereço dentro de uma seção (/blog/qualquer-coisa): leva para a lista da seção
  if (!target && segments.length > 1) target = known.find((page) => page.path === `/${segments[0]}`) || null;
  if (target) {
    const link = suggest.querySelector('a');
    link.href = target.path;
    link.textContent = target.label;
    suggest.hidden = false;
  }
})();
