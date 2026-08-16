# BINHOPLAY

Web app **multiplataforma** (Android, iOS e web — PWA instalável) **estilo Netflix** para mostrar
os conteúdos, construído a partir dos dados reais do repositório de origem:

- **Experiência Netflix (app final)** — navbar fixa com gradiente (logo, links Início/Séries/Filmes/Minha lista, menu "Navegar", lupa de **busca em tela cheia**, sino e avatar com menu de conta), **billboard** com título gigante, badge de idade (L/18/HD), botão branco "Assistir" e "Mais informações", **cards landscape 16:9 com prévia estilo Netflix** (no hover o card cresce e **reproduz a prévia em vídeo** com botões de play/informações, título, badge HD e sinopse — usa o **stream real do canal** quando configurado e, senão, um vídeo de demonstração para a prévia nunca ficar parada), fileiras por categoria (**TV ao Vivo · Filmes · Séries · Desenhos · Doramas · Animes · Novelas**), página própria por categoria (`#/categoria/<nome>`), modal de detalhes estilo Netflix com prévia em vídeo no banner (quando há stream), "Minha lista" e tema **vermelho #E50914**; as utilidades (Addons, Repositórios, Como instalar) ficam em "Mais";
- **Addons Kodi** — a página de Addons **puxa ao vivo tudo do repositório oficial** (`addons.xml` + `addons_matrix.xml` via protocolo Kodi), com botão "Puxar agora", fallback para o catálogo embutido e metadados completos (versão, descrição, novidades, ícone, download). **Dependências automáticas**: o `<requires>` de cada addon é lido — ex.: o **f4mTester requer o F4mProxy** — e o card mostra "Requer: …" com o botão **"Baixar tudo"** que baixa o addon + dependências juntos, como o Kodi faz;
- **TV ao vivo** — 88 canais e 20 mil programas lidos do EPG (`logos/epg/epgbr.xml`), com logos
  combinados automaticamente a partir de `logos/`;
- **Player** — HLS (m3u8) via `hls.js` com fallback nativo (iOS) e MP4/WebM, tela cheia,
  funciona no Android, no iOS e na web;
- **Tudo do repositório** — os 5 addons com metadados do XML + os demais pacotes (`+18Play`, `cloudrequest`, `Plugins - Extrair`) com metadados lidos de dentro dos próprios zips (incluindo trava de idade +18) e inventário completo de arquivos;
- **Repositórios Kodi** — leia qualquer outro repositório como o Kodi faz (addons.xml + datadir), com download dos addons, refresh e importação por URL ou texto colado;
- **Login e senha** — tela de login/registro; com **Supabase** configurado usa email/senha real (sessão gerenciada pelo SDK); sem ele, fallback local (hash PBKDF2);
- **Painel administrativo (fora do site)** — área separada em `#/admin`, com login próprio de administrador, painel de vendas (cadastro de **clientes** e **vendedores**), dashboard com receita estimada e **todas as configurações do site** (identidade, aviso, Telegram, repositório, categorias visíveis e planos de venda);
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

## Streams reais da TV ao vivo

O addon do repositório resolve a TV ao vivo em runtime: ele lê um `channels.xml` (contas
XC-IPTV em base64) e monta a URL `live/<usuário>/<senha>/<canal>.m3u8` — exatamente como o
script `scripts/extract-streams.mjs` replica (decodificado do próprio addon).

- `bun run streams` baixa o `channels.xml`, valida as contas ativas (player_api), casa os
  títulos com os 88 canais do catálogo e gera `channel-streams.json` com as URLs reais;
- `bun run generate` incorpora os streams no catálogo (player, prévias e modal passam a
  reproduzir o **sinal real** dos canais encontrados);
- Canais sem correspondência no channels.xml seguem com **prévia de demonstração** (CC) para a
  experiência nunca ficar parada;
- O player também aceita qualquer link m3u8/mp4 colado manualmente ("Assistir por link").

> **Filmes/Séries/Animes/Doramas (VOD)**: o catálogo e a reprodução vêm das mesmas fontes que
> o addon usa (bases XML públicas + API de resolução) — ver seções abaixo.

## Catálogo VOD real (Filmes, Séries, Animes, Doramas, Novelas, Desenhos)

O addon monta esses menus a partir de XMLs públicos (gists do dono do repositório). O app
baixa as mesmas 6 bases e gera `public/vod/<categoria>.json` (carregados sob demanda):

- `bun run vod` baixa as bases (37 mil títulos: 17,5 mil filmes, 12,8 mil séries, animes,
  doramas, novelas e desenhos), limpa as tags do Kodi, extrai sinopse/avaliação/gênero/ano
  e gera os arquivos (falhas de rede mantêm o catálogo anterior — o build não quebra);
- A Home ganha fileiras "Filmes / Séries / Animes / Doramas / Novelas / Desenhos" (com
  posters TMDB), a página de categoria vira uma grade com "Carregar mais", e a busca
  procura também no catálogo (títulos);
- Cada item guarda o **link de resolução do addon** (`resolver3_mv=`, `resolver2_tvshows=`…);
  tocar o título resolve esse link para uma URL de vídeo real via **bot** (abaixo).

## Bot de resolução VOD (`api/resolver.py`)

O addon resolve Filmes/Séries/Animes/Doramas/Novelas/Desenhos por uma **API central de
resolução** (geekantenado, token embutido no addon) que devolve URLs de vídeo diretas
(MP4/HLS do S3), além de **raspar sites externos** para formatos alternativos (Overflix,
animesonlinecc, doramasonline, novefx, askflix) usando o próprio "proxy de fetch" da API.
O navegador não pode chamar nada disso (sem CORS / Cloudflare), então o **bot** (ao lado do
app, `api/resolver.py` — Python puro, sem dependências) faz o proxy com CORS + cache e
**normaliza tudo num contrato único**:

```json
{"kind": "stream",  "stream": "https://..."}
{"kind": "seasons", "seasons": [{"name": "...", "episodes": [
    {"name": "...", "link": "...", "direct": true|false, "resolver": N}]}]}
{"kind": "error",   "message": "..."}
```

- `GET /api/resolver?resolver=N&request=<op>` — `resolver>0` para a API
  (`mvshows=`, `tvshows=`, `episodes=`); `resolver=0` aceita a opção crua do addon
  (`animes2=`, `movie2=`, `serie3=`, `animes3=`, `doramas_resolver1=`, `novelas=`,
  `novelas2=`, `ep=`);
- **Todos os 37.599 títulos do catálogo têm caminho de resolução**: filmes (93% via API),
  séries (100% via API), animes/doramas/novelas/desenhos via API + scrapers como fallback
  na ordem do addon;
- No hosting do Freebuff, `api/*.py` é instalado e executado automaticamente; no dev local,
  rode `PORT=8787 python3 api/resolver.py` e aponte `VITE_BOT_URL=http://localhost:8787`;
- No app: ▶ Assistir no modal do título → resolve → toca direto (os vídeos são MP4/HLS
  públicos); séries abrem a lista de temporadas/episódios primeiro;
- Quando um servidor externo está fora/bloqueado (ex.: Overflix em manutenção, site com
  Cloudflare), o bot devolve um **erro claro em português** no modal — sem quebra, e o app
  tenta a próxima opção do título automaticamente;
- Se o bot não estiver no ar, o modal mostra o motivo — o resto do site continua 100%
  funcional.

## Como o roteamento foi descoberto (o "mapeamento" do addon)

Dentro dos zips, `default.py`/`codec.py` vêm ofuscados ("encoded by Kodi": base64 invertido +
zlib, em camadas). O código decodificado revela os **dois mecanismos** que o Kodi usa:

- **TV ao vivo**: `chresolver1=<canal>#<grupo>` → `channels.xml` (XC-IPTV) — replicado pelo
  script `extract-streams.mjs` (sem bot, streams reais gerados);
- **VOD**: bases XML públicas (gists) para o catálogo + **API central de resolução**
  (geekantenado, com token embutido no addon) que devolve URLs de vídeo diretas — o bot
  `api/resolver.py` faz o proxy dessa API para o navegador.

## Painel administrativo (`#/admin`)

Área **separada do site do cliente**: acessível apenas por URL direta (`#/admin` ou pelo link
"Painel administrativo" em Mais → Conta), com tela própria de login.

- **Primeiro acesso**: o painel pede para criar a conta de administrador (nome, e-mail e senha);
  depois é só entrar (senha com hash PBKDF2, sessão persistida no dispositivo).
- **Painel (dashboard)**: clientes ativos/pendentes, **contas de teste**, total e receita
  estimada (testes entram como grátis); vendedores com contagem de clientes; clientes recentes
  com botão de **aprovação rápida**.
- **Clientes**: cadastro completo (nome, telefone, e-mail, plano, valor, status, vendedor
  responsável e observações), busca e filtros (status e tipo de conta), editar/excluir.
  Cada cliente tem **tipo de conta (teste ou permanente)**, **desconto (%)** com valor
  recalculado sobre o plano e **acesso controlado** (TV ao vivo + categorias) — quando o
  cliente entra no app com o e-mail cadastrado, só vê o que o plano dele permite.
- **Aprovação do administrador**: quando "exigir aprovação" está ativo (padrão), toda conta
  nova entra como **pendente** — o cliente consegue logar, mas vê a tela "aguardando
  aprovação" em vez do conteúdo até o administrador clicar em **Aprovar acesso** (no card
  do cliente ou no dashboard).
- **Conta de teste (para vendas)**: botão "+ Conta de teste" cria uma conta temporária
  (grátis, com validade em dias), **gera as credenciais automaticamente** e entrega **por
  e-mail** (mensagem pronta para copiar no WhatsApp/Telegram ou enviar por e-mail — avisando
  que o acesso depende da aprovação). O desconto fica limitado ao limite do vendedor escolhido.
- **Vendedores**: cadastro com comissão (%), **limite de desconto que pode aplicar**, **pode
  criar contas de teste** (com duração padrão própria) e status ativo/inativo; ao excluir, os
  clientes vinculados ficam sem vendedor.
- **Configurações do site**: nome, slogan, aviso exibido no topo da Home, link do Telegram
  (rodapé), link do repositório Kodi, **categorias visíveis** na Home, **vendas** (duração
  padrão de conta de teste), **exigir aprovação do administrador** (liga/desliga a trava de
  acesso) e **planos de venda** (usados no cadastro de clientes). As mudanças refletem no app
  imediatamente.

> **Armazenamento**: enquanto o Supabase não estiver configurado, os dados do painel (config,
> clientes e vendedores) ficam salvos no dispositivo (localStorage). Com o Supabase configurado
> e as tabelas criadas, os dados passam a viver no banco e o painel funciona de qualquer
> dispositivo (veja abaixo).

## Supabase (backend)

O Supabase ativa o **login real por email/senha** e, com as tabelas criadas, guarda **todos os
 dados do painel no banco** (clientes, vendedores, configurações e aprovações) — o fluxo de
vendas e a aprovação do administrador passam a valer em produção, com clientes reais em
qualquer dispositivo.

### 1. Configurar as chaves

1. Crie um projeto no Supabase e copie o **Project URL** e a **anon key**;
2. Cole-os na aba de chaves/API keys do Freebuff com os nomes `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`;
3. Feito isso, a tela de login passa a usar o Supabase (sessão persistida, logout, confirmação de e-mail).
Sem as chaves, o app usa o login local (por dispositivo).

### 2. Criar as tabelas do painel

Abra o **SQL Editor** do seu projeto Supabase, cole e execute o conteúdo de
`supabase/migrations/0001_admin_tables.sql`. Ele cria:

- `admins` — e-mails autorizados a operar o painel;
- `site_config` — configurações do site (uma linha);
- `sellers` — vendedores;
- `clients` — clientes, com tipo de conta (teste/permanente), status (ativo/pendente/inativo),
  desconto, acesso por categoria e validade do teste;
- um **trigger** que cria automaticamente o registro do cliente no cadastro (status
  **pendente** quando "exigir aprovação" está ativo) e vincula ao login;
- **RLS**: o administrador gerencia tudo; cada cliente só lê o próprio registro; o site lê a
  configuração publicamente.

### 3. Cadastrar o administrador

No fim do SQL (ou depois, à vontade), execute com o **seu** e-mail:

```sql
insert into public.admins (email) values ('seu-email@exemplo.com')
on conflict (email) do nothing;
```

Depois disso, em `#/admin`, o login passa a usar a **conta do Supabase** (email/senha) e o
painel carrega os dados do banco. O e-mail usado no login precisa estar na tabela `admins` —
senão o acesso é negado.

### Comportamento da sincronização

- **Primeira vez**: se o banco estiver vazio e houver dados salvos neste dispositivo, eles são
  enviados como semente (migração automática). Depois, o banco é a fonte da verdade.
- O painel avisa quando o Supabase está configurado mas as tabelas ainda não existem (o SQL
  não foi rodado) — nesse caso tudo continua salvo só no dispositivo.
- Clientes criados pela tela **"+ Conta de teste"** ficam no banco com status pendente; quando
  a pessoa fizer o cadastro com o mesmo e-mail, o login vincula automaticamente o registro ao
  perfil e a aprovação do administrador passa a valer.
- Sem Supabase configurado, nada muda: painel e dados 100% locais.

> Para sincronizar favoritos por usuário no banco (Postgres), crie uma tabela `favorites`
> (`user_id`, `channel_id`, `created_at`) com RLS — posso fornecer o SQL pronto.

## PWA / instalação

- `public/manifest.webmanifest` + `public/sw.js` (registrado só em produção).
- Android/Chrome: instalar pelo menu do navegador; iOS: "Adicionar à Tela de Início" no Safari.
- Ícone do app: `addons/repo/Plugins/plugin.video.BrazucaPlay/icon.png`.

## Deploy

- **Freebuff hosting**: install `bun install` · build `bun run build` · preview `bun run dev`
- **GitHub Pages**: `.github/workflows/static.yml` instala, gera e publica `dist/`

© 2026 — Binhoplay: projeto comunitário, sem anúncios e com comunicação transparente.
