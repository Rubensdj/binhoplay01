# BINHO PLAY

Web app **multiplataforma** (Android, iOS e web — PWA instalável) com catálogo interativo e
player de vídeo, construído a partir dos dados reais deste repositório (Brazuca Play):

- **Addons Kodi** — a página de Addons **puxa ao vivo tudo do repositório oficial** (`addons.xml` + `addons_matrix.xml` via protocolo Kodi), com botão "Puxar agora", fallback para o catálogo embutido e metadados completos (versão, descrição, novidades, ícone, download);
- **TV ao vivo** — 88 canais e 20 mil programas lidos do EPG (`logos/epg/epgbr.xml`), com logos
  combinados automaticamente a partir de `logos/`;
- **Player** — HLS (m3u8) via `hls.js` com fallback nativo (iOS) e MP4/WebM, tela cheia,
  funciona no Android, no iOS e na web;
- **Tudo do repositório** — os 5 addons com metadados do XML + os demais pacotes (`+18Play`, `cloudrequest`, `Plugins - Extrair`) com metadados lidos de dentro dos próprios zips (incluindo trava de idade +18) e inventário completo de arquivos;
- **Repositórios Kodi** — leia qualquer outro repositório como o Kodi faz (addons.xml + datadir), com download dos addons, refresh e importação por URL ou texto colado;
- **Login e senha** — tela de login/registro com senha com hash (PBKDF2), sessão persistida e logout;
- **Extras** — favoritos (localStorage), busca, filtros, URL player e guia de instalação no Kodi.

## Comandos

| Comando | O que faz |
| --- | --- |
| `bun install` | Instala as dependências |
| `bun run generate` | Gera `src/catalog.json`, `public/epg.json` e copia assets para `public/` |
| `bun run dev` | Regenera o catálogo e sobe o dev server (Vite) |
| `bun run build` | Regenera e faz o build de produção em `dist/` |
| `bun run typecheck` | Verifica os tipos com `tsc -b --noEmit` |

## Pipeline de dados (tudo automático)

`scripts/generate-catalog.mjs` lê o repositório e gera:

1. **Addons** — parseia `addons/repo/addons.xml` + `addons_matrix.xml` e resolve o zip de
   download e o ícone em `addons/` e `addons/repo/Plugins/`;
2. **Canais** — parseia `logos/epg/epgbr.xml` (guia de programação) e casa cada canal com seu
   logo em `logos/` (88 canais, 20.186 programas);
3. **Assets** — copia `addons/` e `logos/` para `public/` para downloads/fanart funcionarem.

Depois de publicar novos zips/metadados no repositório, basta rodar `bun run generate` — o app
se atualiza sozinho.

## Streams reais (opcional)

Os metadados públicos do repositório **não expõem URLs de vídeo** — a lista de streams do addon
Kodi vive em código ofuscado dentro dos zips. Por isso o app tem uma fonte de conteúdo plugável:

- Crie um arquivo `channel-streams.json` na raiz com a URL de stream por canal:

```json
{ "Axn.br": "https://exemplo.com/axn/stream.m3u8", "Bandnews.br": "https://exemplo.com/bandnews/stream.m3u8" }
```

- Sem esse arquivo, o botão "Assistir" usa streams abertos de demonstração (CC) para validar a
  reprodução em todas as plataformas.
- O player também aceita qualquer link m3u8/mp4 colado manualmente ("Assistir por link").

## PWA / instalação

- `public/manifest.webmanifest` + `public/sw.js` (registrado só em produção).
- Android/Chrome: instalar pelo menu do navegador; iOS: "Adicionar à Tela de Início" no Safari.
- Ícone do app: `addons/repo/Plugins/plugin.video.BrazucaPlay/icon.png`.

## Deploy

- **Freebuff hosting**: install `bun install` · build `bun run build` · preview `bun run dev`
- **GitHub Pages**: `.github/workflows/static.yml` instala, gera e publica `dist/`

© 2026 — Projeto comunitário, sem anúncios e com comunicação transparente.
