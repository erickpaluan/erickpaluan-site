---
title: Título do artigo
date: 2026-10-09
description: Uma frase que resume o artigo (aparece na lista do blog e no Google).
tags: ideias, estudos
image: nome-da-imagem.jpg
image-alt: Descrição curta da imagem
bg-post: true
draft: true
---

Copie este arquivo, renomeie (o nome vira o endereço: `meu-estudo.md` → `/blog/meu-estudo.html`)
e escreva em Markdown. Arquivos que começam com `_` são ignorados pelo gerador.

Campos do cabeçalho:

- `title`, `date` (AAAA-MM-DD) e `description` são obrigatórios.
- `tags` é opcional: escreva tudo em uma linha, separado por vírgula (`tags: ideias, estudos`).
- `image` é opcional: nome de um arquivo dentro de `posts/images/`. Vira a miniatura da lista, a capa do artigo e a prévia ao compartilhar o link. Sem `image`, a lista mostra um ícone de documento.
- `image-alt` descreve a imagem para leitores de tela (usado na capa). Pode ficar de fora.
- `bg-post: true` mostra a imagem como capa grande no topo do artigo (padrão quando há `image`). Com `bg-post: false` ela aparece só na lista e na prévia.
- `draft: true` esconde o artigo do site publicado. Remova a linha (ou use `false`) para publicar.
- `updated: AAAA-MM-DD` é opcional e informa a data de atualização ao Google.
- Imagens no texto: coloque o arquivo em `posts/images/` e escreva `![descrição](arquivo.jpg "Legenda opcional")`. O gerador reduz, converte e define o tamanho sozinho.
