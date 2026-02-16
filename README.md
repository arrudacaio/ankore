# Ankore CLI

<p align="center">
  <img src="./ankore-logo.png" alt="Ankore Logo" width="220" />
</p>

CLI em Node.js para criar cards de sentence mining para o Anki com interface visual no terminal.

## O que faz

1. Recebe uma palavra em ingles.
2. Busca significado em ingles e transcricao fonetica via API publica.
3. Busca frases reais usando API externa por palavra (quotable) para diversificar o front.
4. Monta preview do card:
   - Front: frase com a palavra em destaque (`<b>word</b>`)
   - Back: labels `Meaning` e `Phonetic` em fonte menor, com fonetica em negrito
5. Permite aceitar, trocar a frase sugerida, editar frase manualmente ou pular card.
6. Mantem cards em memoria ate o comando final.
7. Gera arquivo `.tsv` otimizado para importacao no Anki (UTF-8 BOM, sem cabecalho, 2 colunas).
8. Exibe UI melhorada com:
   - Cores adaptadas ao terminal (`chalk` + `supports-color`)
   - Tabela no preview (`cli-table3`)
   - Spinner durante busca/escrita (`ora`)
    - Icones para feedback (`figures`)
    - Prompts interativos (`@inquirer/prompts`)
9. Oferece modo watch para capturar palavras copiadas no clipboard em background.

## Requisitos

- Node.js 18+

## Como usar

```bash
make install
make start
```

Modo watch (captura via clipboard):

```bash
make watch
```

Fluxo na CLI:

- Digite uma palavra em ingles (ex: `improve`)
- Veja o preview
- Escolha no menu interativo: aceitar, trocar frase sugerida, editar frase manualmente ou pular
- Quando terminar o dia, digite `/finish`
- Informe o nome do arquivo `.tsv` (ou use o default)

Fluxo no modo watch:

- Copie uma palavra em ingles com `Ctrl+C`
- A palavra e capturada automaticamente e segue para revisao do card
- Continue copiando novas palavras
- Se ficar ocioso sem novas palavras, a CLI sugere gerar o arquivo final e encerrar
- Use `Ctrl+C` para encerrar o modo watch e salvar o arquivo final

Atalhos uteis:

- `Ctrl+C`: encerra a sessao (se houver cards, gera `.tsv` automatico com nome padrao)

## Importacao no Anki

Ao importar o arquivo `.tsv`:

- Campo 1 -> Front
- Campo 2 -> Back
- Permita HTML para manter o `<b>...</b>` no front
- Delimitador: `Tab`
- O arquivo e exportado sem linha de cabecalho

## Estrutura do projeto

- `src/index.js`: orquestracao do fluxo CLI
- `src/lib/ui.js`: prompts e output visual no terminal
- `src/lib/word-data.js`: integracao com APIs e montagem de dados da palavra
- `src/lib/card-session.js`: revisao do card e acoes de troca/edicao
- `src/lib/anki-export.js`: formatacao e exportacao para Anki
- `src/lib/text.js`: utilitarios de texto e destaque

## Makefile

- `make install`: instala dependencias
- `make start`: executa a CLI
- `make watch`: executa a CLI em modo clipboard watch
- `make check`: valida sintaxe do arquivo principal
- `make sample-export`: gera `examples/sample-anki-import.tsv` para testar importacao no Anki
- `make dev`: instala e inicia em sequencia

## Scripts npm

- `npm start`: executa a CLI
- `npm run watch`: executa a CLI em modo watch
- `npm run check`: valida sintaxe do arquivo principal
