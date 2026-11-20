# Rádio Sync

Sincroniza o áudio de uma live de rádio no YouTube com o jogo na TV, atrasando o rádio
até bater com a imagem. Pensado para iPhone (PWA na Tela de Início).

## Rodar localmente

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # testes do motor de sincronização
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
  youtube.ts          parse do link, carregamento da IFrame API, mensagens de erro
  use-wake-lock.ts    hook para manter a tela ligada
  storage.ts          localStorage seguro + formatação pt-BR
tests/
  sync-engine.test.ts player de live falso cobrindo calibração, pulo e travada
```

## Como a sincronização funciona

Ao começar a tocar, o motor marca uma âncora: "este ponto é o ao vivo". A posição esperada do
player passa a ser `âncora + tempo decorrido − atraso`. A cada segundo ele compara com a posição real:

- **rádio adiantado** (o YouTube pulou para o ao vivo): pausa pelo tempo do erro;
- **rádio atrasado** (travou carregando): avança no vídeo, passando um pouco do ponto, e corrige com pausa.

Calibração: `diferença = momento em que viu na TV − momento em que ouviu no rádio`, somada ao atraso atual.

## Limitações conhecidas (v0.1)

- O áudio do YouTube embutido para quando a tela apaga, por isso o app mantém a tela ligada.
- Se o iOS bloquear o play automático depois de uma pausa de correção, o app pede um toque no ▶.
  Alternativa a avaliar: corrigir recuando no vídeo (`seekTo`) em vez de pausar.
- Lives com incorporação desativada pela rádio não tocam (erros 101/150).

## Próximos passos

- Etapa 2: lista de rádios favoritas, histórico de atraso por rádio.
- Etapa 3: modo "stream direto" (Icecast/Shoutcast) com proxy + Web Audio `DelayNode`.
  O proxy precisa rodar num serviço com conexão longa (Railway, Fly.io), não em função serverless.
