# Ankore CLI

<p align="center">
  <img src="./ankore-logo.png" alt="Ankore Logo" width="220" />
</p>

CLI em Node.js para criar cards de sentence mining para o Anki com interface visual no terminal.

## O que faz

1. Recebe uma palavra em ingles.
2. Busca significado em ingles e transcricao fonetica via API publica.
3. Busca frases reais em contexto (Tatoeba + Quotable + exemplos de dicionario), sem templates genericos inserindo a palavra.
4. Monta preview do card:
   - Front: frase com a palavra em destaque (`<b>word</b>`)
   - Front: audio do Anki ao final (`[sound:arquivo.mp3]`)
   - Back: labels `Meaning` e `Phonetic` em fonte menor, com fonetica em negrito
   - Back opcional: `Literal (pt-BR)` quando voce habilita traducao literal
5. Permite aceitar, trocar a frase sugerida, editar frase manualmente, incluir/remover traducao literal pt-BR no verso ou pular card.
6. Mantem cards em memoria ate o comando final.
7. Gera arquivo `.tsv` otimizado para importacao no Anki (UTF-8 BOM, sem cabecalho, 2 colunas).
8. Exibe UI melhorada com:
   - Cores adaptadas ao terminal (`chalk` + `supports-color`)
   - Tabela no preview (`cli-table3`)
   - Spinner durante busca/escrita (`ora`)
   - Icones para feedback (`figures`)
   - Prompts interativos (`@inquirer/prompts`)
9. Oferece modo watch para capturar palavras copiadas no clipboard em background.
10. No inicio de cada sessao, limpa arquivos antigos e preserva apenas `.keep` em `session-output/exports`.
11. Gera audio local com Piper (modelo `en_US-ryan-high`) e converte para MP3 com ffmpeg usando nome deterministico `ankore-<sha1(texto)>.mp3`.

## Requisitos

- Node.js 18+
- Piper no sistema (opcional; se nao existir, a CLI baixa o binario automaticamente em Linux x64/arm64)
- ffmpeg no sistema (opcional; se nao existir, a CLI usa/instala `ffmpeg-static` automaticamente)
- Modelo Piper `en_US-ryan-high.onnx`
- Se o modelo nao existir localmente, a CLI baixa automaticamente de:
  - `https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ryan/high`

Variaveis de ambiente para audio local:

- `ANKORE_PIPER_MODEL_PATH` (opcional): use somente se o modelo estiver em local customizado
- `ANKORE_PIPER_BIN` (opcional): use somente se o binario Piper estiver em local customizado
- `ANKORE_FFMPEG_BIN` (opcional): use somente se o binario ffmpeg estiver em local customizado
- `ANKORE_TTS_STRATEGY` (opcional): estrategia de TTS (`piper`)
- `ANKORE_TTS_MODEL` (opcional): modelo de voz para a estrategia selecionada (ex: `en_us-ryan-high`)
- `ANKORE_AUDIO_PLAYER` (opcional): define player para preview de audio (ex: `ffplay`, `mpg123`, `afplay`)
- `ANKORE_AUDIO_PLAYER_ARGS` (opcional): argumentos extras para `ANKORE_AUDIO_PLAYER`
- `ANKORE_PIPER_MODEL` (opcional): atalho especifico do Piper para escolher modelo por ID

Deteccao automatica (sem configurar PATH):

- Piper: `~/.cache/ankore/piper/`, `tools/piper/piper`, `vendor/piper/piper`, `bin/piper`, `~/.local/bin/piper`, `/usr/local/bin/piper`, `/usr/bin/piper` e download automatico do release `2023.11.14-2` quando nao encontrado
- Modelo: `models/en_US-ryan-high.onnx`, `models/piper/en_US-ryan-high.onnx`, `assets/piper/en_US-ryan-high.onnx`, `~/.local/share/piper/`, `~/.cache/piper/`, `/usr/local/share/piper/`, `/usr/share/piper/`
- ffmpeg: `tools/ffmpeg/ffmpeg`, `vendor/ffmpeg/bin/ffmpeg`, `bin/ffmpeg`, `~/.local/bin/ffmpeg`, `/usr/local/bin/ffmpeg`, `/usr/bin/ffmpeg`

## Como usar

```bash
make install
ankore start
```

Modo watch (captura via clipboard):

```bash
ankore start --watch
```

Fluxo na CLI:

- Digite uma palavra em ingles (ex: `improve`)
- Veja o preview
- Escolha no menu interativo: ouvir audio da frase (preview), aceitar, trocar frase sugerida, editar frase manualmente, incluir/remover traducao literal pt-BR no verso ou pular
- Quando terminar o dia, digite `/finish`
- Informe o nome do arquivo `.tsv` (ou use o default)
- O arquivo final vai para `session-output/exports/`

Fluxo no modo watch:

- Copie uma palavra em ingles com `Ctrl+C`
- A palavra e capturada automaticamente e segue para revisao do card
- Continue copiando novas palavras
- Se ficar ocioso sem novas palavras, a CLI sugere gerar o arquivo final e encerrar
- Use `Ctrl+C` para encerrar o modo watch e salvar o arquivo final
- Os audios de cada card ficam em `session-output/exports/` junto com o `.tsv`

Atalhos uteis:

- `Ctrl+C`: encerra a sessao (se houver cards, gera `.tsv` automatico com nome padrao)

## Importacao no Anki

Ao importar o arquivo `.tsv`:

- Campo 1 -> Front
- Campo 2 -> Back
- Permita HTML para manter o `<b>...</b>` no front
- Delimitador: `Tab`
- O arquivo e exportado sem linha de cabecalho
- Os `.mp3` sao gerados diretamente em `session-output/exports/`
- Importe o `.tsv` a partir de `session-output/exports/` para facilitar o reconhecimento das midias
- Ao final da sessao, a CLI pergunta a pasta `collection.media` para copiar os audios automaticamente
- Voce pode definir `ANKORE_ANKI_MEDIA_DIR` para preencher esse caminho automaticamente

## Estrutura do projeto

- `src/index.ts`: orquestracao do fluxo CLI
- `src/modes/registry.ts`: registry de modos para facilitar extensao
- `src/modes/index.ts`: ponto unico de registro de modos disponiveis
- `src/lib/ui.ts`: prompts e output visual no terminal
- `src/lib/word-data.ts`: integracao com APIs e montagem de dados da palavra
- `src/lib/card-session.ts`: revisao do card e acoes de troca/edicao
- `src/lib/anki-export.ts`: formatacao e exportacao para Anki
- `src/lib/tts.ts`: orquestracao de audio local (Piper + ffmpeg)
- `src/lib/tts-strategies.ts`: selecao de estrategia de TTS (strategy pattern)
- `src/lib/piper.ts`: wrapper do processo Piper via CLI
- `src/lib/session-storage.ts`: limpeza e gerenciamento de `session-output/exports`
- `src/lib/text.ts`: utilitarios de texto e destaque

## Makefile

- `make install`: instala dependencias e registra o comando global `ankore` via `npm link`
- `make build`: compila TypeScript para `dist/`
- `make start`: executa `ankore start`
- `make watch`: executa `ankore start --watch`
- `make check`: valida sintaxe do arquivo principal
- `make test`: roda testes unitarios
- `make format`: formata codigo com Prettier
- `make sample-export`: gera `examples/sample-anki-import.tsv` para testar importacao no Anki
- `make dev`: instala e inicia em sequencia

## Scripts npm

- `npm run build`: compila TypeScript para `dist/`
- `npm start`: compila e executa `ankore start`
- `npm run watch`: compila e executa `ankore start --watch`
- `npm run sample-export`: compila e executa `ankore sample-export`
- `npm run check`: compila e valida sintaxe dos arquivos gerados em `dist/`
- `npm run typecheck`: roda checagem de tipos TypeScript sobre os arquivos do projeto
- `npm run test`: roda testes unitarios com Vitest
- `npm run format`: aplica formatacao com Prettier
- `npm run lint-staged`: executa formatacao em arquivos staged

## TypeScript

O projeto agora usa TypeScript como linguagem principal:

- Fontes em `src/**/*.ts`
- Build para `dist/` via `tsconfig.build.json`
- Tipos globais e utilitarios avancados em `src/types.d.ts`
- Dependencias de desenvolvimento: `typescript` e `@types/node`

## Feedback Loop

O projeto usa um ciclo automatico de feedback para proteger commits:

- `npm run typecheck` valida tipos
- `npm run test` valida regras de negocio com Vitest
- `lint-staged` formata arquivos staged com Prettier
- Hook `.husky/pre-commit` executa tudo antes do commit

## Comandos Ankore

- `ankore start`: inicia o modo de sentence mining (default)
- `ankore start mining`: inicia explicitamente o modo de sentence mining
- `ankore start --watch`: inicia o modo mining com clipboard watch
- `ankore start mining --watch`: equivalente explicito do comando acima
- `ankore sample-export`: gera um arquivo exemplo para importacao
- `ankore help`: mostra ajuda de comandos

## Arquitetura de modos

O CLI esta preparado para novos modos em `ankore start <modo>`.

- Registro central de modos: `src/modes/index.ts`
- Contratos e lifecycle dos modos: `src/modes/registry.ts`
- Implementacao do modo mining: `src/modes/mining/index.ts`
- Definicao do modo mining (normalizacao de opcoes): `src/modes/mining/mode.ts`
- Para adicionar novos modos (ex: grammar), crie `src/modes/<novo>/mode.ts` e registre no array de `src/modes/index.ts`.

## Arquitetura de TTS

O TTS tambem usa registry para facilitar novos provedores e modelos.

- Registro e resolucao de estrategias: `src/lib/tts-strategies.ts`
- Integracao com Piper e catalogo de modelos: `src/lib/piper.ts`
- Fluxo de geracao de audio no app: `src/lib/tts.ts`

Para adicionar um novo modelo Piper, inclua uma entrada em `PIPER_MODELS` em `src/lib/piper.ts`.
Para adicionar um novo provedor TTS, registre uma nova estrategia em `STRATEGIES` em `src/lib/tts-strategies.ts`.
