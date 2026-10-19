# Erick Paluan — site pessoal

Site estático em HTML, CSS e JavaScript nativos. O **blog é gerado a partir de arquivos Markdown** por um script pequeno (`build.js`). O mesmo script mantém cabeçalho, rodapé e `<head>` iguais em todas as páginas e gera a página 404, o `sitemap.xml` e o `feed.xml`.

## Começar (uma vez)

```
npm install
```

Precisa de Node 18 ou mais novo.

## Ver o site no seu computador

```
npm run dev
```

Abre um servidor em http://localhost:3000 que **imita a Vercel**: endereços sem `.html`, página 404 e arquivos privados bloqueados. Mostra os rascunhos (só ali), regenera o blog e recarrega a página sozinho quando você salva um `.md`, o CSS, o JS ou o `build.js`.

> Abrir o `index.html` com dois cliques **não funciona mais**: os links são absolutos (`/blog`, `/projects`) para funcionarem com endereços limpos. Use `npm run dev`.

## Escrever um artigo

1. Copie `posts/_modelo.md` para `posts/nome-do-artigo.md` (o nome vira o endereço: `/blog/nome-do-artigo`).
2. Preencha o cabeçalho (`title`, `date` no formato AAAA-MM-DD, `description` e `tags`) e escreva em Markdown. As tags vão numa linha só, separadas por vírgula: `tags: ideias, estudos`.
3. Confira com `npm run dev`. Quando estiver bom, tire a linha `draft: true`.
4. Rode `npm run blog` para gerar os arquivos finais e faça commit **do `.md` e dos arquivos gerados** (`blog/`, `assets/blog/`, `404.html`, `sitemap.xml`, `feed.xml`, `index.html`). A Vercel publica sozinha.

Rascunhos: `draft: true` esconde o artigo do site publicado. Arquivos que começam com `_` são ignorados.

Imagem do artigo: coloque o arquivo em `posts/images/` e use `image: nome.jpg` no cabeçalho. O gerador cria a miniatura da lista, a capa e a imagem de compartilhamento em `assets/blog/` (pasta gerada: não edite, mas envie ao GitHub). `bg-post: false` desliga só a capa grande. Sem `image`, a lista mostra um ícone de documento.

Imagens dentro do texto: coloque o arquivo em `posts/images/` (qualquer tamanho) e escreva só o nome no Markdown:

```
![Descrição para leitores de tela](tela-do-sistema.png "Legenda opcional")
```

O gerador reduz para no máximo 1200 px de largura, converte para WebP e define largura e altura. Uma imagem sozinha numa linha vira figura com legenda. Endereços externos (`https://...`) são aceitos e não são alterados.

## Estrutura

- `index.html`, `projects.html`: páginas principais. O texto é seu; só os trechos entre `<!-- site:... -->` são gerados, não edite esses
- `posts/*.md`: **artigos do blog (é aqui que você escreve)**
- `posts/images/`: imagens dos artigos (originais, qualquer tamanho)
- `build.js`: gerador. **Para mudar o menu, o rodapé ou os links de redes sociais, edite aqui** e rode `npm run blog`
- `scripts/dev.js`: servidor local do `npm run dev`
- `blog/`, `assets/blog/`, `404.html`, `sitemap.xml`, `feed.xml`: **gerados**, não edite à mão
- `css/style.css`, `js/main.js`: estilos e comportamento (tema, filtro de tags, progresso de leitura, sugestões do 404)
- `assets/`: imagens, ícones e a fonte Inter (`assets/fonts/`, licença OFL incluída)
- `vercel.json`: endereços sem `.html`, redirecionamentos e cache da fonte

## Projetos

Cada projeto em `projects.html` é um cartão com um ícone no topo. Para usar uma imagem no lugar, coloque o arquivo em `assets/projects/` (proporção 16:9, uns 640 px de largura) e troque o `<svg>` dentro de `.project-media` por `<img src="assets/projects/nome.jpg" alt="" width="640" height="360" loading="lazy">`. Para um novo projeto, copie um `<article class="project">` inteiro.

## Página 404

Gerada pelo `build.js` (`404.html`) e usada pela Vercel em qualquer endereço que não existe, em qualquer profundidade. Ela mostra o endereço procurado e sugere "Você quis dizer…?" com a página mais parecida (ou a lista da seção, no caso de `/blog/qualquer-coisa`). O "0" do 404 gira ao passar o mouse e, ao clicar, troca o tema. As sugestões usam a lista de páginas e artigos publicados, atualizada a cada build.

## Publicar

Na Vercel, **não configure comando de build nem diretório de saída**: o HTML já vai pronto no repositório.

O `.vercelignore` impede que `posts/` (incluindo rascunhos), `scripts/`, `build.js`, `package.json` e este README sejam publicados. Depois do primeiro deploy, confira que `erickpaluan.com.br/posts/_modelo.md` e `erickpaluan.com.br/build.js` retornam 404.

## Domínio

O endereço do site está em `SITE` no topo do `build.js` e é usado no sitemap, no RSS e nas tags canônicas.
