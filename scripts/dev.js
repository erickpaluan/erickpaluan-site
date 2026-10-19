// Servidor local do site (npm run dev). Sem dependências.
//  - imita a Vercel: URLs sem .html, página 404, redirecionamentos e arquivos privados bloqueados
//  - mostra os rascunhos (a prévia é gerada em .preview/, nunca nos arquivos que vão ao ar)
//  - regenera o blog e recarrega a página sozinho quando você salva um arquivo
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW = join(ROOT, '.preview');
const PORT = Number(process.env.PORT) || 3000;
// o que o .vercelignore não deixa ir ao ar também não é servido aqui
const PRIVATE = new Set(['posts', 'scripts', 'build.js', 'package.json', 'package-lock.json', 'README.md', 'node_modules']);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
const RELOAD = '<script>new EventSource("/__reload").onmessage=()=>location.reload()</script>';

const isFile = (p) => stat(p).then((s) => s.isFile(), () => false);

// acha o arquivo de um endereço: primeiro na prévia (.preview/), depois na raiz do projeto
async function locate(pathname) {
  let rel;
  try { rel = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, ''); } catch { return null; }
  const first = rel.split(sep)[0];
  const candidates = !rel ? ['index.html'] : extname(rel) ? [rel] : [`${rel}.html`, join(rel, 'index.html')];
  for (const base of [PREVIEW, ROOT]) {
    if (base === ROOT && (PRIVATE.has(first) || first.startsWith('.'))) continue;
    for (const c of candidates) {
      const full = join(base, c);
      if (full.startsWith(base + sep) && (await isFile(full))) return full;
    }
  }
  return null;
}

const clients = new Set();
const notify = () => clients.forEach((res) => res.write('data: reload\n\n'));

async function send(res, status, file) {
  let body = await readFile(file);
  const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
  if (type.startsWith('text/html')) body = Buffer.from(body.toString('utf8').replace('</body>', `${RELOAD}</body>`));
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const redirect = (to) => { res.writeHead(308, { Location: to + url.search }); res.end(); };

  if (path === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  // mesmos redirecionamentos da Vercel (vercel.json)
  if (path === '/projetos') return redirect('/projects');
  if (path.endsWith('.html')) return redirect(path.slice(0, -5).replace(/\/index$/, '') || '/');
  if (path.length > 1 && path.endsWith('/')) return redirect(path.slice(0, -1));

  const file = await locate(path);
  if (file) return send(res, 200, file);
  const page404 = await locate('/404.html');
  if (page404) return send(res, 404, page404);
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404');
});

// ---- regenerar e recarregar ----
let building = false;
let queued = false;
function build() {
  if (building) { queued = true; return; }
  building = true;
  const started = Date.now();
  const child = spawn(process.execPath, [join(ROOT, 'build.js'), '--drafts'], { cwd: ROOT });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  child.on('close', (code) => {
    building = false;
    if (code === 0) { console.log(`✓ atualizado em ${Date.now() - started} ms`); notify(); } else console.error(output.trim());
    if (queued) { queued = false; build(); }
  });
}
const debounce = (fn, ms = 200) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };
const rebuild = debounce(build);
const reload = debounce(notify);
const watchDir = (dir, onChange) => { try { watch(join(ROOT, dir), onChange); } catch { /* pasta não existe */ } };

watchDir('posts', rebuild);
watchDir('posts/images', rebuild);
watchDir('css', reload);
watchDir('js', reload);
watch(ROOT, (_, file) => { if (['build.js', 'index.html', 'projects.html'].includes(file)) rebuild(); });

server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `A porta ${PORT} já está em uso. Tente: PORT=3001 npm run dev` : e.message);
  process.exit(1);
});
build();
server.listen(PORT, () => console.log(`\nSite em http://localhost:${PORT}  (Ctrl+C para parar)\nRascunhos aparecem aqui, mas só aqui.\n`));
