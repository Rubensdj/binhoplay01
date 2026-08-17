# Rodar o bot em casa (IP residencial — grátis, "igual ao Kodi")

Alguns sites de conteúdo (ex.: `animesonlinecc.to`) bloqueiam IPs de
datacenter (servidores/VPS). O Kodi funciona em casa porque usa o **IP
residencial da sua internet**. Dá para ter o mesmo efeito de graça:
**rodar o bot `api/resolver.py` numa máquina da sua casa** e apontar o
site para ele. O bot passa a resolver o conteúdo "de casa" — exatamente
como o Kodi faz.

## Como funciona

```
Site (hospedagem)  ──►  Bot da sua casa (IP residencial)  ──►  fontes de conteúdo
                            ↑
                 Cloudflare Tunnel (grátis, sem abrir porta)
```

O site chama o bot pela URL pública do túnel. Nenhuma porta precisa ser
aberta no seu roteador; o túnel é uma conexão de saída (segura).

---

## Passo 1 — Preparar a máquina de casa

Qualquer máquina que fique ligada serve: PC velho, notebook, Raspberry Pi,
ou até um celular com Termux (Android).

Requisitos:
- Python 3.9+
- Internet de casa (banda de upload ajuda para streams que precisam do proxy)

Instale as dependências:

```bash
pip install requests pycryptodomex
```

## Passo 2 — Baixar o bot

Copie o arquivo `api/resolver.py` do repositório (ou clone o repositório):

```bash
git clone https://github.com/Rubensdj/brazucaplay.git  # ou o endereço atual
cd brazucaplay/api
```

## Passo 3 — Criar o token de proteção (recomendado)

O túnel fica público — qualquer um que descobrir a URL poderia usar sua
banda. Proteja com um token:

```bash
# escolha uma senha longa
export BOT_TOKEN="cole-uma-senha-forte-aqui"
```

## Passo 4 — Rodar o bot

```bash
PORT=8787 python3 resolver.py
```

Deve aparecer:
```
Runtime do addon Kodi ouvindo em http://0.0.0.0:8787
```

Teste local: abra `http://localhost:8787/` no navegador — deve mostrar
`{"ok": true, ...}`.

## Passo 5 — Criar o túnel público (grátis)

Instale o **Cloudflare Tunnel** (`cloudflared`) na máquina de casa:

- Windows: baixe o `cloudflared-windows-amd64.exe` de
  https://github.com/cloudflare/cloudflared/releases
- Linux: `curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared && chmod +x cloudflared`

Rode (sem conta, URL temporária):

```bash
./cloudflared tunnel --url http://localhost:8787
```

Ele imprime um endereço tipo:
```
https://qualquer-coisa.trycloudflare.com
```

Esse endereço é a URL pública do seu bot. **Não feche essa janela.**

> Para um endereço fixo (recomendado), crie uma conta grátis na Cloudflare
> e use `cloudflared tunnel create` + rota de DNS — o endereço nunca muda.

## Passo 6 — Apontar o site para o bot

Na aba de **chaves/Keys do Freebuff** (produção), adicione:

| Chave | Valor |
|---|---|
| `VITE_BOT_URL` | `https://qualquer-coisa.trycloudflare.com` (URL do túnel) |
| `VITE_BOT_TOKEN` | a mesma senha do Passo 3 (se criou) |

Faça o **redeploy**. O site passa a resolver todo o conteúdo pelo bot da
sua casa — incluindo os animes que estavam bloqueados.

## Verificação

Abra o site e teste um anime que antes dava erro (ex.: um título com
"fonte não retornou dados"). Se abrir os episódios, está funcionando.

## Observações honestas

- **Banda de upload**: streams que exigem headers (muitos canais de TV,
  alguns filmes) passam pelo proxy do bot → consomem **upload** da sua
  internet de casa (uns 5–15 Mbps por stream). Para 1–2 telas em casa, é
  tranquilo em conexões comuns. Streams diretos (sem headers) vão direto
  do CDN, sem passar por você.
- **A máquina de casa precisa ficar ligada** com o bot + túnel rodando.
  Se cair, o site usa o fallback estático (navegação continua; reprodução
  ao vivo fica limitada).
- **Sem o token**, qualquer pessoa com a URL do túnel pode usar sua banda —
  por isso o Passo 3 é recomendado.
- O bot em casa também resolve **futuros** bloqueios de datacenter, porque
  passa a "morar" num IP residencial — igual ao Kodi.
