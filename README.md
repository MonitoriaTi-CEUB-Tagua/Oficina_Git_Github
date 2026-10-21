# Oficina de Git e GitHub da Monitoria

Material de apoio da oficina de Git e GitHub da monitoria de TI do CEUB. É um site estático (HTML, CSS e JavaScript puro, sem build), pronto para o GitHub Pages.

O guia mistura teoria e prática: como o Git funciona, versionamento local, branches, merge e conflitos, trabalho com remotos, colaboração no GitHub, comparação com outras plataformas (GitLab, Bitbucket…), ferramentas do dia a dia e uma página de problemas comuns com solução. Os grafos de branch são interativos e gerados a partir de comandos Git reais.

## Páginas

| Arquivo | Conteúdo |
|---|---|
| `index.html` | Início, roteiro da oficina, checklist e legenda dos grafos |
| `conceitos.html` | Teoria: commits, hash, três áreas, branches, local × remoto, pasta `.git` |
| `primeiros-passos.html` | Instalação, terminal básico, configuração e autenticação |
| `commits.html` | Primeiro repositório, `status`/`add`/`commit`, mensagens, `.gitignore` |
| `branches.html` | Branches, stash, detached HEAD, GitHub Flow e Git Flow |
| `merge.html` | Fast-forward, merge de três vias, rebase, squash, conflitos, cherry-pick |
| `remotos.html` | `push`, `fetch`, `pull`, push rejeitado, upstream, rotina em equipe |
| `github.html` | Fork, pull request, revisão, issues, Markdown, Pages, Actions |
| `plataformas.html` | GitHub × GitLab × Bitbucket × Azure DevOps × Gitea/Forgejo/Codeberg |
| `ferramentas.html` | Terminal, VS Code, GitHub Desktop e equivalência entre eles |
| `problemas.html` | Erros comuns com busca, causa e solução |
| `laboratorio.html` | Terminal simulado com grafo ao vivo, desafios e exercício em dupla |
| `referencia.html` | Folha de consulta de comandos e glossário |

## Como editar

- **Menu lateral, anterior/próximo e rodapé** são gerados por `assets/js/main.js`. Para adicionar, remover ou reordenar capítulos, edite só a lista `CHAPTERS` no topo desse arquivo. Os monitores ficam na lista `MONITORS`.
- **Blocos de código**: use `<pre data-label="terminal">...</pre>`. O botão de copiar é adicionado sozinho. Linhas que começam com `#` viram comentário (use `data-raw` para Markdown/YAML). Saída do terminal vai em `<span class="o">...</span>` e não é copiada.
- **Abas** (por sistema operacional): `<div class="tabs" data-group="os">` com filhos `<div class="tab-panel" data-tab="Windows">`.
- **Avisos**: `<div class="callout tip|warn|danger|analogy"><p class="callout-title">Título</p>...</div>`.

### Grafos de branch

Cada grafo é um `<figure class="gitviz">` com um roteiro de comandos Git. O simulador (`assets/js/git-sim.js`) executa os comandos e desenha o resultado:

```html
<figure class="gitviz">
    <script type="text/plain">
        = git commit -m "início"            (linha "=": preparação, sem virar passo)
        > Texto mostrado antes do primeiro passo.
        $ git switch -c feature              (linha "$": um passo do player)
        + git commit -m "menu"               (linha "+": mais um comando no mesmo passo)
        > Explicação do passo. Aceita `código` e **negrito**.
    </script>
    <figcaption>Legenda opcional.</figcaption>
</figure>
```

Comandos aceitos: `commit` (inclui `--amend`), `branch`, `switch`, `checkout`, `merge` (`--no-ff`, `--squash`), `rebase`, `reset`, `revert`, `cherry-pick`, `tag`, `push`, `pull` (`--rebase`), `fetch`, `log`, `status`. Comandos extras da simulação:

- `colega commit -m "msg"`: alguém enviou um commit ao GitHub (aparece tracejado até o `fetch`/`pull`).
- `github merge feature [main]`: merge de um pull request feito no site.
- `github delete feature`: apagar a branch no GitHub.

Sem linhas `$`, o grafo é estático. `data-autoplay` faz o grafo avançar sozinho.

## Rodando localmente

Abra com a extensão Live Server do VS Code ou rode `python -m http.server` na pasta e acesse `http://localhost:8000`.

## Monitores

- [Gustavo Gomide](https://github.com/Gustavo-Gomide)
- [Victor Ribeiro](https://github.com/VictorRMRibeiro)
