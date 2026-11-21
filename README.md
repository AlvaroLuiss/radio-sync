# Rádio Sync

Sincroniza o áudio de uma rádio (live no YouTube ou stream HLS `.m3u8`) com o jogo na TV,
atrasando o rádio até bater com a imagem. Pensado para iPhone (PWA na Tela de Início).

Exemplo de stream HLS que funciona (Rádio Gaúcha, com HTTPS e CORS liberado):
`https://liverdgaupoa.rbsdirect.com.br/primary/gaucha_rbs.sdp/playlist.m3u8`
(endereço da emissora; pode mudar sem aviso).

## Rodar localmente

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # testes da lógica (sincronização e calibração)
npm run typecheck
```

Para testar no iPhone na mesma rede: `npm run dev -- -H 0.0.0.0` e abra `http://<ip-do-pc>:3000`.
Atenção: o Wake Lock (tela ligada) só funciona em HTTPS, então teste o fluxo completo pelo deploy.

## Deploy na Vercel

1. Suba o projeto para um repositório no GitHub.
2. Na Vercel: **Add New › Project**, importe o repositório. As configurações padrão de Next.js já servem.
3. Abra a URL no Safari do iPhone › Compartilhar › **Adicionar à Tela de Início**.

Ou pela CLI: `npx vercel` (preview) e `npx vercel --prod`.

## Estrutura

```
app/
  layout.tsx          metadata, viewport e meta tags de web app do iOS
  manifest.ts         manifest do PWA
  page.tsx
  globals.css
components/
  RadioSync.tsx       tela: player, ajustes, calibração e ressincronizar
lib/
  sync-engine.ts      motor de sincronização (sem React, testável)
  sources.ts          reconhece o link: YouTube ou stream HLS
  hls-player.ts       player de rádio web (hls.js) com a interface do motor
  recent.ts           últimos 3 links usados (sem repetir, com título da live)
  use-recent.ts       hook: estado e persistência dos recentes
  calibration.ts      calibração por vários lances (mediana)
  stats.ts            mediana e arredondamento
  youtube.ts          parse do link, carregamento da IFrame API, mensagens de erro
  use-wake-lock.ts    hook para manter a tela ligada
  storage.ts          localStorage seguro + formatação pt-BR
tests/
  sync-engine.test.ts player de live falso cobrindo calibração, pulo e travada
  calibration.test.ts
  sources.test.ts
  recent.test.ts
```

Padrões de arquitetura e convenções: veja [CLAUDE.md](CLAUDE.md).

## Calibração por vários lances

Cada lance calibrado vira uma estimativa do atraso ideal; o app aplica a **mediana** dos últimos
lances (até 5, dentro de 15 min), então um toque errado não estraga o ajuste. A conta recomeça
ao trocar de live ou ao ressincronizar.

## Como a sincronização funciona

Ao começar a tocar, o motor marca uma âncora: "este ponto é o ao vivo". A posição esperada do
player passa a ser `âncora + tempo decorrido − atraso`. A cada segundo ele compara com a posição real:

- **rádio adiantado** (o YouTube pulou para o ao vivo): pausa pelo tempo do erro;
- **rádio atrasado** (travou carregando): avança no vídeo, passando um pouco do ponto, e corrige com pausa.

Calibração: `diferença = momento em que viu na TV − momento em que ouviu no rádio`, somada ao atraso atual.

### Rádio web (HLS)

Streams de rádio costumam não ter DVR (a playlist da Gaúcha guarda só ~20 s), então não dá para
"voltar no tempo" como no YouTube. O `hls-player.ts` usa o hls.js com buffer de até 300 s: ele
continua baixando com o áudio pausado, então a pausa do motor vira atraso e diminuir o atraso é
avançar dentro do que já foi baixado. O mesmo `SyncEngine` controla os dois tipos de fonte.

Requisitos do stream: `.m3u8`, `https://` e CORS liberado (`Access-Control-Allow-Origin`).
Atraso máximo: 300 s.

## Limitações conhecidas (v0.1)

- O áudio do YouTube embutido para quando a tela apaga, por isso o app mantém a tela ligada.
- Se o iOS bloquear o play automático depois de uma pausa de correção, o app pede um toque no ▶.
  Alternativa a avaliar: corrigir recuando no vídeo (`seekTo`) em vez de pausar.
- Lives com incorporação desativada pela rádio não tocam (erros 101/150).
- Rádio web: o stream HLS já chega ~10–20 s depois do ao vivo. Se a TV for mais rápida que isso
  (ex.: antena), o rádio fica atrás da TV e o app não consegue corrigir (só atrasa, não adianta).
- Rádio web no iPhone usa ManagedMediaSource (iOS 17.1+). Em iPhones mais antigos cai no HLS nativo,
  sem controle do buffer, e o app avisa que o atraso pode não se manter.
- Streams `.mp3`/`.aac` (Icecast/Shoutcast) e páginas de rádio ainda não são aceitos.

## Próximos passos

- Etapa 2: lista de rádios favoritas, histórico de atraso por rádio.
- Etapa 3: streams Icecast/Shoutcast (`.mp3`/`.aac`). Exigem CORS liberado ou um proxy, que
  precisa rodar num serviço com conexão longa (Railway, Fly.io), não em função serverless.
