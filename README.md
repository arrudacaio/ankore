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

## Requisitos

- Node.js 18+

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
- Escolha no menu interativo: aceitar, trocar frase sugerida, editar frase manualmente, incluir/remover traducao literal pt-BR no verso ou pular
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

- `src/index.js`: orquestracao do fluxo CLI
- `src/lib/ui.js`: prompts e output visual no terminal
- `src/lib/word-data.js`: integracao com APIs e montagem de dados da palavra
- `src/lib/card-session.js`: revisao do card e acoes de troca/edicao
- `src/lib/anki-export.js`: formatacao e exportacao para Anki
- `src/lib/tts.js`: geracao de audio TTS (en-US)
- `src/lib/session-storage.js`: limpeza e gerenciamento de `session-output/exports`
- `src/lib/text.js`: utilitarios de texto e destaque

## Makefile

- `make install`: instala dependencias e registra o comando global `ankore` via `npm link`
- `make start`: executa `ankore start`
- `make watch`: executa `ankore start --watch`
- `make check`: valida sintaxe do arquivo principal
- `make sample-export`: gera `examples/sample-anki-import.tsv` para testar importacao no Anki
- `make dev`: instala e inicia em sequencia

## Scripts npm

- `npm start`: executa `ankore start`
- `npm run watch`: executa `ankore start --watch`
- `npm run sample-export`: executa `ankore sample-export`
- `npm run check`: valida sintaxe do arquivo principal

## Comandos Ankore

- `ankore start`: inicia o modo de sentence mining (default)
- `ankore start mining`: inicia explicitamente o modo de sentence mining
- `ankore start --watch`: inicia o modo mining com clipboard watch
- `ankore start mining --watch`: equivalente explicito do comando acima
- `ankore sample-export`: gera um arquivo exemplo para importacao
- `ankore help`: mostra ajuda de comandos

## Arquitetura de modos

O CLI esta preparado para novos modos em `ankore start <modo>`.

- Registro de modos: `src/index.js`
- Implementacao do modo mining: `src/modes/mining/index.js`
- Para adicionar novos modos (ex: grammar), basta registrar no `MODE_REGISTRY`.
