# Rádio Sync: padrões do projeto

App Next.js (App Router) 100% client-side e estático, pensado para iPhone (PWA). Sem backend,
sem banco: o estado do usuário fica no `localStorage`.

## Arquitetura em camadas

1. **Lógica pura** em `lib/*.ts` (`sync-engine`, `calibration`, `stats`):
   sem React, sem `window`/`localStorage`, sem o global `YT`. Dependências externas entram por
   parâmetro (ex.: `PlayerLike`, relógio `now`, `at`). Toda regra de negócio nova começa aqui.
2. **Adaptadores do navegador** em `lib/`: hooks `use-*.ts` (React + APIs do browser) e players
   que implementam `PlayerLike` (`youtube.ts`, `hls-player.ts`). Uma fonte de áudio nova entra
   como um novo `PlayerLike`; o `SyncEngine` não muda. Funções expostas por hooks são estáveis
   (`useCallback` + ref) para uso em callbacks.
3. **Componentes** em `components/`: só orquestração e tela. Nada de cálculo de sincronização
   ou de estatística dentro do componente.

## Convenções

- **Testes**: toda lógica pura tem teste em `tests/<módulo>.test.ts` (Vitest, ambiente node).
  Simule player/relógio com fakes em vez de mocks do browser.
- **Antes de commitar**: `npm test`, `npm run typecheck` e `npm run build` precisam passar
  (a Vercel publica a cada push na `main`).
- **Persistência**: sempre via `storage` de `lib/storage.ts` (tolera modo privado/sem espaço).
  Chaves atuais: `lastUrl`, `recent`, `delay:<videoId>`, `delay:hls:<url>`. Mudou o formato de uma
  chave? Trate o valor antigo ao ler.
- **Tempo**: segundos em `number`, precisão de 0,1 s (`round1`). Formatação para a tela com
  `fmt`/`signed` (pt-BR).
- **Textos da interface** em português do Brasil, curtos, dizendo o que fazer a seguir.
- **Comentários**: explicam o porquê (limitações do iOS/YouTube, decisões), não o quê.
- **Estilo**: CSS global em `app/globals.css` com as variáveis de `:root`; sem biblioteca de UI.
- **Sem dependências novas** sem necessidade clara; o app deve continuar estático. Dependência
  pesada usada por só uma fonte é carregada sob demanda (`await import('hls.js')`), com versão exata.
- **Compatibilidade iOS**: `play()` só a partir de um toque; nada que exija HTTPS deve quebrar
  em `http://<ip>` (ex.: não usar `crypto.randomUUID`).
