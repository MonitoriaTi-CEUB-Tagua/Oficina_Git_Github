/* Oficina de Git & GitHub — comportamento comum a todas as páginas. */
(function () {
    'use strict';

    // Para adicionar, remover ou reordenar capítulos, edite só esta lista.
    const CHAPTERS = [
        { file: 'index.html', title: 'Início' },
        { group: 'Teoria' },
        { file: 'conceitos.html', title: 'Como o Git funciona' },
        { group: 'Git no seu computador' },
        { file: 'primeiros-passos.html', title: 'Instalação e configuração' },
        { file: 'commits.html', title: 'Commits: salvando versões' },
        { file: 'branches.html', title: 'Branches: linhas paralelas' },
        { file: 'merge.html', title: 'Merge, rebase e conflitos' },
        { group: 'Git online' },
        { file: 'remotos.html', title: 'Remotos: push, pull e fetch' },
        { file: 'github.html', title: 'Colaborando no GitHub' },
        { file: 'plataformas.html', title: 'GitHub, GitLab e outras' },
        { file: 'ferramentas.html', title: 'Ferramentas do dia a dia' },
        { group: 'Prática e ajuda' },
        { file: 'problemas.html', title: 'Problemas e soluções' },
        { file: 'laboratorio.html', title: 'Laboratório interativo' },
        { file: 'referencia.html', title: 'Consulta rápida' },
    ];

    const MONITORS = [
        { name: 'Gustavo Gomide', user: 'Gustavo-Gomide' },
        { name: 'Victor Ribeiro', user: 'VictorRMRibeiro' },
    ];

    const store = {
        get(k) { try { return localStorage.getItem(k); } catch { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
    };

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const slug = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const norm = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    document.documentElement.classList.add('js');

    // ------------------------------------------------ navegação (sidebar)
    const here = (location.pathname.split('/').pop() || 'index.html').replace(/\?.*$/, '') || 'index.html';
    const pages = CHAPTERS.filter(c => c.file);
    const idx = Math.max(0, pages.findIndex(c => c.file === here));

    const sidebar = $('.sidebar');
    if (sidebar) {
        let n = 0;
        const items = CHAPTERS.map(c => {
            if (c.group) return `<li class="metro-group" data-group>${c.group}</li>`;
            const i = n++;
            const state = i < idx ? 'is-past' : i === idx ? 'is-current' : '';
            const num = i === 0 ? '' : String(i).padStart(2, '0');
            return `<li class="${state}"><a href="${c.file}"${i === idx ? ' aria-current="page"' : ''}><span class="num">${num}</span><span>${c.title}</span>${i === idx ? '<span class="head-chip" title="Você está aqui">HEAD</span>' : ''}</a></li>`;
        });
        sidebar.innerHTML = `
            <p class="metro-label">Cada capítulo é um commit da oficina. O <code>HEAD</code> mostra onde você está.</p>
            <nav aria-label="Capítulos"><ol class="metro">${items.join('')}</ol></nav>
            <div class="sidebar-foot"><strong>Dica:</strong> abra o <a href="laboratorio.html">laboratório</a> em outra aba e teste cada comando enquanto lê.</div>`;
        // linha "percorrida" também passa pelos rótulos de grupo
        $$('.metro > li', sidebar).forEach((li, i, all) => {
            if (li.matches('[data-group]')) {
                const next = all.slice(i + 1).find(x => !x.matches('[data-group]'));
                if (next && (next.classList.contains('is-past') || next.classList.contains('is-current'))) li.classList.add('is-past');
            }
        });
    }

    const pageNav = $('.page-nav');
    if (pageNav) {
        const prev = pages[idx - 1], next = pages[idx + 1];
        pageNav.innerHTML =
            (prev ? `<a class="prev" href="${prev.file}"><small>Anterior</small>${prev.title}</a>` : '') +
            (next ? `<a class="next" href="${next.file}"><small>Próximo</small>${next.title}</a>` : '');
    }

    const footer = $('.footer');
    if (footer && !footer.children.length) {
        footer.innerHTML = `<span>Monitoria de TI · CEUB Taguatinga. Material de apoio independente da oficina.</span><a href="#conteudo">Voltar ao topo</a>`;
    }

    // ------------------------------------------------------- menu mobile
    const menu = $('.menu-toggle');
    let scrim;
    function setMenu(open) {
        if (!menu || !sidebar) return;
        menu.setAttribute('aria-expanded', String(open));
        sidebar.classList.toggle('is-open', open);
        if (open) {
            scrim = document.createElement('div');
            scrim.className = 'scrim';
            scrim.addEventListener('click', () => setMenu(false));
            document.body.appendChild(scrim);
        } else scrim?.remove();
    }
    menu?.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') { setMenu(false); menu.focus(); }
    });

    // --------------------------------------------------------------- tema
    const themeBtn = $('.theme-toggle');
    function currentTheme() {
        const t = document.documentElement.dataset.theme;
        if (t) return t;
        return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    function paintThemeBtn() {
        if (!themeBtn) return;
        const dark = currentTheme() === 'dark';
        themeBtn.setAttribute('aria-label', dark ? 'Usar tema claro' : 'Usar tema escuro');
        themeBtn.innerHTML = dark
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>';
    }
    themeBtn?.addEventListener('click', () => {
        const next = currentTheme() === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        store.set('theme', next);
        paintThemeBtn();
    });
    paintThemeBtn();

    // ---------------------------------------------------------- monitores
    const monBtn = $('.monitors-toggle');
    if (monBtn) {
        const dlg = document.createElement('dialog');
        dlg.className = 'monitors-dialog';
        dlg.setAttribute('aria-labelledby', 'monitors-title');
        dlg.innerHTML = `
            <h2 id="monitors-title">Monitores da oficina</h2>
            <p>Dúvidas durante ou depois da oficina? Fale com a gente.</p>
            <ul class="monitors-list">${MONITORS.map(m => `
                <li><a href="https://github.com/${m.user}" target="_blank" rel="noopener noreferrer">
                    <img src="https://github.com/${m.user}.png?size=72" alt="" width="36" height="36" loading="lazy">
                    <span>${m.name}<small>github.com/${m.user}</small></span></a></li>`).join('')}
            </ul>
            <form method="dialog"><button class="btn ghost">Fechar</button></form>`;
        document.body.appendChild(dlg);
        monBtn.addEventListener('click', () => dlg.showModal());
        dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    }

    // ------------------------------------------- âncoras e sumário (TOC)
    const content = $('.content');
    if (content) {
        $$('h2, h3', content).forEach(h => {
            if (h.closest('.problem, .challenge, .panel, figure, .areas')) return;
            if (!h.id) h.id = slug(h.textContent);
            const a = document.createElement('a');
            a.className = 'anchor';
            a.href = '#' + h.id;
            a.setAttribute('aria-label', 'Link para esta seção');
            a.textContent = '#';
            h.appendChild(a);
        });
    }
    const toc = $('.toc');
    if (toc && content) {
        const hs = $$('h2', content).filter(h => !h.closest('.problem, .panel, figure, .challenge, .areas'));
        if (hs.length > 2) {
            toc.innerHTML = `<p>Nesta página</p><ol>${hs.map(h => `<li><a href="#${h.id}">${h.firstChild.textContent.trim()}</a></li>`).join('')}</ol>`;
            const links = new Map(hs.map(h => [h, $(`a[href="#${CSS.escape(h.id)}"]`, toc)]));
            const io = new IntersectionObserver(entries => {
                entries.forEach(en => {
                    if (en.isIntersecting) {
                        links.forEach(a => a.classList.remove('is-active'));
                        links.get(en.target)?.classList.add('is-active');
                    }
                });
            }, { rootMargin: '-15% 0px -75% 0px' });
            hs.forEach(h => io.observe(h));
        } else toc.remove();
    }

    // ------------------------------------------------- blocos de código
    $$('pre[data-label]').forEach(pre => {
        const wrap = document.createElement('div');
        wrap.className = 'code' + (pre.dataset.theme === 'light' ? ' light' : '');
        const head = document.createElement('div');
        head.className = 'code-head';
        head.innerHTML = `<span></span><button type="button" class="copy">Copiar</button>`;
        head.firstChild.textContent = pre.dataset.label;
        pre.parentNode.insertBefore(wrap, pre);
        wrap.append(head, pre);
        // linhas que começam com # viram comentário (exceto em Markdown e YAML com data-raw)
        if (!pre.hasAttribute('data-raw')) {
            pre.innerHTML = pre.innerHTML.split('\n').map(l => /^\s*#/.test(l) ? `<span class="c">${l}</span>` : l).join('\n');
        }
        if (pre.hasAttribute('data-nocopy')) head.lastChild.remove();
    });
    document.addEventListener('click', async e => {
        const btn = e.target.closest('.copy');
        if (!btn) return;
        const pre = btn.closest('.code').querySelector('pre');
        const clone = pre.cloneNode(true);
        clone.querySelectorAll('.o, .p, .e').forEach(x => x.remove());
        const text = clone.textContent.replace(/\n{3,}/g, '\n\n').trim();
        try {
            await navigator.clipboard.writeText(text);
            btn.textContent = 'Copiado';
        } catch {
            const r = document.createRange();
            r.selectNodeContents(pre);
            const s = getSelection(); s.removeAllRanges(); s.addRange(r);
            btn.textContent = 'Use Ctrl+C';
        }
        setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
    });

    // --------------------------------------------------------------- abas
    $$('.tabs').forEach((tabs, t) => {
        const panels = $$(':scope > .tab-panel', tabs);
        const group = tabs.dataset.group;
        const list = document.createElement('div');
        list.className = 'tab-list';
        list.setAttribute('role', 'tablist');
        tabs.prepend(list);
        const btns = panels.map((p, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.setAttribute('role', 'tab');
            b.id = `tab-${t}-${i}`;
            b.textContent = p.dataset.tab;
            p.setAttribute('role', 'tabpanel');
            p.setAttribute('aria-labelledby', b.id);
            b.addEventListener('click', () => { select(i); if (group) { store.set('tab:' + group, p.dataset.tab); syncGroup(group, p.dataset.tab, tabs); } });
            b.addEventListener('keydown', e => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    const j = (i + (e.key === 'ArrowRight' ? 1 : panels.length - 1)) % panels.length;
                    btns[j].focus(); btns[j].click();
                }
            });
            list.appendChild(b);
            return b;
        });
        function select(i) {
            btns.forEach((b, j) => { b.setAttribute('aria-selected', String(i === j)); b.tabIndex = i === j ? 0 : -1; });
            panels.forEach((p, j) => { p.hidden = i !== j; });
        }
        tabs._select = name => { const i = panels.findIndex(p => p.dataset.tab === name); if (i >= 0) select(i); };
        let start = 0;
        const saved = group && store.get('tab:' + group);
        if (saved) start = Math.max(0, panels.findIndex(p => p.dataset.tab === saved));
        else if (group === 'os') {
            const ua = navigator.userAgent;
            const guess = /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) && !/Android/.test(ua) ? 'Linux' : 'Windows';
            start = Math.max(0, panels.findIndex(p => p.dataset.tab === guess));
        }
        select(start);
    });
    function syncGroup(group, name, except) {
        $$(`.tabs[data-group="${group}"]`).forEach(t => { if (t !== except) t._select?.(name); });
    }

    // -------------------------------------------------- checklist salva
    $$('.checklist[data-save] input').forEach((inp, i) => {
        const key = `check:${here}:${i}`;
        inp.checked = store.get(key) === '1';
        inp.addEventListener('change', () => store.set(key, inp.checked ? '1' : '0'));
    });

    // ----------------------------------------------------- busca/filtros
    $$('[data-search]').forEach(box => {
        const input = $('input', box);
        const target = $(box.dataset.search);
        const items = $$('[data-item]', target);
        const count = $('.search-count', box);
        const filterBtns = $$('[data-filter]', box);
        let filter = 'todos';
        function apply() {
            const terms = norm(input.value).trim().split(/\s+/).filter(Boolean);
            let n = 0;
            items.forEach(it => {
                const okText = terms.every(t => norm(it.textContent).includes(t));
                const okCat = filter === 'todos' || (it.dataset.cat || '').split(' ').includes(filter);
                it.hidden = !(okText && okCat);
                if (!it.hidden) n++;
            });
            $$('[data-section]', target).forEach(sec => { sec.hidden = !$$('[data-item]', sec).some(i => !i.hidden); });
            if (count) count.textContent = terms.length || filter !== 'todos' ? `${n} resultado${n === 1 ? '' : 's'}` : `${items.length} itens. Digite parte de uma mensagem de erro ou um comando.`;
        }
        input.addEventListener('input', apply);
        filterBtns.forEach(b => b.addEventListener('click', () => {
            filter = b.dataset.filter;
            filterBtns.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
            apply();
        }));
        apply();
        // abre o problema citado no endereço (#id)
        const openFromHash = () => {
            const d = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
            if (d && d.tagName === 'DETAILS') { d.open = true; requestAnimationFrame(() => d.scrollIntoView({ block: 'start' })); }
        };
        openFromHash();
        window.addEventListener('hashchange', openFromHash);
    });

    // ===================================================== três áreas
    const areas = $('.areas');
    if (areas) {
        // tracked: o Git conhece o arquivo (está num commit ou no stage)
        const files0 = () => [
            { name: 'index.html', wd: 'clean', staged: false, tracked: true },
            { name: 'style.css', wd: 'clean', staged: false, tracked: true },
        ];
        let files = files0(), commits = [{ id: 'a1f3c09', msg: 'primeira versão do site', files: ['index.html', 'style.css'] }];
        const colW = $('[data-area="wd"] .area-files', areas);
        const colS = $('[data-area="stage"] .area-files', areas);
        const colR = $('[data-area="repo"] .area-files', areas);
        const msg = $('.areas-msg', areas);
        const hex = () => Math.random().toString(16).slice(2, 9).padEnd(7, '0');
        const say = (cmd, text) => { msg.innerHTML = ''; const c = document.createElement('div'); c.textContent = cmd; c.style.color = 'var(--term-ok)'; const t = document.createElement('div'); t.textContent = text; t.style.color = 'var(--term-dim)'; msg.append(c, t); };

        function draw() {
            colW.innerHTML = ''; colS.innerHTML = ''; colR.innerHTML = '';
            files.filter(f => f.wd !== 'clean').forEach(f => {
                const li = document.createElement('li');
                li.innerHTML = `<button type="button" class="file" title="Clique para rodar git add ${f.name}">${f.name}<span class="st ${f.wd === 'untracked' ? 'U' : 'M'}">${f.wd === 'untracked' ? 'novo' : 'modificado'}</span></button>`;
                li.firstChild.addEventListener('click', () => add([f]));
                colW.appendChild(li);
            });
            files.filter(f => f.staged).forEach(f => {
                const li = document.createElement('li');
                li.innerHTML = `<button type="button" class="file" title="Clique para tirar do stage (git restore --staged ${f.name})">${f.name}<span class="st S">pronto</span></button>`;
                li.firstChild.addEventListener('click', () => {
                    f.staged = false;
                    if (f.isNew) { f.tracked = false; f.wd = 'untracked'; }
                    else if (f.wd === 'clean') f.wd = 'modified';
                    say(`$ git restore --staged ${f.name}`, 'O arquivo saiu do stage. A alteração continua na pasta.');
                    draw();
                });
                colS.appendChild(li);
            });
            if (!colW.children.length) colW.innerHTML = '<li><small style="color:var(--ink-2)">Nada alterado desde o último commit.</small></li>';
            if (!colS.children.length) colS.innerHTML = '<li><small style="color:var(--ink-2)">Vazio. Use git add para escolher o que vai no commit.</small></li>';
            commits.slice(-4).reverse().forEach(c => {
                const li = document.createElement('li');
                li.innerHTML = `<div class="commit-card"><b></b> <span></span></div>`;
                li.querySelector('b').textContent = c.id;
                li.querySelector('span').textContent = c.msg;
                colR.appendChild(li);
            });
            $('[data-act="commit"]', areas).disabled = !files.some(f => f.staged);
            $('[data-act="addall"]', areas).disabled = !files.some(f => f.wd !== 'clean');
        }
        function add(list) {
            list = list.filter(f => f.wd !== 'clean');
            if (!list.length) return;
            list.forEach(f => { f.isNew = f.isNew || !f.tracked; f.tracked = true; f.wd = 'clean'; f.staged = true; });
            say(`$ git add ${list.length > 1 ? '.' : list[0].name}`, 'Copiado para o stage: é isso que vai entrar no próximo commit.');
            draw();
        }
        areas.addEventListener('click', e => {
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (!act) return;
            if (act.startsWith('edit:')) {
                const name = act.slice(5);
                let f = files.find(x => x.name === name);
                if (!f) { f = { name, wd: 'untracked', staged: false, tracked: false }; files.push(f); say(`(você criou ${name} no editor)`, 'Arquivo novo: o Git ainda não acompanha ele (untracked).'); }
                else { f.wd = f.tracked ? 'modified' : 'untracked'; say(`(você editou e salvou ${name})`, 'Salvar no editor muda só a pasta de trabalho. O Git percebe, mas ainda não registrou nada.'); }
                draw();
            }
            if (act === 'addall') add(files);
            if (act === 'commit') {
                const staged = files.filter(f => f.staged);
                const id = hex();
                const text = staged.length === 1 ? `altera ${staged[0].name}` : `altera ${staged.length} arquivos`;
                commits.push({ id, msg: text, files: staged.map(f => f.name) });
                staged.forEach(f => { f.staged = false; f.isNew = false; });
                say(`$ git commit -m "${text}"`, `[main ${id}] Foto tirada! Só o que estava no stage entrou no commit.`);
                draw();
            }
            if (act === 'reset') {
                files = files0();
                commits = [commits[0]];
                say('(recomeçou)', 'Tudo limpo: a pasta é igual ao último commit.');
                draw();
            }
        });
        say('$ git status', 'nothing to commit, working tree clean. Comece editando um arquivo.');
        draw();
    }

    // ====================================================== laboratório
    const labRoot = $('.lab');
    if (labRoot && window.GitSim) {
        const term = new GitSim.Terminal(labRoot);
        const anc = (r, a, b) => a && b && r.isAncestor(a, b);
        const CHALLENGES = [
            {
                title: 'Sua primeira branch',
                text: 'Crie uma branch chamada <code>feature</code>, entre nela e faça dois commits. A <code>main</code> não pode mudar.',
                setup: 'git commit -m "início"; git commit -m "estrutura"',
                hint: 'git switch -c feature → git commit -m "menu" → git commit -m "rodapé"',
                check: r => { const f = r.branches.get('feature'), m = r.branches.get('main'); return f && m === 'B' && r.range(m, f).length >= 2; },
            },
            {
                title: 'Fast-forward',
                text: 'A branch <code>feature</code> já tem commits novos. Leve esses commits para a <code>main</code> <strong>sem</strong> criar commit de merge.',
                setup: 'git commit -m "início"; git switch -c feature; git commit -m "menu"; git commit -m "rodapé"; git switch main',
                hint: 'Você precisa estar na main: git switch main → git merge feature',
                check: r => r.branches.get('main') === r.branches.get('feature') && r.branches.get('main') === 'C',
            },
            {
                title: 'Merge de três vias',
                text: 'As duas branches andaram. Junte a <code>feature</code> na <code>main</code> e observe o commit de merge, que tem dois pais.',
                setup: 'git commit -m "início"; git switch -c feature; git commit -m "menu"; git switch main; git commit -m "corrige título"',
                hint: 'Da main: git merge feature',
                check: r => { const m = r.commits.get(r.branches.get('main')); return m && m.parents.length === 2 && anc(r, r.branches.get('feature'), m.id); },
            },
            {
                title: 'Rebase: histórico em linha reta',
                text: 'Em vez de merge, mova os commits da <code>feature</code> para depois do último commit da <code>main</code>.',
                setup: 'git commit -m "início"; git switch -c feature; git commit -m "menu"; git commit -m "estilo do menu"; git switch main; git commit -m "corrige título"; git switch feature',
                hint: 'Na feature: git rebase main. Repare que C e D viram cópias novas (C\' e D\').',
                check: r => { const f = r.branches.get('feature'); return f && anc(r, r.branches.get('main'), f) && f !== r.branches.get('main') && ![...r.ancestors(f)].some(x => r.commits.get(x).parents.length > 1); },
            },
            {
                title: 'Push rejeitado',
                text: 'Um colega enviou um commit para o GitHub antes de você. Seu <code>git push</code> vai falhar. Resolva e envie seu commit.',
                setup: 'git commit -m "início"; git push -u origin main; colega commit -m "colega: rodapé"; git commit -m "meu: menu"',
                hint: 'Tente git push e leia o erro. Depois: git pull (ou git pull --rebase) e git push.',
                check: r => { const m = r.branches.get('main'); return m && r.remote.get('main') === m && anc(r, 'B', m) && [...r.ancestors(m)].some(x => r.commits.get(x).msg === 'meu: menu'); },
            },
            {
                title: 'Desfazer sem apagar a história',
                text: 'O commit <code>C</code> colocou um bug e já foi enviado ao GitHub. Desfaça o efeito dele de forma segura e envie.',
                setup: 'git commit -m "início"; git commit -m "login"; git commit -m "bug no login"; git push -u origin main',
                hint: 'Para commits já enviados, use git revert C e depois git push.',
                check: r => { const m = r.branches.get('main'); return m && r.remote.get('main') === m && anc(r, 'C', m) && [...r.ancestors(m)].some(x => r.commits.get(x).msg.startsWith('Revert')); },
            },
            {
                title: 'Commit na branch errada',
                text: 'Você fez o commit <code>C</code> direto na <code>main</code>, mas ele deveria estar numa branch <code>feature</code>. Mova-o: a <code>main</code> deve voltar para <code>B</code>.',
                setup: 'git commit -m "início"; git commit -m "estrutura"; git commit -m "nova tela (era pra ser feature)"',
                hint: 'git branch feature (guarda o commit) → git reset --hard HEAD~1 (volta a main) → git switch feature',
                check: r => r.branches.get('main') === 'B' && r.branches.get('feature') === 'C',
            },
        ];
        const list = $('.challenges');
        let active = -1;
        const doneKey = i => `lab:done:${i}`;
        CHALLENGES.forEach((c, i) => {
            const li = document.createElement('li');
            li.className = 'challenge' + (store.get(doneKey(i)) === '1' ? ' is-done' : '');
            li.innerHTML = `<span class="mark" aria-hidden="true">${i + 1}</span>
                <div><h3>${c.title}</h3><p>${c.text}</p><details><summary>Ver dica</summary><p><code></code></p></details><p class="status" role="status"></p></div>
                <button type="button" class="btn ghost">Carregar</button>`;
            li.querySelector('details code').textContent = c.hint;
            li.querySelector('button').addEventListener('click', () => {
                active = i;
                $$('.challenge', list).forEach((x, j) => x.classList.toggle('is-active', j === i));
                term.root.dataset.setup = c.setup;
                term.load(c.setup, `Desafio ${i + 1}: ${c.title}. O repositório foi preparado; o objetivo está na lista abaixo.`);
                term.input.focus({ preventScroll: true });
                labRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            list.appendChild(li);
        });
        term.onChange(repo => {
            if (active < 0) return;
            const li = $$('.challenge', list)[active];
            let ok = false;
            try { ok = CHALLENGES[active].check(repo); } catch { ok = false; }
            if (ok) {
                li.classList.add('is-done');
                li.querySelector('.status').textContent = 'Desafio concluído!';
                store.set(doneKey(active), '1');
                term.print([`✔ Desafio ${active + 1} concluído. Carregue o próximo quando quiser.`], 'gv-out is-note');
                active = -1;
            }
        });
    }
})();
