// Gerador do site: lê posts/*.md e escreve blog/*.html, blog/index.html,
// sitemap.xml e feed.xml, e mantém cabeçalho, rodapé e <head> iguais em todas as páginas
// (trechos entre marcadores <!-- site:... --> de index.html e projects.html). Uso:
//   node build.js            -> só posts publicados
//   node build.js --drafts   -> inclui rascunhos (draft: true), mas escreve só em .preview/
//                               (nunca nos arquivos que vão ao ar). É o que o "npm run dev" usa.
import { readdir, readFile, writeFile, rm, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

// erros de conteúdo (cabeçalho inválido, imagem faltando...) saem como uma linha clara, sem rastro técnico
process.on('uncaughtException', (e) => { console.error(`\nErro: ${e.message}\n`); process.exit(1); });

const ROOT = dirname(fileURLToPath(import.meta.url));
const SITE = 'https://erickpaluan.com.br';
const AUTHOR = 'Erick Paluan';
const INCLUDE_DRAFTS = process.argv.includes('--drafts');
// Com --drafts tudo é escrito em .preview/, para um rascunho nunca ir parar no commit por engano
const OUT = INCLUDE_DRAFTS ? join(ROOT, '.preview') : ROOT;
const PAGES = ['/', '/projects']; // páginas estáticas que entram no sitemap (endereços sem .html: cleanUrls da Vercel)

// ---------- utilidades ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const fmtDate = (d) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(d);
const isoDay = (d) => d.toISOString().slice(0, 10);

function parseFrontmatter(raw, file) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) throw new Error(`${file}: faltou o cabeçalho (--- ... ---) no topo do arquivo.`);
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\s+-\s/.test(line)) throw new Error(`${file}: listas com traços não são aceitas. Escreva as tags em uma linha, separadas por vírgula:  tags: ideias, estudos`);
    const i = line.indexOf(':');
    if (i < 0) throw new Error(`${file}: linha inválida no cabeçalho: "${line}"`);
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (key === 'tags') {
      if (/^\[|\]$/.test(val)) throw new Error(`${file}: tire os colchetes das tags. Escreva em uma linha, separadas por vírgula:  tags: ideias, estudos`);
      val = val.split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else if (key === 'draft' || key === 'bg-post') {
      if (val !== 'true' && val !== 'false') throw new Error(`${file}: "${key}" deve ser true ou false.`);
      val = val === 'true';
    } else {
      val = val.replace(/^["']|["']$/g, '');
    }
    data[key] = val;
  }
  return { data, body: raw.slice(m[0].length) };
}

// ids nos títulos (para links diretos como #minha-secao)
marked.use({
  renderer: {
    heading({ tokens, depth, text }) {
      const id = slugify(text);
      const anchor = depth === 2 || depth === 3 ? ` <a class="anchor" href="#${id}" aria-label="Link direto para esta seção">#</a>` : '';
      return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}${anchor}</h${depth}>\n`;
    },
    // imagens do texto: nome simples (foto.jpg) vem de posts/images/ e é otimizada; o resto passa como está
    image({ href, title, text }) {
      const known = currentImages[href];
      const cap = title ? ` data-caption="${esc(title)}"` : '';
      if (known) return `<img src="${known.src}" alt="${esc(text)}" width="${known.width}" height="${known.height}" loading="lazy" decoding="async"${cap}>`;
      return `<img src="${esc(href)}" alt="${esc(text)}" loading="lazy" decoding="async"${cap}>`;
    },
  },
});
let currentImages = {}; // preenchido antes de cada marked.parse

// Imagem sozinha num parágrafo vira <figure> (com <figcaption> se tiver legenda entre aspas)
function renderMarkdown(post) {
  currentImages = post.imgMap || {};
  return marked.parse(post.md)
    .replace(/<p>(<img [^>]*>)<\/p>/g, (all, img) => {
      const cap = img.match(/ data-caption="([^"]*)"/);
      return `<figure>${img.replace(/ data-caption="[^"]*"/, '')}${cap ? `<figcaption>${cap[1]}</figcaption>` : ''}</figure>`;
    })
    .replace(/ data-caption="[^"]*"/g, '');
}

// ---------- peças compartilhadas (fonte única para todas as páginas) ----------
// p = prefixo até a raiz para arquivos (css, js, imagens): '' na raiz, '../' em blog/ e '/' na página 404.
// Links entre páginas são sempre absolutos e sem .html (/projects, /blog, /blog/meu-post).
const headAssets = (p) => `<link rel="icon" href="${p}assets/favicon.svg" type="image/svg+xml">
  <link rel="alternate icon" href="${p}assets/favicon.ico">
  <link rel="apple-touch-icon" href="${p}assets/apple-touch-icon.png">
  <link rel="manifest" href="${p}assets/site.webmanifest">
  <link rel="preload" href="${p}assets/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="alternate" type="application/rss+xml" title="Blog — ${AUTHOR}" href="${p}feed.xml">
  <link rel="stylesheet" href="${p}css/style.css">
  <script src="${p}js/main.js" defer></script>`;

const THEME_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>';

// current: 'projects' | 'blog' | null
const siteHeader = (current) => `<header class="site-header">
      <a class="brand" href="/" aria-label="${AUTHOR} — início">${AUTHOR}</a>
      <nav class="nav" aria-label="Navegação principal">
        <a href="/projects"${current === 'projects' ? ' aria-current="page"' : ''}>Projetos</a>
        <a href="/blog"${current === 'blog' ? ' aria-current="page"' : ''}>Blog</a>
        <button class="theme-toggle" type="button" aria-label="Alternar tema" title="Alternar tema">${THEME_ICON}</button>
      </nav>
    </header>`;

const siteFooter = (p) => `<footer class="site-footer">
      <div class="social-links" aria-label="Redes sociais">
        <a href="https://github.com/erickpaluan" target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href="https://www.linkedin.com/in/erickpaluan/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
        <a href="https://x.com/erickpaluan" target="_blank" rel="noopener noreferrer">X</a>
        <a href="https://www.instagram.com/erickpaluan/" target="_blank" rel="noopener noreferrer">Instagram</a>
        <a href="mailto:contato@erickpaluan.com.br">E-mail</a>
        <a href="${p}feed.xml">RSS</a>
      </div>
      <span>© <span data-year>${new Date().getFullYear()}</span> ${AUTHOR}</span>
    </footer>`;

const THUMB_ICON = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>';

// assets: prefixo até a raiz do site, a partir da página que mostra a lista
const postItem = (post, assets = '../') => `<li class="post-item" data-tags="${esc(post.tags.join('|'))}">
          <a href="/blog/${post.slug}">
            <span class="thumb">${post.image ? `<img src="${assets}assets/blog/${post.slug}-thumb.webp" width="96" height="96" alt="" loading="lazy" decoding="async">` : THUMB_ICON}</span>
            <span class="post-item-body">
              <span class="post-item-head">
                <span class="post-item-title">${esc(post.title)}${post.draft ? ' <em>(rascunho)</em>' : ''}</span>
                <time datetime="${isoDay(post.date)}">${fmtDate(post.date)}</time>
              </span>
              <span class="post-item-desc">${esc(post.description)}</span>
            </span>
          </a>
        </li>`;

// ---------- layout das páginas do blog ----------
// path: endereço da página (sem .html). Sem path, não há canonical nem og:url (caso da 404).
function layout({ title, description, path, type = 'website', noindex = false, current = false, p = '../', ogImage = `${SITE}/assets/opengraph-image.png`, body }) {
  const url = path ? SITE + path : null;
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#ffffff">${noindex ? '\n  <meta name="robots" content="noindex">' : ''}
  ${url ? `<link rel="canonical" href="${url}">\n  ` : ''}<meta property="og:type" content="${type}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  ${url ? `<meta property="og:url" content="${url}">\n  ` : ''}<meta property="og:image" content="${ogImage}">${ogImage.endsWith('-og.jpg') ? `
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">` : ''}
  ${headAssets(p)}
  <title>${esc(title)}</title>
</head>
<body>
  <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
  <div class="site-shell">
    ${siteHeader(current ? 'blog' : null)}
    <main id="conteudo">
${body}
    </main>
    ${siteFooter(p)}
  </div>
</body>
</html>
`;
}

const tagList = (tags) => (tags.length ? `<ul class="tags" aria-label="Tags">${tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '');

function postPage(p) {
  const body = `      <article class="article">
        <a class="back-link" href="/blog">← Blog</a>
        <h1>${esc(p.title)}</h1>
        <p class="post-meta"><time datetime="${isoDay(p.date)}">${fmtDate(p.date)}</time> · ${p.minutes} min de leitura${p.draft ? ' · <strong>rascunho</strong>' : ''}</p>
        ${tagList(p.tags)}${p.image && p.cover ? `
        <figure class="article-cover"><img src="../assets/blog/${p.slug}-cover.webp" width="1200" height="630" alt="${esc(p.imageAlt)}" decoding="async"></figure>` : ''}
        <div class="article-body">
${p.html}
        </div>
      </article>`;
  return layout({ title: `${p.title} — ${AUTHOR}`, description: p.description, path: `/blog/${p.slug}`, type: 'article', noindex: p.draft, ogImage: p.image ? `${SITE}/assets/blog/${p.slug}-og.jpg` : undefined, body });
}

function indexPage(posts) {
  const allTags = [...new Set(posts.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const filters = allTags.length
    ? `      <div class="tag-filter" hidden aria-label="Filtrar por tag"><button type="button" data-filter="" aria-pressed="true">Todos</button>${allTags.map((t) => `<button type="button" data-filter="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('')}</div>\n`
    : '';
  const list = posts.length
    ? `      <ul class="post-list">\n${posts.map((p) => '        ' + postItem(p)).join('\n')}\n      </ul>`
    : '      <p class="empty-state">Nenhum artigo publicado ainda.</p>';
  const body = `      <h1>Blog</h1>
      <p class="page-intro">Anotações sobre o que estou aprendendo, ideias que estou organizando e reflexões sobre design, tecnologia e trabalho.</p>
${filters}${list}`;
  return layout({ title: `Blog — ${AUTHOR}`, description: 'Anotações, aprendizados e reflexões de Erick Paluan sobre design, tecnologia e trabalho.', path: '/blog', current: true, body });
}

// ---------- sitemap e RSS ----------
function sitemap(posts) {
  const latest = posts[0] ? isoDay(posts[0].date) : null;
  const urls = [
    ...PAGES.map((p) => ({ loc: SITE + p })),
    { loc: `${SITE}/blog`, lastmod: latest },
    ...posts.map((p) => ({ loc: `${SITE}/blog/${p.slug}`, lastmod: isoDay(p.updated || p.date) })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}

function rss(posts) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Blog — ${AUTHOR}</title>
  <link>${SITE}/blog</link>
  <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
  <description>Anotações sobre design, tecnologia e trabalho.</description>
  <language>pt-BR</language>
${posts.map((p) => `  <item>
    <title>${esc(p.title)}</title>
    <link>${SITE}/blog/${p.slug}</link>
    <guid isPermaLink="true">${SITE}/blog/${p.slug}</guid>
    <pubDate>${p.date.toUTCString()}</pubDate>
    <description>${esc(p.description)}</description>${p.tags.map((t) => `\n    <category>${esc(t)}</category>`).join('')}
  </item>`).join('\n')}
</channel>
</rss>
`;
}

// ---------- execução ----------
async function loadPosts() {
  const dir = join(ROOT, 'posts');
  await mkdir(dir, { recursive: true });
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  const posts = [];
  for (const file of files) {
    const { data, body: rawBody } = parseFrontmatter(await readFile(join(dir, file), 'utf8'), file);
    if (!data.title) throw new Error(`${file}: falta "title" no cabeçalho.`);
    if (!data.description) throw new Error(`${file}: falta "description" no cabeçalho.`);
    const date = new Date(`${data.date}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date || '') || Number.isNaN(date.getTime())) throw new Error(`${file}: "date" deve ser AAAA-MM-DD (ex.: 2026-10-09).`);
    // a página já mostra o título como H1: remove um "# Título" repetido no início do corpo
    const body = rawBody.replace(/^\s*#\s+(.+?)\s*\r?\n/, (all, h) => (h.trim().toLowerCase() === data.title.trim().toLowerCase() ? '' : all));
    const updated = data.updated ? new Date(`${data.updated}T12:00:00Z`) : null;
    const draft = data.draft === true;
    if (draft && !INCLUDE_DRAFTS) continue;
    posts.push({
      slug: slugify(file.replace(/\.md$/, '')),
      title: data.title,
      description: data.description,
      tags: data.tags || [],
      date, updated, draft,
      image: data.image || null,
      imageAlt: data['image-alt'] || '',
      cover: data['bg-post'] !== false, // com imagem, a capa grande aparece por padrão; bg-post: false desliga
      minutes: Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 200)),
      md: body,
    });
  }
  const slugs = new Set();
  for (const p of posts) {
    if (p.slug === 'index') throw new Error('O nome "index.md" é reservado.');
    if (slugs.has(p.slug)) throw new Error(`Dois posts geram o mesmo endereço: ${p.slug}`);
    slugs.add(p.slug);
  }
  return posts.sort((a, b) => b.date - a.date);
}

// Substitui o trecho entre <!-- site:NOME --> e <!-- /site:NOME --> pelo conteúdo gerado
const inject = (html, name, content) => {
  const re = new RegExp(`<!-- site:${name} -->[\\s\\S]*?<!-- /site:${name} -->`);
  if (!re.test(html)) throw new Error(`Marcador <!-- site:${name} --> não encontrado.`);
  return html.replace(re, () => `<!-- site:${name} -->\n  ${content}\n  <!-- /site:${name} -->`);
};

function homeLatest(published, assets = '') {
  if (!published.length) return '';
  return `<section class="home-posts" aria-labelledby="recentes">
        <h2 id="recentes">Escritos recentes</h2>
        <ul class="post-list">
${published.slice(0, 3).map((p) => '          ' + postItem(p, assets)).join('\n')}
        </ul>
        <a class="text-link" href="/blog">Ver todos os artigos →</a>
      </section>`;
}

async function updateStaticPages(published) {
  const pages = [{ file: 'index.html', current: null }, { file: 'projects.html', current: 'projects' }];
  for (const { file, current } of pages) {
    let html = await readFile(join(ROOT, file), 'utf8');
    html = inject(html, 'head', headAssets(''));
    html = inject(html, 'header', siteHeader(current));
    html = inject(html, 'footer', siteFooter(''));
    if (file === 'index.html') html = inject(html, 'latest', homeLatest(published));
    await writeFile(join(OUT, file), html);
  }
}

// Página 404: a Vercel a usa para qualquer endereço inexistente, em qualquer profundidade (/a/b/c),
// por isso os arquivos são chamados com caminho absoluto (p = '/').
const ZERO = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="3.2"/><path d="M12 3.6a8.4 8.4 0 0 1 0 16.8z" fill="currentColor"/></svg>';
function notFoundPage(published) {
  // lista usada pelo script da página para sugerir "você quis dizer…?"
  const known = [
    { path: '/', label: 'Início', words: ['inicio', 'home'] },
    { path: '/projects', label: 'Projetos', words: ['projects', 'projetos', 'portfolio'] },
    { path: '/blog', label: 'Blog', words: ['blog', 'artigos', 'posts', 'escritos'] },
    ...published.map((p) => ({ path: `/blog/${p.slug}`, label: p.title, words: [p.slug] })),
  ];
  const body = `      <section class="not-found">
        <p class="nf-code" aria-hidden="true"><span>4</span>${ZERO}<span>4</span></p>
        <h1>Página não encontrada</h1>
        <p class="page-intro nf-text">Esse endereço não existe ou a página mudou de lugar.<span class="nf-path" hidden> Procurei por <code></code>.</span></p>
        <p class="nf-suggest" hidden>Você quis dizer <a href="/"></a>?</p>
        <nav class="home-links" aria-label="Para onde ir">
          <a href="/"><span>Voltar ao início</span><span class="arrow" aria-hidden="true">↗</span></a>
          <a href="/projects"><span>Projetos</span><span class="arrow" aria-hidden="true">↗</span></a>
          <a href="/blog"><span>Blog e anotações</span><span class="arrow" aria-hidden="true">↗</span></a>
        </nav>
      </section>
      ${homeLatest(published, '/')}
      <script type="application/json" id="known-pages">${JSON.stringify(known).replace(/</g, '\\u003c')}</script>`;
  return layout({ title: `Página não encontrada — ${AUTHOR}`, description: 'Página não encontrada.', noindex: true, p: '/', body });
}

// Gera, a partir de posts/images/<arquivo>, as versões usadas no site (pasta assets/blog/):
// miniatura 96x96, capa 1200x630 (webp) e imagem de compartilhamento 1200x630 (jpg) para a imagem
// do cabeçalho, e uma versão webp de até 1200 px de largura para cada imagem usada no texto.
const BODY_IMAGE = /^[^/:\\]+\.(jpe?g|png|webp|gif|avif)$/i;
async function processImages(posts) {
  const outDir = join(OUT, 'assets', 'blog');
  const keep = new Set();
  const needed = posts.filter((p) => p.image || [...p.md.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s">]+)/g)].some((m) => BODY_IMAGE.test(m[1])));
  if (needed.length) {
    let sharp;
    try { ({ default: sharp } = await import('sharp')); } catch { throw new Error('Para usar imagens nos posts, rode "npm install" (instala o sharp).'); }
    await mkdir(outDir, { recursive: true });
    const sourceOf = async (post, file) => {
      const src = join(ROOT, 'posts', 'images', file);
      const time = await stat(src).then((st) => st.mtimeMs, () => { throw new Error(`${post.slug}: imagem não encontrada em posts/images/${file}`); });
      return { src, time };
    };
    const isFresh = (dest, time) => stat(dest).then((st) => st.mtimeMs >= time, () => false);
    const variants = [
      ['thumb.webp', (i) => i.resize(96, 96, { fit: 'cover' }).webp({ quality: 80 })],
      ['cover.webp', (i) => i.resize(1200, 630, { fit: 'cover' }).webp({ quality: 80 })],
      ['og.jpg', (i) => i.resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 82, mozjpeg: true })],
    ];
    for (const p of needed) {
      if (p.image) {
        const { src, time } = await sourceOf(p, p.image);
        for (const [suffix, make] of variants) {
          const name = `${p.slug}-${suffix}`;
          keep.add(name);
          const dest = join(outDir, name);
          if (!(await isFresh(dest, time))) await make(sharp(src).rotate()).toFile(dest);
        }
      }
      p.imgMap = {};
      for (const m of p.md.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s">]+)/g)) {
        const file = m[1];
        if (!BODY_IMAGE.test(file) || p.imgMap[file]) continue;
        const { src, time } = await sourceOf(p, file);
        const name = `${p.slug}-img-${slugify(file.replace(/\.[^.]+$/, ''))}.webp`;
        keep.add(name);
        const dest = join(outDir, name);
        if (!(await isFresh(dest, time))) await sharp(src, { animated: true }).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 82 }).toFile(dest);
        const meta = await sharp(dest).metadata();
        p.imgMap[file] = { src: `../assets/blog/${name}`, width: meta.width, height: meta.pageHeight || meta.height };
      }
    }
  }
  // remove imagens de posts que não existem mais (ou que são rascunhos fora da pré-visualização)
  try { for (const f of await readdir(outDir)) if (!keep.has(f)) await rm(join(outDir, f)); } catch { /* pasta ainda não existe */ }
}

const posts = await loadPosts();
if (INCLUDE_DRAFTS) await rm(OUT, { recursive: true, force: true }); // prévia sempre começa limpa
await mkdir(OUT, { recursive: true });
await processImages(posts);
for (const p of posts) p.html = renderMarkdown(p);
const blogDir = join(OUT, 'blog');
await mkdir(blogDir, { recursive: true });
for (const f of await readdir(blogDir)) if (f.endsWith('.html')) await rm(join(blogDir, f)); // tudo em blog/ é gerado

for (const p of posts) await writeFile(join(blogDir, `${p.slug}.html`), postPage(p));
await writeFile(join(blogDir, 'index.html'), indexPage(posts));
const published = posts.filter((p) => !p.draft);
await writeFile(join(OUT, 'sitemap.xml'), sitemap(published));
await writeFile(join(OUT, 'feed.xml'), rss(published));
await writeFile(join(OUT, '404.html'), notFoundPage(published));
await updateStaticPages(published);

console.log(`Blog gerado${INCLUDE_DRAFTS ? ' (prévia em .preview/)' : ''}: ${published.length} publicado(s)${posts.length > published.length ? `, ${posts.length - published.length} rascunho(s) na pré-visualização` : ''}.`);
