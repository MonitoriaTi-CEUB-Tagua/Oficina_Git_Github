/*
 * git-sim.js — simulador didático de Git + desenho de grafos em SVG.
 *
 * O grafo é descrito com comandos git de verdade:
 *
 *   <figure class="gitviz">
 *     <script type="text/plain">
 *       = git commit -m "início"        (linha "=": preparação, roda sem virar passo)
 *       $ git switch -c feature          (linha "$": vira um passo do player)
 *       > Explicação do passo, com `código`.
 *     </script>
 *   </figure>
 *
 * Comandos extras só da simulação:
 *   colega commit -m "msg" [branch]   → alguém envia um commit para o GitHub
 */
(function () {
    'use strict';

    // ------------------------------------------------------------------ Repo

    class GitError extends Error { }

    function tokenize(line) {
        const out = [];
        const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
        let m;
        while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
        return out;
    }

    function letterId(n) {
        let s = '';
        n += 1;
        while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
        return s;
    }

    class Repo {
        constructor() {
            this.commits = new Map();
            this.branches = new Map([['main', null]]);
            this.remote = new Map();
            this.upstream = new Set();
            this.tags = new Map();
            this.head = { branch: 'main' };
            this.lanes = new Map([['main', 0]]);
            this.order = 0;
            this.count = 0;
            this.hasRemote = false;
            this.last = null;
        }

        // --- helpers
        headCommit() { return this.head.branch ? this.branches.get(this.head.branch) : this.head.detached; }

        // Cada branch ganha sua própria linha (e cor) e nunca a divide com outra:
        // reaproveitar a linha de uma branch apagada fazia caminhos diferentes parecerem um só.
        laneFor(name) {
            if (!this.lanes.has(name)) this.lanes.set(name, Math.max(-1, ...this.lanes.values()) + 1);
            return this.lanes.get(name);
        }

        addCommit(msg, parents, lane, extra = {}) {
            const id = extra.id || letterId(this.count++);
            const c = { id, msg: msg || 'commit', parents: parents.filter(Boolean), lane, order: this.order++, remoteOnly: false, ...extra, id };
            this.commits.set(id, c);
            this.last = id;
            return c;
        }

        copyId(base) {
            let id = base + "'";
            while (this.commits.has(id)) id += "'";
            return id;
        }

        resolve(ref) {
            if (!ref) throw new GitError('fatal: informe uma referência');
            let base = ref, ups = 0;
            const m = ref.match(/^(.*?)((?:[~^]\d*)+)$/);
            if (m && m[1]) {
                base = m[1];
                for (const part of m[2].match(/[~^]\d*/g)) {
                    const n = part.length > 1 ? parseInt(part.slice(1), 10) : 1;
                    ups += part[0] === '~' ? n : (n === 1 ? 1 : 0);
                }
            }
            let id;
            if (base === 'HEAD' || base === '@') id = this.headCommit();
            else if (this.branches.has(base)) id = this.branches.get(base);
            else if (base.startsWith('origin/') && this.remote.has(base.slice(7))) id = this.remote.get(base.slice(7));
            else if (this.tags.has(base)) id = this.tags.get(base);
            else if (this.commits.has(base)) id = base;
            else if (this.commits.has(base.toUpperCase())) id = base.toUpperCase();
            else throw new GitError(`fatal: '${ref}' não é uma branch, tag ou commit conhecido`);
            for (let i = 0; i < ups; i++) {
                const c = this.commits.get(id);
                if (!c || !c.parents.length) throw new GitError(`fatal: '${ref}' vai além do primeiro commit`);
                id = c.parents[0];
            }
            if (!id) throw new GitError(`fatal: '${ref}' ainda não tem commits`);
            return id;
        }

        ancestors(id) {
            const seen = new Set();
            const stack = id ? [id] : [];
            while (stack.length) {
                const x = stack.pop();
                if (seen.has(x)) continue;
                seen.add(x);
                stack.push(...this.commits.get(x).parents);
            }
            return seen;
        }

        isAncestor(a, b) { return !a || this.ancestors(b).has(a); }

        mergeBase(a, b) {
            const A = this.ancestors(a);
            let best = null;
            for (const x of this.ancestors(b)) if (A.has(x) && (!best || this.commits.get(x).order > this.commits.get(best).order)) best = x;
            return best;
        }

        reachable() {
            const roots = [...this.branches.values(), ...this.remote.values(), ...this.tags.values()];
            if (this.head.detached) roots.push(this.head.detached);
            const seen = new Set();
            for (const r of roots) if (r) for (const x of this.ancestors(r)) seen.add(x);
            return seen;
        }

        setHeadTarget(id) {
            if (this.head.branch) this.branches.set(this.head.branch, id);
            else this.head.detached = id;
        }

        currentLane() { return this.head.branch ? this.laneFor(this.head.branch) : this.laneFor('(HEAD)'); }

        // commits em `from` que não estão em `upto`, do mais antigo para o mais novo
        range(upto, from) {
            const exclude = this.ancestors(upto);
            return [...this.ancestors(from)].filter(x => !exclude.has(x))
                .map(x => this.commits.get(x)).sort((a, b) => a.order - b.order);
        }

        // --- comandos
        run(line) {
            const t = tokenize(line.trim());
            if (!t.length) return [];
            if (t[0] === 'colega') return this.colega(t.slice(1));
            if (t[0] === 'github') return this.github(t.slice(1));
            if (t[0] !== 'git') throw new GitError(`comando não reconhecido: ${t[0]}. Os comandos começam com "git".`);
            const cmd = t[1];
            const args = t.slice(2);
            const fn = {
                commit: this.commit, branch: this.branch, switch: this.switch, checkout: this.checkout,
                merge: this.merge, rebase: this.rebase, reset: this.reset, revert: this.revert,
                'cherry-pick': this.cherryPick, tag: this.tag, push: this.push, pull: this.pull,
                fetch: this.fetch, remote: this.remoteCmd, log: this.log, status: this.status,
                add: () => ['(simulação) alterações preparadas para o próximo commit.'],
                init: () => ['Initialized empty Git repository'],
                stash: () => ['(simulação) alterações guardadas na stash.'],
                restore: () => ['(simulação) arquivo restaurado para a versão do último commit.'],
                diff: () => ['(simulação) o diff mostraria as linhas alteradas.'],
            }[cmd];
            if (!fn) throw new GitError(`git: '${cmd || ''}' não está disponível no simulador. Digite "help" para ver a lista.`);
            return fn.call(this, args) || [];
        }

        flags(args) {
            const f = new Set(), pos = [];
            let msg = null;
            for (let i = 0; i < args.length; i++) {
                const a = args[i];
                if (a === '-m' || a === '--message') msg = args[++i];
                else if (/^-[a-zA-Z]{2,}$/.test(a) && a.includes('m')) { [...a.slice(1)].forEach(ch => f.add('-' + ch)); msg = args[++i]; }
                else if (a.startsWith('-')) f.add(a);
                else pos.push(a);
            }
            return { f, pos, msg };
        }

        commit(args) {
            const { f, msg } = this.flags(args);
            const head = this.headCommit();
            if (f.has('--amend')) {
                if (!head) throw new GitError('fatal: não há commit para corrigir');
                const old = this.commits.get(head);
                const c = this.addCommit(msg || old.msg, old.parents, old.lane, { id: this.copyId(old.id) });
                this.setHeadTarget(c.id);
                return [`[${this.head.branch || 'HEAD'} ${c.id}] ${c.msg}`, `O commit ${old.id} foi substituído por ${c.id}.`];
            }
            const c = this.addCommit(msg, [head], this.currentLane());
            this.setHeadTarget(c.id);
            return [`[${this.head.branch || 'detached HEAD'} ${c.id}] ${c.msg}`];
        }

        branch(args) {
            const { f, pos } = this.flags(args);
            if (f.has('-d') || f.has('-D') || f.has('--delete')) {
                const name = pos[0];
                if (!this.branches.has(name)) throw new GitError(`error: branch '${name}' não encontrada`);
                if (this.head.branch === name) throw new GitError(`error: não dá para apagar a branch '${name}' porque você está nela`);
                const tip = this.branches.get(name);
                const cur = this.headCommit();
                if (f.has('-d') && tip && !this.isAncestor(tip, cur) && !(this.remote.has(name) && this.remote.get(name) === tip))
                    throw new GitError(`error: a branch '${name}' não foi totalmente integrada.\nSe tiver certeza, use 'git branch -D ${name}'.`);
                this.branches.delete(name);
                return [`Deleted branch ${name} (era ${tip}).`];
            }
            if (f.has('-m')) {
                const [a, b] = pos.length === 2 ? pos : [this.head.branch, pos[0]];
                if (!this.branches.has(a)) throw new GitError(`error: branch '${a}' não encontrada`);
                this.branches.set(b, this.branches.get(a));
                this.branches.delete(a);
                this.lanes.set(b, this.laneFor(a));
                if (this.head.branch === a) this.head.branch = b;
                return [];
            }
            if (!pos.length) {
                return [...this.branches.keys()].map(b => (b === this.head.branch ? '* ' : '  ') + b)
                    .concat(f.has('-a') ? [...this.remote.keys()].map(b => '  remotes/origin/' + b) : []);
            }
            const name = pos[0];
            this.checkName(name);
            const target = pos[1] ? this.resolve(pos[1]) : this.headCommit();
            if (!target) throw new GitError(`fatal: não é possível criar uma branch antes do primeiro commit`);
            this.branches.set(name, target);
            return [];
        }

        checkName(name) {
            if (!name || /\s|\.\.|[~^:?*\[\\]/.test(name) || name.startsWith('-')) throw new GitError(`fatal: '${name}' não é um nome de branch válido`);
            if (this.branches.has(name)) throw new GitError(`fatal: a branch '${name}' já existe`);
        }

        switch(args) {
            const { f, pos } = this.flags(args);
            if (f.has('-c') || f.has('-b') || f.has('--create')) {
                const name = pos[0];
                this.checkName(name);
                const target = pos[1] ? this.resolve(pos[1]) : this.headCommit();
                this.branches.set(name, target);
                this.head = { branch: name };
                return [`Switched to a new branch '${name}'`];
            }
            const name = pos[0];
            if (f.has('--detach') || f.has('-d')) { this.head = { detached: this.resolve(name) }; return [`HEAD is now at ${this.head.detached}`]; }
            if (!this.branches.has(name)) {
                if (this.remote.has(name)) {
                    this.branches.set(name, this.remote.get(name));
                    this.upstream.add(name);
                    this.head = { branch: name };
                    return [`branch '${name}' set up to track 'origin/${name}'.`, `Switched to a new branch '${name}'`];
                }
                throw new GitError(`fatal: branch '${name}' não existe. Para criar, use: git switch -c ${name}`);
            }
            if (this.head.branch === name) return [`Already on '${name}'`];
            this.head = { branch: name };
            return [`Switched to branch '${name}'`];
        }

        checkout(args) {
            const { f, pos } = this.flags(args);
            if (f.has('-b')) return this.switch(['-c', ...pos]);
            const name = pos[0];
            if (this.branches.has(name) || (this.remote.has(name) && !name.includes('/'))) return this.switch([name]);
            const id = this.resolve(name);
            this.head = { detached: id };
            return [`Note: switching to '${name}'.`, `You are in 'detached HEAD' state.`, `HEAD is now at ${id}`];
        }

        merge(args) {
            const { f, pos, msg } = this.flags(args);
            if (f.has('--abort')) return ['(simulação) merge cancelado; tudo voltou ao estado anterior.'];
            const name = pos[0];
            const theirs = this.resolve(name);
            const ours = this.headCommit();
            if (this.isAncestor(theirs, ours)) return ['Already up to date.'];
            if (f.has('--squash')) {
                const c = this.addCommit(msg || `squash: ${name}`, [ours], this.currentLane());
                this.setHeadTarget(c.id);
                return ['Squash commit -- not updating HEAD', `[${this.head.branch} ${c.id}] ${c.msg}`, `As mudanças de ${name} viraram um único commit. O histórico da branch não foi ligado.`];
            }
            if (this.isAncestor(ours, theirs) && !f.has('--no-ff')) {
                this.setHeadTarget(theirs);
                return [`Updating ${ours}..${theirs}`, 'Fast-forward'];
            }
            if (f.has('--ff-only')) throw new GitError('fatal: Not possible to fast-forward, aborting.');
            const c = this.addCommit(msg || `Merge ${name}`, [ours, theirs], this.currentLane());
            this.setHeadTarget(c.id);
            return [`Merge made by the 'ort' strategy.`, `[${this.head.branch || 'HEAD'} ${c.id}] ${c.msg}`];
        }

        rebase(args) {
            const { pos } = this.flags(args);
            const onto = this.resolve(pos[0]);
            const cur = this.headCommit();
            if (this.isAncestor(cur, onto)) {
                this.setHeadTarget(onto);
                return [`Successfully rebased and updated ${this.head.branch}.`, '(foi só um avanço: não havia commits seus para reaplicar)'];
            }
            const todo = this.range(onto, cur).filter(c => c.parents.length < 2);
            if (!todo.length) return ['Current branch is up to date.'];
            let base = onto;
            const lane = this.currentLane();
            const copies = [];
            for (const old of todo) {
                base = this.addCommit(old.msg, [base], lane, { id: this.copyId(old.id) }).id;
                copies.push(base);
            }
            this.setHeadTarget(base);
            return [`Successfully rebased and updated ${this.head.branch || 'HEAD'}.`,
            `Commits reaplicados como cópias: ${todo.map(c => c.id).join(', ')} → ${copies.join(', ')}`];
        }

        reset(args) {
            const { f, pos } = this.flags(args);
            const target = this.resolve(pos[0] || 'HEAD');
            const before = this.headCommit();
            this.setHeadTarget(target);
            const mode = f.has('--hard') ? 'hard' : f.has('--soft') ? 'soft' : 'mixed';
            const note = {
                hard: 'As alterações dos commits removidos foram descartadas da pasta.',
                soft: 'As alterações dos commits removidos continuam preparadas (staged).',
                mixed: 'As alterações dos commits removidos continuam na pasta, fora do stage.',
            }[mode];
            return [`HEAD is now at ${target}`, before !== target ? note : ''].filter(Boolean);
        }

        revert(args) {
            const { pos } = this.flags(args);
            const id = this.resolve(pos[0]);
            const c = this.addCommit(`Revert "${this.commits.get(id).msg}"`, [this.headCommit()], this.currentLane());
            this.setHeadTarget(c.id);
            return [`[${this.head.branch || 'HEAD'} ${c.id}] ${c.msg}`, `Um novo commit desfaz o que ${id} tinha feito. Nada foi apagado.`];
        }

        cherryPick(args) {
            const { pos } = this.flags(args);
            const id = this.resolve(pos[0]);
            const old = this.commits.get(id);
            const c = this.addCommit(old.msg, [this.headCommit()], this.currentLane(), { id: this.copyId(old.id) });
            this.setHeadTarget(c.id);
            return [`[${this.head.branch || 'HEAD'} ${c.id}] ${c.msg}`, `Cópia de ${id} aplicada aqui.`];
        }

        tag(args) {
            const { pos } = this.flags(args);
            if (!pos.length) return [...this.tags.keys()];
            if (this.tags.has(pos[0])) throw new GitError(`fatal: tag '${pos[0]}' already exists`);
            this.tags.set(pos[0], this.resolve(pos[1] || 'HEAD'));
            return [];
        }

        remoteCmd(args) {
            if (args[0] === 'add') { this.hasRemote = true; return []; }
            if (args[0] === '-v' || !args.length) return this.hasRemote ? ['origin  https://github.com/voce/projeto.git (fetch)', 'origin  https://github.com/voce/projeto.git (push)'] : [];
            return [];
        }

        push(args) {
            const { f, pos } = this.flags(args);
            this.hasRemote = true;
            const name = pos.length >= 2 ? pos[1] : (pos[0] && pos[0] !== 'origin' ? pos[0] : this.head.branch);
            if (!name) throw new GitError('fatal: você não está em uma branch (detached HEAD).');
            if (!this.branches.has(name)) throw new GitError(`error: src refspec ${name} does not match any`);
            const local = this.branches.get(name);
            if (!local) throw new GitError(`error: src refspec ${name} does not match any\n(a branch ainda não tem commits)`);
            const theirs = this.remote.get(name);
            if (!this.upstream.has(name) && !(f.has('-u') || f.has('--set-upstream')) && !pos.length && !this.remote.has(name))
                throw new GitError(`fatal: The current branch ${name} has no upstream branch.\nTo push the current branch and set the remote as upstream, use\n\n    git push -u origin ${name}`);
            if (theirs === local) return ['Everything up-to-date'];
            const out = [];
            if (theirs && !this.isAncestor(theirs, local)) {
                if (!(f.has('--force') || f.has('-f') || f.has('--force-with-lease'))) {
                    throw new GitError(` ! [rejected]        ${name} -> ${name} (fetch first)\nerror: failed to push some refs to 'github.com/voce/projeto.git'\nhint: O GitHub tem commits que você não tem. Rode git pull antes de enviar.`);
                }
                out.push(` + ${theirs}...${local} ${name} -> ${name} (forced update)`);
            } else out.push(`   ${theirs || '(nova)'}..${local}  ${name} -> ${name}`);
            for (const id of this.ancestors(local)) this.commits.get(id).remoteOnly = false;
            this.remote.set(name, local);
            if (f.has('-u') || f.has('--set-upstream')) { this.upstream.add(name); out.push(`branch '${name}' set up to track 'origin/${name}'.`); }
            return out;
        }

        fetch() {
            let n = 0;
            for (const c of this.commits.values()) if (c.remoteOnly) { c.remoteOnly = false; n++; }
            return n ? [`From github.com:voce/projeto`, `${n} commit(s) novo(s) baixado(s). Sua branch local ainda não mudou.`] : ['(nada novo no GitHub)'];
        }

        pull(args) {
            const { f } = this.flags(args);
            const name = this.head.branch;
            if (!name) throw new GitError('fatal: você não está em uma branch.');
            if (!this.remote.has(name)) throw new GitError(`There is no tracking information for the current branch.\nUse: git push -u origin ${name}`);
            const out = this.fetch().slice(0, 1).filter(l => !l.startsWith('('));
            const rebase = f.has('--rebase') || f.has('-r');
            const local = this.branches.get(name), theirs = this.remote.get(name);
            if (this.isAncestor(theirs, local)) return out.concat(['Already up to date.']);
            if (f.has('--ff-only') && !this.isAncestor(local, theirs)) throw new GitError('fatal: Not possible to fast-forward, aborting.\n(as duas versões divergiram: use git pull --rebase ou git pull --no-rebase)');
            return out.concat(rebase ? this.rebase(['origin/' + name]) : this.merge(['origin/' + name, '-m', `Merge origin/${name}`]));
        }

        colega(args) {
            const t = args[0] === 'commit' ? args.slice(1) : args;
            const { pos, msg } = this.flags(t);
            const name = pos[0] || this.head.branch || 'main';
            const base = this.remote.get(name) ?? this.branches.get(name);
            this.hasRemote = true;
            // linha própria: o commit do colega é um caminho paralelo ao seu até alguém juntar
            const c = this.addCommit(msg || 'commit do colega', [base], this.laneFor('origin/' + name), { remoteOnly: true, author: 'colega' });
            this.remote.set(name, c.id);
            return [`(um colega enviou o commit ${c.id} para origin/${name})`];
        }

        // Ações feitas no site (botão "Merge pull request", apagar branch no GitHub).
        github(args) {
            const { f, pos, msg } = this.flags(args);
            if (args[0] === 'merge') {
                const name = pos[1], into = pos[2] || 'main';
                const src = this.remote.get(name), dst = this.remote.get(into);
                if (!src) throw new GitError(`a branch '${name}' não existe no GitHub. Rode git push -u origin ${name} antes.`);
                const parents = f.has('--squash') ? [dst] : [dst, src];
                const c = this.addCommit(msg || (f.has('--squash') ? `${name} (squash)` : `Merge PR #1`), parents, this.laneFor(into), { remoteOnly: true });
                this.remote.set(into, c.id);
                return [`(no GitHub) Pull request de ${name} para ${into} integrado: commit ${c.id}.`, 'Seu computador ainda não tem esse commit.'];
            }
            if (args[0] === 'delete') {
                this.remote.delete(pos[1]);
                return [`(no GitHub) branch ${pos[1]} apagada no site.`];
            }
            throw new GitError('ação do GitHub desconhecida');
        }

        log(args) {
            const start = this.headCommit();
            if (!start) return ['fatal: sua branch ainda não tem commits'];
            const out = [];
            let id = start;
            const refsAt = x => {
                const r = [];
                if (this.head.detached === x) r.push('HEAD');
                for (const [b, v] of this.branches) if (v === x) r.push(b === this.head.branch ? `HEAD -> ${b}` : b);
                for (const [b, v] of this.remote) if (v === x) r.push('origin/' + b);
                for (const [b, v] of this.tags) if (v === x) r.push('tag: ' + b);
                return r.length ? ` (${r.join(', ')})` : '';
            };
            for (const x of [...this.ancestors(start)].map(i => this.commits.get(i)).sort((a, b) => b.order - a.order)) {
                out.push(`${x.id}${refsAt(x.id)} ${x.msg}`);
            }
            return out;
        }

        status() {
            const out = [this.head.branch ? `On branch ${this.head.branch}` : `HEAD detached at ${this.head.detached}`];
            const b = this.head.branch;
            if (b && this.remote.has(b)) {
                const l = this.branches.get(b), r = this.remote.get(b);
                const ahead = this.range(r, l).length, behind = this.range(l, r).filter(c => !c.remoteOnly).length;
                if (!ahead && !behind) out.push(`Your branch is up to date with 'origin/${b}'.`);
                else if (ahead && !behind) out.push(`Your branch is ahead of 'origin/${b}' by ${ahead} commit(s).`, '  (use "git push" to publish your local commits)');
                else if (!ahead && behind) out.push(`Your branch is behind 'origin/${b}' by ${behind} commit(s).`, '  (use "git pull" to update your local branch)');
                else out.push(`Your branch and 'origin/${b}' have diverged,`, `and have ${ahead} and ${behind} different commits each, respectively.`);
            }
            out.push('nothing to commit, working tree clean');
            return out;
        }

        clone() {
            const r = new Repo();
            r.commits = new Map([...this.commits].map(([k, v]) => [k, { ...v, parents: [...v.parents] }]));
            r.branches = new Map(this.branches);
            r.remote = new Map(this.remote);
            r.upstream = new Set(this.upstream);
            r.tags = new Map(this.tags);
            r.head = { ...this.head };
            r.lanes = new Map(this.lanes);
            r.order = this.order; r.count = this.count; r.hasRemote = this.hasRemote; r.last = this.last;
            return r;
        }
    }

    // ------------------------------------------------------------- Renderer

    const NS = 'http://www.w3.org/2000/svg';
    const LANES = 6;
    const H = { col: 70, lane: 74, padX: 34, padTop: 52, padBottom: 34, r: 14 };
    const V = { row: 46, lane: 32, padX: 24, padY: 26, r: 11 };
    const CHAR = 6.7; // largura aproximada de um caractere em JetBrains Mono 11px

    function el(name, attrs, parent) {
        const e = document.createElementNS(NS, name);
        for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    }

    function shorten(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    function refsByCommit(repo) {
        const map = new Map();
        const add = (id, ref) => { if (!id) return; if (!map.has(id)) map.set(id, []); map.get(id).push(ref); };
        for (const [b, id] of repo.branches) {
            const synced = repo.remote.get(b) === id;
            add(id, { kind: 'branch', name: b, head: repo.head.branch === b, synced, lane: repo.laneFor(b) });
        }
        for (const [b, id] of repo.remote) {
            if (repo.branches.get(b) === id) continue;
            add(id, { kind: 'remote', name: 'origin/' + b, lane: repo.laneFor(b) });
        }
        for (const [t, id] of repo.tags) add(id, { kind: 'tag', name: t });
        if (repo.head.detached) add(repo.head.detached, { kind: 'detached', name: 'HEAD' });
        for (const list of map.values()) list.sort((a, b) => (b.head ? 1 : 0) - (a.head ? 1 : 0));
        return map;
    }

    function refWidth(ref) {
        const text = ref.kind === 'branch' && ref.synced ? ref.name + ' ☁' : ref.name;
        return Math.round(text.length * CHAR + 16) + (ref.head ? 40 : 0);
    }

    class GraphView {
        constructor(container, opts = {}) {
            this.container = container;
            this.opts = opts;
            this.legend = document.createElement('ul');
            this.legend.className = 'gg-legend';
            this.legend.setAttribute('aria-label', 'Cor de cada linha');
            container.appendChild(this.legend);
            this.svg = el('svg', { class: 'gg-svg', role: 'img' });
            this.title = el('title', {}, this.svg);
            this.gEdges = el('g', { class: 'gg-edges' }, this.svg);
            this.gNodes = el('g', { class: 'gg-nodes' }, this.svg);
            this.gRefs = el('g', { class: 'gg-refs' }, this.svg);
            container.appendChild(this.svg);
            this.nodes = new Map(); this.edges = new Map(); this.refs = new Map();
            this.fixed = null;
        }

        orientation() {
            if (this.opts.orient === 'h' || this.opts.orient === 'v') return this.opts.orient;
            return (this.container.clientWidth || 800) < 560 ? 'v' : 'h';
        }

        // Fixa o tamanho do desenho para o estado final, para não "pular" a cada passo.
        reserve(repo) {
            this.fixed = null;
            if (repo) this.fixed = { ...this.measure(repo), row: this.layout(repo).row };
        }

        layout(repo) {
            const visible = [...repo.commits.values()].sort((a, b) => a.order - b.order);
            const col = new Map();
            visible.forEach((c, i) => col.set(c.id, i));
            // Commit abandonado no meio de uma linha viva "cai" meia faixa,
            // senão parece que a linha passa por ele (ex.: depois de um reset).
            const live = repo.reachable();
            const spans = [];
            for (const c of visible) if (live.has(c.id)) for (const p of c.parents) {
                if (repo.commits.get(p).lane === c.lane) spans.push([c.lane, col.get(p), col.get(c.id)]);
            }
            const dropped = new Set(visible.filter(c => !live.has(c.id) &&
                spans.some(([l, a, b]) => l === c.lane && a < col.get(c.id) && col.get(c.id) < b)).map(c => c.id));
            // só linhas que têm commits ocupam espaço na tela; num roteiro, a ordem
            // vem do estado final para nada mudar de lugar entre um passo e outro
            const lanesHere = [...new Set(visible.map(c => c.lane))].sort((a, b) => a - b);
            const fixedRows = this.fixed?.row;
            const row = fixedRows && lanesHere.every(l => fixedRows.has(l))
                ? fixedRows : new Map(lanesHere.map((l, i) => [l, i]));
            const y = c => row.get(c.lane) + (dropped.has(c.id) ? .5 : 0);
            return { visible, col, live, dropped, y, row };
        }

        measure(repo) {
            const o = this.orientation();
            const { visible, y } = this.layout(repo);
            const lanes = Math.max(1, ...visible.map(c => y(c) + 1));
            const refs = refsByCommit(repo);
            if (o === 'h') {
                let w = H.padX * 2 + Math.max(0, visible.length - 1) * H.col;
                visible.forEach((c, i) => {
                    const list = refs.get(c.id) || [];
                    const total = list.reduce((s, r) => s + refWidth(r) + 4, 0);
                    w = Math.max(w, H.padX + i * H.col + total / 2 + 8);
                });
                return { o, w: Math.max(w, 200), h: H.padTop + (lanes - 1) * H.lane + H.padBottom, lanes, n: visible.length };
            }
            let textW = 0;
            visible.forEach(c => {
                const list = refs.get(c.id) || [];
                textW = Math.max(textW, list.reduce((s, r) => s + refWidth(r) + 4, 0) + c.msg.length * 6.4 + 50);
            });
            return { o, w: V.padX * 2 + (lanes - 1) * V.lane + Math.min(textW, 520), h: V.padY * 2 + Math.max(0, visible.length - 1) * V.row, lanes, n: visible.length };
        }

        pos(o, lane, i) {
            return o === 'h'
                ? { x: H.padX + i * H.col, y: H.padTop + lane * H.lane }
                : { x: V.padX + lane * V.lane, y: V.padY + i * V.row };
        }

        render(repo, { highlight } = {}) {
            const o = this.orientation();
            const m = this.measure(repo);
            const box = this.fixed && this.fixed.o === o ? { w: Math.max(this.fixed.w, m.w), h: Math.max(this.fixed.h, m.h), lanes: Math.max(this.fixed.lanes, m.lanes) } : m;
            // amplia o desenho quando sobra espaço (fica legível num projetor)
            const room = (this.container.clientWidth || box.w) - 16;
            const scale = o === 'h' ? Math.max(.75, Math.min(1.5, room / box.w)) : 1;
            this.svg.setAttribute('viewBox', `0 0 ${box.w} ${box.h}`);
            this.svg.setAttribute('width', Math.round(box.w * scale));
            this.svg.setAttribute('height', Math.round(box.h * scale));
            this.svg.dataset.orient = o;
            if (this.lastOrient && this.lastOrient !== o) { this.clear(); }
            this.lastOrient = o;

            const { visible, col, live, y, row } = this.layout(repo);
            const R = o === 'h' ? H.r : V.r;

            // legenda: de quem é cada linha (útil quando a branch já foi apagada)
            const used = [...new Set(visible.map(c => c.lane))].sort((a, b) => row.get(a) - row.get(b));
            this.legend.innerHTML = '';
            if (used.length > 1) for (const l of used) {
                const name = [...repo.lanes].find(([, v]) => v === l)?.[0] || '';
                const li = document.createElement('li');
                li.style.setProperty('--c', `var(--lane-${l % LANES})`);
                li.textContent = name === '(HEAD)' ? 'sem branch (detached HEAD)' : name.startsWith('origin/') ? `${name} (enviado por colega)` : name;
                this.legend.appendChild(li);
            }
            const at = id => this.pos(o, y(repo.commits.get(id)), col.get(id));
            const laneVar = l => `var(--lane-${l % LANES})`;
            const textX = V.padX + (box.lanes - 1) * V.lane + 26;

            // arestas
            const seenE = new Set();
            for (const c of visible) {
                c.parents.forEach((p, idx) => {
                    const key = p + '>' + c.id;
                    seenE.add(key);
                    const a = at(p), b = at(c.id);
                    const pc = repo.commits.get(p);
                    const lane = idx === 0 ? c.lane : pc.lane;
                    let d;
                    if (o === 'h') {
                        if (a.y === b.y) d = `M${a.x},${a.y} L${b.x},${b.y}`;
                        else if (idx === 0) d = `M${a.x},${a.y} C${a.x + H.col * .55},${a.y} ${a.x + H.col * .45},${b.y} ${a.x + H.col},${b.y} L${b.x},${b.y}`;
                        else d = `M${a.x},${a.y} L${b.x - H.col},${a.y} C${b.x - H.col * .45},${a.y} ${b.x - H.col * .55},${b.y} ${b.x},${b.y}`;
                    } else {
                        if (a.x === b.x) d = `M${a.x},${a.y} L${b.x},${b.y}`;
                        else if (idx === 0) d = `M${a.x},${a.y} C${a.x},${a.y + V.row * .55} ${b.x},${a.y + V.row * .45} ${b.x},${a.y + V.row} L${b.x},${b.y}`;
                        else d = `M${a.x},${a.y} L${a.x},${b.y - V.row} C${a.x},${b.y - V.row * .45} ${b.x},${b.y - V.row * .55} ${b.x},${b.y}`;
                    }
                    let e = this.edges.get(key);
                    const fresh = !e;
                    if (fresh) { e = el('path', { class: 'gg-edge' }, this.gEdges); this.edges.set(key, e); }
                    e.setAttribute('d', d);
                    e.style.setProperty('--c', laneVar(lane));
                    e.classList.toggle('is-orphan', !live.has(c.id));
                    e.classList.toggle('is-remote', !!c.remoteOnly);
                    e.classList.toggle('is-merge', idx > 0);
                    if (fresh && this.animate) {
                        const len = e.getTotalLength ? e.getTotalLength() : 100;
                        e.style.strokeDasharray = len; e.style.strokeDashoffset = len;
                        requestAnimationFrame(() => requestAnimationFrame(() => { e.style.strokeDashoffset = 0; }));
                        setTimeout(() => { e.style.strokeDasharray = ''; e.style.strokeDashoffset = ''; }, 700);
                    }
                });
            }
            for (const [k, e] of this.edges) if (!seenE.has(k)) { e.remove(); this.edges.delete(k); }

            // commits
            const seenN = new Set();
            for (const c of visible) {
                seenN.add(c.id);
                const p = at(c.id);
                let g = this.nodes.get(c.id);
                const fresh = !g;
                if (fresh) {
                    g = el('g', { class: 'gg-node' }, this.gNodes);
                    el('title', {}, g);
                    el('circle', { class: 'gg-dot' }, g);
                    el('text', { class: 'gg-id', 'text-anchor': 'middle', dy: '.35em' }, g);
                    el('text', { class: 'gg-msg' }, g);
                    this.nodes.set(c.id, g);
                    if (this.animate) g.classList.add('is-new');
                }
                const [title, dot, idText, msg] = g.children;
                g.setAttribute('transform', `translate(${p.x},${p.y})`);
                g.style.setProperty('--c', laneVar(c.lane));
                dot.setAttribute('r', R);
                idText.textContent = c.id;
                idText.setAttribute('font-size', c.id.length > 2 ? (o === 'h' ? 10 : 8.5) : (o === 'h' ? 12 : 10));
                const orphan = !live.has(c.id);
                title.textContent = `${c.id}: ${c.msg}` + (c.parents.length > 1 ? ' (merge)' : '') + (c.remoteOnly ? ' — só existe no GitHub' : '') + (orphan ? ' — sem branch apontando' : '');
                if (o === 'h') {
                    msg.setAttribute('x', 0); msg.setAttribute('y', R + 16); msg.setAttribute('text-anchor', 'middle');
                    msg.textContent = shorten(c.msg, 11);
                } else {
                    msg.setAttribute('x', textX - p.x); msg.setAttribute('y', 0); msg.setAttribute('dy', '.35em'); msg.setAttribute('text-anchor', 'start');
                    msg.textContent = shorten(c.msg, 34);
                }
                g.classList.toggle('is-merge', c.parents.length > 1);
                g.classList.toggle('is-orphan', orphan);
                g.classList.toggle('is-remote', !!c.remoteOnly);
                g.classList.toggle('is-head', repo.headCommit() === c.id);
                g.classList.toggle('is-hl', highlight === c.id);
                g.dataset.id = c.id;
            }
            for (const [k, g] of this.nodes) if (!seenN.has(k)) { g.remove(); this.nodes.delete(k); }

            // referências (branches, tags, HEAD)
            const refs = refsByCommit(repo);
            const seenR = new Set();
            for (const [id, list] of refs) {
                if (!col.has(id)) continue;
                const p = at(id);
                const widths = list.map(refWidth);
                const total = widths.reduce((s, w) => s + w + 4, -4);
                let x = o === 'h' ? p.x - total / 2 : textX;
                const y = o === 'h' ? p.y - R - 26 : p.y - 10;
                const msgW = o === 'v' ? 0 : 0;
                list.forEach((ref, i) => {
                    const key = ref.kind + ':' + ref.name;
                    seenR.add(key);
                    let g = this.refs.get(key);
                    const fresh = !g;
                    if (fresh) {
                        g = el('g', { class: 'gg-ref' }, this.gRefs);
                        el('rect', { class: 'gg-ref-head', rx: 5, height: 20 }, g);
                        el('text', { class: 'gg-ref-head-t', y: 14 }, g).textContent = 'HEAD';
                        el('rect', { class: 'gg-ref-box', rx: 10, height: 20 }, g);
                        el('text', { class: 'gg-ref-t', y: 14 }, g);
                        this.refs.set(key, g);
                    }
                    const [hr, ht, box2, t] = g.children;
                    const hw = ref.head ? 40 : 0;
                    hr.setAttribute('width', 44); hr.setAttribute('x', 0);
                    ht.setAttribute('x', 7);
                    hr.style.display = ht.style.display = ref.head ? '' : 'none';
                    box2.setAttribute('x', hw); box2.setAttribute('width', widths[i] - hw);
                    t.setAttribute('x', hw + 8);
                    t.textContent = ref.kind === 'branch' && ref.synced ? ref.name + ' ☁' : ref.name;
                    g.setAttribute('class', `gg-ref is-${ref.kind}` + (ref.head ? ' is-current' : ''));
                    if (ref.lane != null) g.style.setProperty('--c', laneVar(ref.lane));
                    const tr = `translate(${x}px, ${y}px)`;
                    if (fresh) {
                        g.style.transform = tr;
                        if (this.animate) g.classList.add('is-new');
                    } else g.style.transform = tr;
                    x += widths[i] + 4;
                });
                if (o === 'v') {
                    const node = this.nodes.get(id);
                    if (node) node.children[3].setAttribute('x', x - p.x + 4 + msgW);
                }
            }
            for (const [k, g] of this.refs) if (!seenR.has(k)) { g.remove(); this.refs.delete(k); }

            this.title.textContent = this.describe(repo);
            if (o === 'v') {
                // Mensagens não podem ficar embaixo das etiquetas
                for (const c of visible) if (!refs.has(c.id)) { const n = this.nodes.get(c.id); n && n.children[3].setAttribute('x', textX - at(c.id).x); }
            }
        }

        clear() {
            for (const m of [this.nodes, this.edges, this.refs]) { for (const e of m.values()) e.remove(); m.clear(); }
        }

        describe(repo) {
            const parts = [`Grafo com ${repo.commits.size} commits.`];
            for (const [b, id] of repo.branches) if (id) parts.push(`${b} aponta para ${id}${repo.head.branch === b ? ' (HEAD)' : ''}.`);
            for (const [b, id] of repo.remote) parts.push(`origin/${b} aponta para ${id}.`);
            return parts.join(' ');
        }
    }

    // ---------------------------------------------------------------- Player

    function inlineMd(s) {
        const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return esc.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    }

    function parseScript(text) {
        const setup = [], steps = [];
        for (const raw of text.split('\n')) {
            const line = raw.trim();
            if (!line || line.startsWith('#')) continue;
            if (line.startsWith('=')) setup.push(line.slice(1).trim());
            else if (line.startsWith('$')) steps.push({ cmds: [line.slice(1).trim()], text: '' });
            else if (line.startsWith('+') && steps.length) steps[steps.length - 1].cmds.push(line.slice(1).trim());
            else if (line.startsWith('>')) {
                const t = line.slice(1).trim();
                if (steps.length) steps[steps.length - 1].text += (steps[steps.length - 1].text ? ' ' : '') + t;
                else setup.intro = (setup.intro ? setup.intro + ' ' : '') + t;
            }
        }
        return { setup, steps };
    }

    function runAll(repo, cmds) {
        const out = [];
        for (const c of cmds) {
            try { out.push(...repo.run(c)); }
            catch (e) { if (e instanceof GitError) out.push({ error: e.message }); else throw e; }
        }
        return out;
    }

    function outputLines(out) {
        const frag = document.createDocumentFragment();
        for (const o of out) {
            const isErr = typeof o === 'object';
            for (const l of (isErr ? o.error : o).split('\n')) {
                const d = document.createElement('div');
                d.className = isErr ? 'gv-out is-error' : 'gv-out';
                d.textContent = l || ' ';
                frag.appendChild(d);
            }
        }
        return frag;
    }

    class Player {
        constructor(fig) {
            this.fig = fig;
            const src = fig.querySelector('script[type="text/plain"]');
            this.script = parseScript(src ? src.textContent : '');
            const caption = fig.querySelector('figcaption');
            fig.classList.add('gv');
            const stage = document.createElement('div');
            stage.className = 'gv-stage';
            stage.tabIndex = 0;
            stage.setAttribute('aria-label', 'Área do grafo (role para os lados se necessário)');
            fig.insertBefore(stage, caption || null);
            this.view = new GraphView(stage, { orient: fig.dataset.orient });
            this.stage = stage;

            if (this.script.steps.length) this.buildControls(caption);
            this.final = this.stateAt(this.script.steps.length).repo;
            this.view.reserve(this.final);
            this.go(fig.hasAttribute('data-start-end') ? this.script.steps.length : 0, false);

            if (fig.hasAttribute('data-autoplay') && this.panel && !matchMedia('(prefers-reduced-motion: reduce)').matches) this.autoplay();

            let w = stage.clientWidth;
            new ResizeObserver(() => {
                if (Math.abs(stage.clientWidth - w) < 20) return;
                w = stage.clientWidth;
                this.view.reserve(this.final);
                this.go(this.i, false);
            }).observe(stage);
        }

        buildControls(caption) {
            const panel = document.createElement('div');
            panel.className = 'gv-panel';
            panel.innerHTML = `
                <div class="gv-term" aria-live="polite"><div class="gv-cmd"></div><div class="gv-output"></div></div>
                <p class="gv-text"></p>
                <div class="gv-controls">
                    <button type="button" class="gv-btn" data-act="reset" aria-label="Voltar ao início">⟲</button>
                    <button type="button" class="gv-btn" data-act="prev" aria-label="Passo anterior">‹</button>
                    <ol class="gv-dots"></ol>
                    <button type="button" class="gv-btn gv-next" data-act="next">Próximo passo</button>
                </div>`;
            this.fig.insertBefore(panel, caption || null);
            this.panel = panel;
            const dots = panel.querySelector('.gv-dots');
            this.script.steps.forEach((s, i) => {
                const li = document.createElement('li');
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = i + 1;
                b.setAttribute('aria-label', `Ir para o passo ${i + 1}: ${s.cmds.join(' e ')}`);
                b.addEventListener('click', () => this.go(i + 1));
                li.appendChild(b);
                dots.appendChild(li);
            });
            panel.addEventListener('click', e => {
                const act = e.target.closest('[data-act]')?.dataset.act;
                if (act === 'reset') this.go(0);
                if (act === 'prev') this.go(Math.max(0, this.i - 1));
                if (act === 'next') this.go(this.i >= this.script.steps.length ? 0 : this.i + 1);
            });
            this.fig.addEventListener('keydown', e => {
                if (e.target.closest('input, textarea')) return;
                if (e.key === 'ArrowRight') { this.go(Math.min(this.script.steps.length, this.i + 1)); e.preventDefault(); }
                if (e.key === 'ArrowLeft') { this.go(Math.max(0, this.i - 1)); e.preventDefault(); }
            });
        }

        // Avança sozinho enquanto visível; para de vez quando a pessoa interage.
        autoplay() {
            let timer = null, stopped = false;
            const tick = () => {
                if (stopped) return;
                if (this.i >= this.script.steps.length) { stopped = true; return; }
                this.go(this.i + 1);
            };
            const stop = () => { stopped = true; clearInterval(timer); };
            this.panel.addEventListener('pointerdown', stop, { once: true });
            this.panel.addEventListener('keydown', stop, { once: true });
            new IntersectionObserver(([en]) => {
                clearInterval(timer);
                if (en.isIntersecting && !stopped) timer = setInterval(tick, 2600);
            }, { threshold: .5 }).observe(this.fig);
        }

        stateAt(n) {
            const repo = new Repo();
            runAll(repo, this.script.setup);
            let out = [];
            for (let i = 0; i < n; i++) out = runAll(repo, this.script.steps[i].cmds);
            return { repo, out };
        }

        go(n, animate = true) {
            const prevLast = this.repo?.last;
            const { repo, out } = this.stateAt(n);
            const forward = n === (this.i ?? -1) + 1;
            this.view.animate = animate && forward && !matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (!forward || !animate) this.view.clear();
            this.i = n;
            this.repo = repo;
            this.view.render(repo, { highlight: n > 0 && repo.last !== prevLast ? repo.last : null });
            this.view.animate = false;
            if (!this.panel) return;
            const step = this.script.steps[n - 1];
            const cmd = this.panel.querySelector('.gv-cmd');
            const output = this.panel.querySelector('.gv-output');
            const text = this.panel.querySelector('.gv-text');
            cmd.innerHTML = '';
            output.innerHTML = '';
            if (step) {
                step.cmds.forEach(c => {
                    const d = document.createElement('div');
                    d.className = 'gv-line';
                    d.textContent = c;
                    cmd.appendChild(d);
                });
                output.appendChild(outputLines(out));
                text.innerHTML = inlineMd(step.text);
            } else {
                const d = document.createElement('div');
                d.className = 'gv-line is-idle';
                d.textContent = 'Clique em “Próximo passo” para rodar o primeiro comando';
                cmd.appendChild(d);
                text.innerHTML = inlineMd(this.script.setup.intro || 'Este é o ponto de partida.');
            }
            this.panel.querySelectorAll('.gv-dots button').forEach((b, i) => {
                b.classList.toggle('is-done', i < n);
                b.setAttribute('aria-current', i === n - 1 ? 'step' : 'false');
            });
            const total = this.script.steps.length;
            const next = this.panel.querySelector('.gv-next');
            next.textContent = n >= total ? 'Ver de novo' : n === 0 ? 'Começar' : 'Próximo passo';
            this.panel.querySelector('[data-act="prev"]').disabled = n === 0;
            this.panel.querySelector('[data-act="reset"]').disabled = n === 0;
        }
    }

    // -------------------------------------------------------------- Terminal

    const HELP = [
        'Comandos disponíveis no simulador:',
        '  git commit -m "mensagem"      git commit --amend -m "..."',
        '  git branch [nome]             git branch -d nome',
        '  git switch nome               git switch -c nome',
        '  git checkout nome|commit      git checkout -b nome',
        '  git merge branch [--no-ff]    git merge --squash branch',
        '  git rebase branch             git cherry-pick commit',
        '  git reset --hard|--soft ref   git revert commit',
        '  git tag nome                  git log | git status',
        '  git push [-u origin nome]     git pull [--rebase]   git fetch',
        '  colega commit -m "..."        (simula alguém enviando ao GitHub)',
        '  clear  ·  reset (recomeça)',
        'Referências aceitas: main, HEAD, HEAD~1, origin/main, A, B, ...',
    ];

    class Terminal {
        constructor(root) {
            this.root = root;
            this.stage = root.querySelector('.lab-graph');
            this.log = root.querySelector('.lab-log');
            this.form = root.querySelector('.lab-form');
            this.input = root.querySelector('.lab-input');
            this.prompt = root.querySelector('.lab-prompt');
            this.view = new GraphView(this.stage, {});
            this.history = []; this.hIndex = 0;
            this.listeners = [];
            this.load(root.dataset.setup || 'git commit -m "início"');
            this.form.addEventListener('submit', e => { e.preventDefault(); this.exec(this.input.value); });
            this.input.addEventListener('keydown', e => {
                if (e.key === 'ArrowUp' && this.history.length) { this.hIndex = Math.max(0, this.hIndex - 1); this.input.value = this.history[this.hIndex]; e.preventDefault(); }
                if (e.key === 'ArrowDown' && this.history.length) { this.hIndex = Math.min(this.history.length, this.hIndex + 1); this.input.value = this.history[this.hIndex] || ''; e.preventDefault(); }
            });
            root.querySelectorAll('[data-lab-cmd]').forEach(b => b.addEventListener('click', () => { this.input.value = b.dataset.labCmd; this.input.focus(); }));
            new ResizeObserver(() => this.draw()).observe(this.stage);
        }

        load(setup, note) {
            this.repo = new Repo();
            runAll(this.repo, setup.split(';').map(s => s.trim()).filter(Boolean));
            this.log.innerHTML = '';
            this.print([note || 'Repositório de prática pronto. Digite "help" para ver os comandos.'], 'gv-out is-note');
            this.view.clear();
            this.draw();
            this.emit();
        }

        draw(highlight) {
            this.view.render(this.repo, { highlight });
            this.prompt.textContent = `(${this.repo.head.branch || 'HEAD ' + this.repo.head.detached}) $`;
            this.stage.scrollLeft = this.stage.scrollWidth;
            this.stage.scrollTop = this.stage.scrollHeight;
        }

        print(lines, cls = 'gv-out') {
            for (const l of lines) for (const part of String(l).split('\n')) {
                const d = document.createElement('div');
                d.className = cls;
                d.textContent = part || ' ';
                this.log.appendChild(d);
            }
            this.log.scrollTop = this.log.scrollHeight;
        }

        exec(raw) {
            const line = raw.trim();
            this.input.value = '';
            if (!line) return;
            this.history.push(line); this.hIndex = this.history.length;
            this.print([`${this.prompt.textContent} ${line}`], 'gv-out is-cmd');
            if (line === 'clear') { this.log.innerHTML = ''; return; }
            if (line === 'help') { this.print(HELP); return; }
            if (line === 'reset' || line === 'recomeçar') { this.load(this.root.dataset.setup || 'git commit -m "início"'); return; }
            const before = this.repo.last;
            for (const part of line.split(/\s*&&\s*/)) {
                try { this.print(this.repo.run(part)); }
                catch (e) {
                    if (!(e instanceof GitError)) throw e;
                    this.print([e.message], 'gv-out is-error');
                    break;
                }
            }
            this.view.animate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
            this.draw(this.repo.last !== before ? this.repo.last : null);
            this.view.animate = false;
            this.emit();
        }

        onChange(fn) { this.listeners.push(fn); }
        emit() { this.listeners.forEach(fn => fn(this.repo)); }
    }

    window.GitSim = { Repo, GraphView, Player, Terminal, GitError };

    function boot() {
        document.querySelectorAll('figure.gitviz').forEach(fig => {
            try { new Player(fig); }
            catch (e) { console.error('Erro no grafo', fig, e); fig.classList.add('gv-broken'); }
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
