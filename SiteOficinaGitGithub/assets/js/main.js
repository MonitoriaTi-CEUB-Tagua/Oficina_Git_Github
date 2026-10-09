document.documentElement.classList.add('js');
const menu = document.querySelector('.menu-toggle');
const sidebar = document.querySelector('.sidebar');
menu?.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    sidebar.classList.toggle('is-open', open);
});
const monitorsToggle = document.querySelector('.monitors-toggle');
const monitorsDialog = document.querySelector('#monitors-dialog');
const monitorsClose = document.querySelector('.monitors-close');
monitorsToggle?.addEventListener('click', () => monitorsDialog?.showModal());
monitorsClose?.addEventListener('click', () => monitorsDialog?.close());
monitorsDialog?.addEventListener('click', event => {
    if (event.target === monitorsDialog) monitorsDialog.close();
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') {
        menu.setAttribute('aria-expanded', 'false'); sidebar.classList.remove('is-open'); menu.focus();
    }
});
document.querySelectorAll('.copy').forEach(button => button.addEventListener('click', async () => {
    const text = button.closest('.codebox').querySelector('code').textContent;
    try {
        if (!navigator.clipboard) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(text);
        button.textContent = 'Copiado!';
    } catch {
        const range = document.createRange();
        range.selectNodeContents(button.closest('.codebox').querySelector('code'));
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        button.textContent = 'Use Ctrl/Cmd+C';
    }
    setTimeout(() => { button.textContent = 'Copiar'; }, 2500);
}));
const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const search = document.querySelector('#command-search');
search?.addEventListener('input', () => {
    const terms = normalize(search.value).trim().split(/\s+/);
    let count = 0;
    document.querySelectorAll('[data-command]').forEach(row => {
        const match = terms.every(term => normalize(row.textContent).includes(term));
        row.hidden = !match; if (match) count++;
    });
    document.querySelector('#search-count').textContent = `${count} comandos encontrados`;
});
const labData = [
    { branch: 'main', text: 'O projeto começa no commit A. HEAD aponta para main, a branch atual.', log: 'main: A  •  HEAD → main', cmd: 'git status' },
    { branch: 'feature/menu', text: 'A nova branch parte de A. O switch também muda sua branch atual; criar a branch ainda não cria outro commit.', log: 'main: A  |  feature/menu: A  •  HEAD → feature/menu', cmd: 'git switch -c feature/menu' },
    { branch: 'feature/menu', text: 'Após editar e salvar o arquivo, o commit B registra o menu só na feature. main continua em A.', log: 'main: A  |  feature/menu: A → B', cmd: 'git add index.html\ngit commit -m "feat: adiciona menu"' },
    { branch: 'main', text: 'De volta à main, o merge avança de A para B: fast-forward. As duas branches apontam para B. Nada foi enviado ao GitHub ainda.', log: 'main: A → B  |  feature/menu: A → B  •  HEAD → main', cmd: 'git switch main\ngit merge feature/menu' }
];
document.querySelectorAll('[data-lab-step]').forEach(button => button.addEventListener('click', () => {
    const state = labData[Number(button.dataset.labStep)];
    document.querySelectorAll('[data-lab-step]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    document.querySelector('#lab-branch').textContent = state.branch;
    document.querySelector('#lab-text').textContent = state.text;
    document.querySelector('#lab-log').textContent = state.log;
    document.querySelector('#lab-command').textContent = state.cmd;
}));
const progress = document.querySelector('.read-progress');
function updateProgress() {
    const available = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.width = `${available > 0 ? (window.scrollY / available) * 100 : 0}%`;
}
window.addEventListener('scroll', updateProgress, { passive: true });
window.addEventListener('resize', updateProgress); updateProgress();
