// ═══════════════════════════════════════════════════
//  REVITAEL — app.js
// ═══════════════════════════════════════════════════

const API_BASE = 'https://revitael.onrender.com';

// ── SERVER WARMUP ────────────────────────────────────
let serverReady = false;
fetch(API_BASE + '/health')
    .then(() => {
        serverReady = true;
        document.getElementById('warmup-banner')?.classList.add('hidden');
    })
    .catch(() => {});

// ── HELPERS ──────────────────────────────────────────
function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function ce(field) {
    return `contenteditable="true" data-cv-field="${field}" class="cv-editable"`;
}

// Extrai o primeiro objeto JSON balanceado que começa com {"<field>":
function extractBalancedJson(text, field) {
    const start = text.search(new RegExp('\\{\\s*"' + field + '"\\s*:'));
    if (start === -1) return null;
    let depth = 0, inString = false, escape = false;
    for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (escape)              { escape = false; continue; }
        if (c === '\\' && inString) { escape = true;  continue; }
        if (c === '"')           { inString = !inString; continue; }
        if (inString)            continue;
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
    return null;
}

// ── STATE ────────────────────────────────────────────
let currentTheme  = localStorage.getItem('revitael-theme') || 'light';
let currentMode   = null; // 'creator' | 'analyzer'
let creatorMsgs   = [];   // [{role, content}]
let analyzerMsgs  = [];
let cvData        = {};   // structured CV data extracted from chat
let currentStyle  = 'profissional';
let cvReady       = false;
let analyzerBusy  = false;
let creatorBusy   = false;
let extractedCvText = '';

// ── THEME ─────────────────────────────────────────────
function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    const sunEls  = document.querySelectorAll('[id^="icon-sun"]');
    const moonEls = document.querySelectorAll('[id^="icon-moon"]');
    sunEls.forEach(el  => el.style.display = t === 'dark'  ? '' : 'none');
    moonEls.forEach(el => el.style.display = t === 'light' ? '' : 'none');
    localStorage.setItem('revitael-theme', t);
    currentTheme = t;
}

function toggleTheme() {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

applyTheme(currentTheme);

document.getElementById('btn-theme').addEventListener('click', toggleTheme);
document.getElementById('btn-theme-app').addEventListener('click', toggleTheme);

// ── SCROLL ANIMATIONS ─────────────────────────────────
const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// ── MAGNETIC BUTTONS ──────────────────────────────────
document.querySelectorAll('.magnetic').forEach(btn => {
    btn.addEventListener('mousemove', e => {
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width  / 2) * 0.18;
        const y = (e.clientY - r.top  - r.height / 2) * 0.18;
        btn.style.transform = `translate(${x}px, ${y}px)`;
    });
    btn.addEventListener('mouseleave', () => btn.style.transform = '');
});

// ── NAV SCROLL ────────────────────────────────────────
window.addEventListener('scroll', () => {
    document.getElementById('nav')?.classList.toggle('scrolled', window.scrollY > 20);
});

// ── NAVIGATION: LANDING ↔ APP ─────────────────────────
function openApp(mode) {
    document.getElementById('landing').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('mode-select').style.display = '';
    document.getElementById('creator-mode').classList.add('hidden');
    document.getElementById('analyzer-mode').classList.add('hidden');
    if (mode) selectMode(mode);
}

function backToLanding() {
    document.getElementById('app').classList.add('hidden');
    document.getElementById('landing').classList.remove('hidden');
    currentMode = null;
}

document.getElementById('btn-back').addEventListener('click', backToLanding);
document.getElementById('app-logo-link').addEventListener('click', e => { e.preventDefault(); backToLanding(); });
document.getElementById('nav-logo-link').addEventListener('click', e => { e.preventDefault(); window.scrollTo({top:0, behavior:'smooth'}); });

['btn-criar','btn-analisar','btn-criar-2','btn-analisar-2','btn-nav-start'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', () => {
        const mode = el.dataset.mode || null;
        openApp(mode);
    });
});

document.getElementById('mode-card-creator').addEventListener('click', () => selectMode('creator'));
document.getElementById('mode-card-analyzer').addEventListener('click', () => selectMode('analyzer'));

function selectMode(mode) {
    currentMode = mode;
    document.getElementById('mode-select').style.display = 'none';
    document.getElementById('creator-mode').classList.toggle('hidden', mode !== 'creator');
    document.getElementById('analyzer-mode').classList.toggle('hidden', mode !== 'analyzer');

    if (mode === 'creator' && creatorMsgs.length === 0) {
        // Mostra banner de warmup se o servidor ainda não respondeu
        if (!serverReady) {
            document.getElementById('warmup-banner').classList.remove('hidden');
        }
        // Mobile: mostrar painel do chat por padrão
        setMobilePanel('chat');
        checkSavedCv();
        startCreatorChat();
    }
    if (mode === 'analyzer') {
        renderAnalysisHistory();
    }
}

// ── RESET ─────────────────────────────────────────────
document.getElementById('btn-reset-creator').addEventListener('click', () => {
    if (!confirm('Recomeçar a conversa? O progresso será perdido.')) return;
    creatorMsgs = [];
    cvData = {};
    cvReady = false;
    clearStorage();
    document.getElementById('creator-messages').innerHTML = '';
    document.getElementById('btn-download-cv').disabled = true;
    document.getElementById('btn-copy-cv').classList.add('hidden');
    document.getElementById('btn-translate-cv').classList.add('hidden');
    document.getElementById('btn-photo-label').classList.add('hidden');
    document.getElementById('btn-share-link').classList.add('hidden');
    document.getElementById('ats-panel').classList.add('hidden');
    document.getElementById('edit-hint').classList.add('hidden');
    document.getElementById('ats-result').classList.add('hidden');
    document.getElementById('saved-cv-banner').classList.add('hidden');
    resetProgress();
    showPreviewEmpty();
    startCreatorChat();
});

document.getElementById('btn-reset-analyzer').addEventListener('click', () => {
    document.getElementById('results-panel').classList.add('hidden');
    document.getElementById('upload-panel').style.display = '';
    analyzerMsgs = [];
    extractedCvText = '';
    document.getElementById('analyzer-messages').innerHTML = '';
    document.getElementById('cv-file-input').value = '';
    document.getElementById('upload-success').classList.add('hidden');
    document.getElementById('job-description').value = '';
    removeFile();
});

// ═══════════════════════════════════════════════════
//  CREATOR — CHAT
// ═══════════════════════════════════════════════════
function startCreatorChat() {
    const welcome = `Olá! 👋 Eu sou o **Revitael**, seu assistente de currículo com IA.

Vou te ajudar a criar um currículo incrível, passo a passo! Pode ser completamente à vontade — vou fazendo as perguntas certas e até te lembrar de coisas que você pode ter esquecido.

Para começar: **qual é o seu nome completo e em qual área você atua (ou quer atuar)?** 😊`;

    appendMessage('creator-messages', 'ai', welcome);
}

async function sendCreatorMessage(text) {
    if (!text.trim() || creatorBusy) return;
    creatorBusy = true;
    setSendDisabled('creator-send', true);

    appendMessage('creator-messages', 'user', text);
    creatorMsgs.push({ role: 'user', content: text });

    const { bubble, container } = createStreamingBubble('creator-messages');

    try {
        const fullText = await streamApi('/api/chat', { messages: creatorMsgs, mode: 'creator' }, (_, full) => {
            const clean = full.replace(/<!--CV_JSON:[\s\S]*?-->/g, '').replace(/<!--ANALYSIS_JSON:[\s\S]*?-->/g, '').trim();
            bubble.innerHTML = clean.replace(/\n/g, '<br>') + '<span class="stream-cursor">▋</span>';
            scrollBottom(container);
        });
        const clean = fullText.replace(/<!--CV_JSON:[\s\S]*?-->/g, '').replace(/<!--ANALYSIS_JSON:[\s\S]*?-->/g, '').trim();
        bubble.innerHTML = markdownToHtml(clean);
        creatorMsgs.push({ role: 'assistant', content: fullText });
        parseCvJson(fullText);
        updateProgress();
        saveToStorage();
    } catch (err) {
        bubble.innerHTML = `⚠️ ${err.message || 'Erro ao conectar. Tente novamente.'}`;
    }

    creatorBusy = false;
    setSendDisabled('creator-send', false);
}

// Chat input events
document.getElementById('creator-send').addEventListener('click', () => {
    const inp = document.getElementById('creator-input');
    const val = inp.value.trim();
    if (!val) return;
    inp.value = '';
    autoResizeTextarea(inp);
    sendCreatorMessage(val);
});

document.getElementById('creator-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('creator-send').click();
    }
});

document.getElementById('creator-input').addEventListener('input', function() { autoResizeTextarea(this); });

// ── PARSE CV JSON FROM AI RESPONSE ───────────────────
function parseCvJson(text) {
    // Tentativa 1: tag correta <!--CV_JSON:...-->
    let raw = null;
    const tagMatch = text.match(/<!--CV_JSON:([\s\S]*?)-->/);
    if (tagMatch) {
        raw = tagMatch[1];
    } else {
        // Fallback: modelo outputou JSON solto — extrai com contagem de chaves
        raw = extractBalancedJson(text, 'name');
    }
    if (!raw) return;
    try {
        const data = JSON.parse(raw);
        if (!data.name && !data.contact) return; // não é um CV
        cvData = { ...cvData, ...data };
        if (data.style) {
            currentStyle = data.style;
            document.querySelectorAll('.style-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.style === data.style));
        }
        renderCvPreview();
        cvReady = true;
        document.getElementById('btn-download-cv').disabled = false;
        document.getElementById('btn-copy-cv').classList.remove('hidden');
        document.getElementById('btn-translate-cv').classList.remove('hidden');
        document.getElementById('btn-photo-label').classList.remove('hidden');
        document.getElementById('btn-share-link').classList.remove('hidden');
        document.getElementById('ats-panel').classList.remove('hidden');
        document.getElementById('edit-hint').classList.remove('hidden');
        switchToPreviewOnMobile();
        saveToStorage();
    } catch(e) { /* JSON inválido */ }
}

// ── CV PREVIEW RENDER ─────────────────────────────────
function showPreviewEmpty() {
    document.getElementById('preview-body').innerHTML = `
        <div class="preview-empty">
            <div class="preview-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
            </div>
            <p>Seu currículo aparecerá aqui<br>conforme você conversa</p>
        </div>`;
}

function renderCvPreview() {
    const html = buildCvHtml(cvData, currentStyle);
    document.getElementById('preview-body').innerHTML =
        `<div class="cv-preview-wrap">${html}</div>`;
}

// Style picker
document.getElementById('style-picker').addEventListener('click', e => {
    const btn = e.target.closest('.style-btn');
    if (!btn) return;
    currentStyle = btn.dataset.style;
    document.querySelectorAll('.style-btn').forEach(b => b.classList.toggle('active', b === btn));
    if (cvReady) renderCvPreview();
});

// ── BUILD CV HTML ─────────────────────────────────────
function buildCvHtml(d, style) {
    const name    = d.name    || 'Seu Nome';
    const contact = d.contact || {};
    const email   = contact.email    || '';
    const phone   = contact.phone    || '';
    const linkedin= contact.linkedin || '';
    const city    = contact.city     || '';
    const summary = d.summary || '';
    const exp     = d.experience    || [];
    const edu     = d.education     || [];
    const skills  = d.skills        || [];
    const langs   = d.languages     || [];
    const certs   = d.certifications|| [];
    const projects= d.projects      || [];

    const contactSpans = [
        email    ? `<span ${ce('contact.email')}>${esc(email)}</span>`       : '',
        phone    ? `<span ${ce('contact.phone')}>${esc(phone)}</span>`       : '',
        linkedin ? `<span ${ce('contact.linkedin')}>${esc(linkedin)}</span>` : '',
        city     ? `<span ${ce('contact.city')}>${esc(city)}</span>`         : '',
    ].filter(Boolean).join('<span class="cv-contact-sep"> · </span>');

    const expHtml = exp.map((e, i) => `
        <div class="exp-item">
            <div class="exp-header">
                <span class="exp-role" ${ce(`experience.${i}.role`)}>${esc(e.role||'')}</span>
                <span class="exp-period" ${ce(`experience.${i}.period`)}>${esc(e.period||'')}</span>
            </div>
            <div class="exp-company" ${ce(`experience.${i}.company`)}>${esc(e.company||'')}</div>
            ${(e.bullets||[]).length > 0 ? `<ul class="exp-bullets">${(e.bullets||[]).map((b,j)=>`<li ${ce(`experience.${i}.bullets.${j}`)}>${esc(b)}</li>`).join('')}</ul>` : ''}
        </div>`).join('');

    const eduHtml = edu.map((e, i) => `
        <div class="exp-item">
            <div class="exp-role" ${ce(`education.${i}.degree`)}>${esc(e.degree||'')}</div>
            <div class="exp-company" ${ce(`education.${i}.institution`)}>${esc(e.institution||'')}</div>
            <div class="exp-period" ${ce(`education.${i}.year`)}>${esc(e.year||'')}</div>
        </div>`).join('');

    const skillsHtml = skills.map((s, i) => `<span class="skill-tag" ${ce(`skills.${i}`)}>${esc(s)}</span>`).join('');
    const langsHtml  = langs.map((l, i) => {
        const parts = typeof l === 'string' ? [l,''] : [l.name||l, l.level||''];
        return `<div class="lang-item"><span>${esc(parts[0])}</span><span>${esc(parts[1])}</span></div>`;
    }).join('');
    const certsHtml  = certs.map((c, i) => `<div class="exp-item"><div class="exp-role" ${ce(`certifications.${i}`)}>${esc(c)}</div></div>`).join('');
    const projHtml   = projects.map((p, i) => {
        const pname = typeof p === 'string' ? p : (p.name||'');
        const pdesc = typeof p === 'object' ? (p.description||'') : '';
        return `<div class="exp-item"><div class="exp-role" ${ce(`projects.${i}.name`)}>${esc(pname)}</div>${pdesc?`<div class="exp-company" ${ce(`projects.${i}.description`)}>${esc(pdesc)}</div>`:''}</div>`;
    }).join('');

    if (style === 'moderno') {
        return `<div class="cv-moderno">
            <div class="cv-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem">
                <div>
                    <div class="cv-name" ${ce('name')}>${esc(name)}</div>
                    ${d.role ? `<div class="cv-role" ${ce('role')}>${esc(d.role)}</div>` : ''}
                    <div class="cv-contacts">${contactSpans}</div>
                </div>
                ${d.photo ? `<div class="cv-photo-wrap"><img src="${d.photo}" alt="foto"></div>` : ''}
            </div>
            <div class="cv-body">
                <div>
                    ${skills.length ? `<div class="cv-section"><div class="cv-section-title">Habilidades</div>${skillsHtml}</div>` : ''}
                    ${langs.length  ? `<div class="cv-section"><div class="cv-section-title">Idiomas</div>${langsHtml}</div>` : ''}
                    ${certs.length  ? `<div class="cv-section"><div class="cv-section-title">Certificados</div>${certsHtml}</div>` : ''}
                </div>
                <div>
                    ${summary ? `<div class="cv-section"><div class="cv-section-title">Sobre</div><p ${ce('summary')}>${esc(summary)}</p></div>` : ''}
                    ${exp.length ? `<div class="cv-section"><div class="cv-section-title">Experiência</div>${expHtml}</div>` : ''}
                    ${edu.length ? `<div class="cv-section"><div class="cv-section-title">Formação</div>${eduHtml}</div>` : ''}
                    ${projects.length ? `<div class="cv-section"><div class="cv-section-title">Projetos</div>${projHtml}</div>` : ''}
                </div>
            </div>
        </div>`;
    }

    if (style === 'minimalista') {
        return `<div class="cv-minimalista">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem">
                <div>
                    <div class="cv-name" ${ce('name')}>${esc(name)}</div>
                    ${d.role ? `<div class="cv-role" ${ce('role')}>${esc(d.role)}</div>` : ''}
                    <div class="cv-contacts">${contactSpans}</div>
                </div>
                ${d.photo ? `<div class="cv-photo-wrap-sq"><img src="${d.photo}" alt="foto"></div>` : ''}
            </div>
            ${summary ? `<div class="cv-section"><div class="cv-section-title">Perfil</div><p ${ce('summary')}>${esc(summary)}</p></div>` : ''}
            ${exp.length ? `<div class="cv-section"><div class="cv-section-title">Experiência</div>${expHtml}</div>` : ''}
            ${edu.length ? `<div class="cv-section"><div class="cv-section-title">Formação</div>${eduHtml}</div>` : ''}
            ${skills.length ? `<div class="cv-section"><div class="cv-section-title">Habilidades</div>${skillsHtml}</div>` : ''}
            ${langs.length  ? `<div class="cv-section"><div class="cv-section-title">Idiomas</div>${langsHtml}</div>` : ''}
            ${certs.length  ? `<div class="cv-section"><div class="cv-section-title">Certificados</div>${certsHtml}</div>` : ''}
            ${projects.length ? `<div class="cv-section"><div class="cv-section-title">Projetos</div>${projHtml}</div>` : ''}
        </div>`;
    }

    // Profissional (default)
    return `<div class="cv-profissional">
        <div class="cv-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem">
            <div>
                <div class="cv-name" ${ce('name')}>${esc(name)}</div>
                ${d.role ? `<div class="cv-role" ${ce('role')}>${esc(d.role)}</div>` : ''}
                <div class="cv-contacts">${contactSpans}</div>
            </div>
            ${d.photo ? `<div class="cv-photo-wrap-sq"><img src="${d.photo}" alt="foto"></div>` : ''}
        </div>
        <div class="cv-body">
            <div>
                ${summary ? `<div class="cv-section"><div class="cv-section-title">Perfil</div><p ${ce('summary')}>${esc(summary)}</p></div>` : ''}
                ${skills.length ? `<div class="cv-section"><div class="cv-section-title">Habilidades</div>${skillsHtml}</div>` : ''}
                ${langs.length  ? `<div class="cv-section"><div class="cv-section-title">Idiomas</div>${langsHtml}</div>` : ''}
                ${certs.length  ? `<div class="cv-section"><div class="cv-section-title">Certificados</div>${certsHtml}</div>` : ''}
            </div>
            <div>
                ${exp.length ? `<div class="cv-section"><div class="cv-section-title">Experiência</div>${expHtml}</div>` : ''}
                ${edu.length ? `<div class="cv-section"><div class="cv-section-title">Formação</div>${eduHtml}</div>` : ''}
                ${projects.length ? `<div class="cv-section"><div class="cv-section-title">Projetos</div>${projHtml}</div>` : ''}
            </div>
        </div>
    </div>`;
}

// ── PDF DOWNLOAD ──────────────────────────────────────
document.getElementById('btn-download-cv').addEventListener('click', async () => {
    if (!cvReady) return;
    const btn = document.getElementById('btn-download-cv');
    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner" style="display:inline-block"></div> Preparando...';

    const name = (cvData.name || 'curriculo').toLowerCase().replace(/\s+/g, '-');

    try {
        const cssResp = await fetch('/style.css');
        const css = await cssResp.text();

        const fullHtml = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8">
<title>${name} — Revitael</title>
<style>
${css}
body { margin: 0; background: #fff; }
@page { size: A4; margin: 8mm; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>${buildCvHtml(cvData, currentStyle)}</body>
</html>`;

        const blob = new Blob([fullHtml], { type: 'text/html' });
        const url  = URL.createObjectURL(blob);
        const win  = window.open(url, '_blank');
        if (win) {
            win.addEventListener('load', () => {
                setTimeout(() => {
                    win.print();
                    win.onafterprint = () => { win.close(); URL.revokeObjectURL(url); };
                    setTimeout(() => URL.revokeObjectURL(url), 30000);
                }, 600);
            });
        } else {
            alert('Popup bloqueado. Permita popups para este site e tente novamente.');
            URL.revokeObjectURL(url);
        }
    } catch(err) {
        alert('Erro ao preparar o PDF. Tente novamente.');
    }

    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Baixar PDF';
});

// ═══════════════════════════════════════════════════
//  ANALYZER
// ═══════════════════════════════════════════════════

// File upload
const uploadZone = document.getElementById('upload-zone');
const fileInput  = document.getElementById('cv-file-input');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
});
fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
});

function handleFile(file) {
    if (file.type !== 'application/pdf') { alert('Por favor, envie um arquivo PDF.'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('Arquivo muito grande. Máximo 10MB.'); return; }
    document.getElementById('upload-filename').textContent = file.name;
    document.getElementById('upload-success').classList.remove('hidden');
    extractPdfText(file);
}

function removeFile() {
    extractedCvText = '';
    document.getElementById('upload-success').classList.add('hidden');
    document.getElementById('cv-file-input').value = '';
}

document.getElementById('btn-remove-file').addEventListener('click', e => {
    e.stopPropagation(); removeFile();
});

async function extractPdfText(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page    = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(s => s.str).join(' ') + '\n';
        }
        extractedCvText = text.trim();
    } catch(e) {
        alert('Não foi possível ler o PDF. Tente outro arquivo.');
        removeFile();
    }
}

// Analyze button
document.getElementById('btn-analyze').addEventListener('click', async () => {
    const jobDesc = document.getElementById('job-description').value.trim();
    if (!extractedCvText) { alert('Por favor, envie seu currículo em PDF.'); return; }
    if (!jobDesc)          { alert('Por favor, cole a descrição da vaga.'); return; }
    if (analyzerBusy) return;

    analyzerBusy = true;
    document.getElementById('btn-analyze-text').textContent = 'Analisando...';
    document.getElementById('btn-spinner').classList.remove('hidden');

    const prompt = `Analise este currículo em relação à vaga abaixo:

CURRÍCULO:
${extractedCvText}

VAGA:
${jobDesc}

Faça a análise completa com score, pontos fortes, gaps, palavras-chave faltando e sugestões. Inclua o bloco ANALYSIS_JSON ao final.`;

    analyzerMsgs = [{ role: 'user', content: prompt }];

    let bubble = null, msgContainer = null, resultsShown = false;

    try {
        const fullText = await streamApi('/api/chat', { messages: analyzerMsgs, mode: 'analyzer' }, (_, full) => {
            if (!resultsShown) {
                resultsShown = true;
                document.getElementById('upload-panel').style.display = 'none';
                document.getElementById('results-panel').classList.remove('hidden');
                const created = createStreamingBubble('analyzer-messages');
                bubble = created.bubble;
                msgContainer = created.container;
            }
            const clean = full.replace(/<!--ANALYSIS_JSON:[\s\S]*?-->/g, '').trim();
            bubble.innerHTML = clean.replace(/\n/g, '<br>') + '<span class="stream-cursor">▋</span>';
            scrollBottom(msgContainer);
        });
        if (bubble) {
            const clean = fullText.replace(/<!--ANALYSIS_JSON:[\s\S]*?-->/g, '').trim();
            bubble.innerHTML = markdownToHtml(clean);
        }
        analyzerMsgs.push({ role: 'assistant', content: fullText });
        parseAnalysisJson(fullText);
    } catch(err) {
        if (resultsShown) {
            document.getElementById('results-panel').classList.add('hidden');
            document.getElementById('upload-panel').style.display = '';
        }
        alert('Erro ao analisar. Verifique sua conexão e tente novamente.');
    }

    analyzerBusy = false;
    document.getElementById('btn-analyze-text').innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg> Analisar agora';
    document.getElementById('btn-spinner').classList.add('hidden');
});

// Analyzer chat (follow-up)
document.getElementById('analyzer-send').addEventListener('click', () => {
    const inp = document.getElementById('analyzer-input');
    const val = inp.value.trim();
    if (!val) return;
    inp.value = '';
    sendAnalyzerMessage(val);
});

document.getElementById('analyzer-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('analyzer-send').click(); }
});
document.getElementById('analyzer-input').addEventListener('input', function() { autoResizeTextarea(this); });

async function sendAnalyzerMessage(text) {
    if (analyzerBusy) return;
    analyzerBusy = true;
    setSendDisabled('analyzer-send', true);
    appendMessage('analyzer-messages', 'user', text);
    analyzerMsgs.push({ role: 'user', content: text });
    const { bubble, container } = createStreamingBubble('analyzer-messages');
    try {
        const fullText = await streamApi('/api/chat', { messages: analyzerMsgs, mode: 'analyzer' }, (_, full) => {
            const clean = full.replace(/<!--ANALYSIS_JSON:[\s\S]*?-->/g, '').trim();
            bubble.innerHTML = clean.replace(/\n/g, '<br>') + '<span class="stream-cursor">▋</span>';
            scrollBottom(container);
        });
        const clean = fullText.replace(/<!--ANALYSIS_JSON:[\s\S]*?-->/g, '').trim();
        bubble.innerHTML = markdownToHtml(clean);
        analyzerMsgs.push({ role: 'assistant', content: fullText });
    } catch(err) {
        bubble.innerHTML = '⚠️ Erro ao conectar. Tente novamente.';
    }
    analyzerBusy = false;
    setSendDisabled('analyzer-send', false);
}

// Parse analysis JSON and update score UI
function parseAnalysisJson(text) {
    let d = null;

    // Tentativa 1: tag correta <!--ANALYSIS_JSON:...-->
    const tagMatch = text.match(/<!--ANALYSIS_JSON:([\s\S]*?)-->/);
    if (tagMatch) {
        try { d = JSON.parse(tagMatch[1]); } catch(e) {}
    }

    // Tentativa 2: JSON solto com campo "score" (objeto balanceado)
    if (!d) {
        const raw = extractBalancedJson(text, 'score');
        if (raw) { try { d = JSON.parse(raw); } catch(e) {} }
    }

    // Tentativa 3: extrai só o score do texto "Score: 80/100"
    if (!d) {
        const m = text.match(/\bscore[:\s]+(\d+)/i);
        if (m) d = { score: parseInt(m[1]), scoreBreakdown: {} };
    }

    if (!d) return;

    const score = Math.min(100, Math.max(0, d.score || 0));
    animateScore(score, d.scoreBreakdown || {});
    const jobDesc = document.getElementById('job-description').value.trim();
    saveAnalysisHistory(score, jobDesc, d.scoreBreakdown || {});
    renderAnalysisHistory();

    // Mostra botão de melhoria
    document.getElementById('improve-cv-bar').classList.remove('hidden');
}

function animateScore(target, breakdown) {
    const display = document.getElementById('score-display');
    const circle  = document.getElementById('score-circle-fill');
    const circumference = 327;
    let current = 0;

    const interval = setInterval(() => {
        current = Math.min(current + 2, target);
        display.textContent = current;
        const offset = circumference - (current / 100) * circumference;
        circle.style.strokeDashoffset = offset;
        circle.style.stroke = current >= 70 ? '#10B981' : current >= 50 ? '#F59E0B' : '#EF4444';
        if (current >= target) clearInterval(interval);
    }, 20);

    // Breakdown bars
    const bd = breakdown;
    animateBar('bar-keywords',   bd.keywords   || 0, 40, 'val-keywords');
    animateBar('bar-structure',  bd.structure  || 0, 20, 'val-structure');
    animateBar('bar-experience', bd.experience || 0, 25, 'val-experience');
    animateBar('bar-education',  bd.education  || 0, 15, 'val-education');
    updateShareCard(target, bd);
}

function animateBar(barId, value, max, valId) {
    const bar = document.getElementById(barId);
    const val = document.getElementById(valId);
    setTimeout(() => {
        bar.style.width = `${(value / max) * 100}%`;
        if (val) val.textContent = `${value}/${max}`;
    }, 300);
}

// ═══════════════════════════════════════════════════
//  SHARED UTILS
// ═══════════════════════════════════════════════════

// ── TOP PROGRESS BAR ──────────────────────────────────
function showTopBar() {
    const b = document.getElementById('top-bar');
    b.style.transition = 'none';
    b.style.width = '0%';
    b.style.opacity = '1';
    requestAnimationFrame(() => {
        b.style.transition = 'width 90s linear';
        b.style.width = '85%';
    });
}
function hideTopBar() {
    const b = document.getElementById('top-bar');
    b.style.transition = 'width .25s ease';
    b.style.width = '100%';
    setTimeout(() => {
        b.style.transition = 'opacity .3s ease';
        b.style.opacity = '0';
        setTimeout(() => { b.style.width = '0%'; b.style.transition = 'none'; }, 350);
    }, 280);
}

// ── SSE STREAM READER (usado pelo callApi e streamApi) ─
async function readSseStream(res, onDelta) {
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '', buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;
            try {
                const { delta } = JSON.parse(raw);
                if (delta) { fullText += delta; if (onDelta) onDelta(delta, fullText); }
            } catch(e) {}
        }
    }
    return fullText;
}

// API call (one-shot — bullet improver, ATS, PT→EN)
async function callApi(path, body) {
    showTopBar();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    let res;
    try {
        res = await fetch(API_BASE + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
        });
    } catch (e) {
        clearTimeout(timeout);
        hideTopBar();
        throw new Error('Aguarde, estamos gerando a próxima pergunta... Tente novamente em instantes.');
    }
    clearTimeout(timeout);
    hideTopBar();
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    // Backend agora retorna SSE — lê tudo e devolve como { content }
    const content = await readSseStream(res);
    return { content };
}

// API call com streaming — exibe tokens conforme chegam
async function streamApi(path, body, onChunk) {
    showTopBar();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    let res;
    try {
        res = await fetch(API_BASE + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
        });
    } catch(e) {
        clearTimeout(timeout);
        hideTopBar();
        throw new Error('Servidor ainda iniciando. Tente novamente em instantes.');
    }
    clearTimeout(timeout);
    if (!res.ok) {
        hideTopBar();
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    let firstChunk = true;
    const fullText = await readSseStream(res, (delta, full) => {
        if (firstChunk) { hideTopBar(); firstChunk = false; }
        onChunk(delta, full);
    });
    if (firstChunk) hideTopBar(); // resposta vazia
    return fullText;
}

// Cria bolha de mensagem que recebe texto gradualmente
function createStreamingBubble(containerId) {
    const container = document.getElementById(containerId);
    const div    = document.createElement('div');
    div.className = 'msg ai';
    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = 'R';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.innerHTML = '<div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>';
    div.appendChild(avatar);
    div.appendChild(bubble);
    container.appendChild(div);
    scrollBottom(container);
    return { bubble, container };
}

// Append message bubble
function appendMessage(containerId, role, text) {
    const container = document.getElementById(containerId);
    const isAi  = role === 'ai';
    const div   = document.createElement('div');
    div.className = `msg ${isAi ? 'ai' : 'user'}`;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = isAi ? 'R' : '👤';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    // Clean out CV_JSON tags before displaying
    const clean = text
        .replace(/<!--CV_JSON:[\s\S]*?-->/g, '')
        .replace(/<!--ANALYSIS_JSON:[\s\S]*?-->/g, '')
        .trim();

    bubble.innerHTML = markdownToHtml(clean);

    div.appendChild(avatar);
    div.appendChild(bubble);

    if (isAi) {
        // Typing animation
        bubble.style.opacity = '0';
        container.appendChild(div);
        scrollBottom(container);
        setTimeout(() => { bubble.style.opacity = '1'; bubble.style.transition = 'opacity .3s'; }, 50);
    } else {
        container.appendChild(div);
        scrollBottom(container);
    }
}

// Typing indicator
function showTyping(containerId) {
    const container = document.getElementById(containerId);
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.className = 'msg ai';
    div.id = id;
    div.innerHTML = `<div class="msg-avatar">R</div>
        <div class="msg-bubble">
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        </div>`;
    container.appendChild(div);
    scrollBottom(container);
    return id;
}

function removeTyping(containerId, id) {
    document.getElementById(id)?.remove();
}

function scrollBottom(el) {
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
}

function setSendDisabled(btnId, disabled) {
    const btn = document.getElementById(btnId);
    if (btn) btn.disabled = disabled;
}

function autoResizeTextarea(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ── BULLET IMPROVER ──────────────────────────────────
document.querySelectorAll('.bullet-example-tag').forEach(tag => {
    tag.addEventListener('click', () => {
        document.getElementById('bullet-input').value = tag.dataset.text;
    });
});

document.getElementById('btn-bullet-improve').addEventListener('click', async () => {
    const input = document.getElementById('bullet-input');
    const text = input.value.trim();
    if (!text) { input.focus(); return; }

    const btn = document.getElementById('btn-bullet-improve');
    const btnText = document.getElementById('bullet-btn-text');
    const spinner = document.getElementById('bullet-spinner');
    const result = document.getElementById('bullet-result');
    const resultText = document.getElementById('bullet-result-text');

    btn.disabled = true;
    btnText.textContent = 'Melhorando...';
    spinner.classList.remove('hidden');
    result.classList.add('hidden');

    try {
        const prompt = `Você é um especialista em currículos. Reescreva este trecho como um bullet profissional de currículo: use linguagem de impacto, voz ativa, e inclua métricas/números quando possível. Retorne APENAS o bullet reescrito, sem explicações ou marcadores. Trecho: "${text}"`;
        const res = await callApi('/api/chat', {
            messages: [{ role: 'user', content: prompt }],
            mode: 'creator'
        });
        const clean = res.content.replace(/^[-•·]\s*/, '').trim();
        resultText.textContent = clean;
        result.classList.remove('hidden');
    } catch(err) {
        resultText.textContent = 'Erro ao conectar. Verifique se o backend está no ar e tente novamente.';
        result.classList.remove('hidden');
    }

    btn.disabled = false;
    btnText.textContent = 'Melhorar com IA';
    spinner.classList.add('hidden');
});

document.getElementById('btn-copy-bullet').addEventListener('click', () => {
    const text = document.getElementById('bullet-result-text').textContent;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('btn-copy-bullet');
        btn.textContent = 'Copiado!';
        setTimeout(() => {
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copiar';
        }, 2000);
    });
});

// ── FAQ ───────────────────────────────────────────────
document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach(el => el.classList.remove('open'));
        if (!isOpen) item.classList.add('open');
    });
});

// ── SHARE SCORE ───────────────────────────────────────
let lastScoreData = null;

document.getElementById('btn-share-score').addEventListener('click', () => {
    openShareModal();
});
document.getElementById('share-modal-overlay').addEventListener('click', closeShareModal);
document.getElementById('share-modal-close').addEventListener('click', closeShareModal);

document.getElementById('btn-copy-share').addEventListener('click', () => {
    if (!lastScoreData) return;
    const { score, breakdown } = lastScoreData;
    const text = `Acabei de analisar meu currículo com o Revitael e tirei ${score}/100 de compatibilidade com a vaga!\n\nDetalhes:\n• Palavras-chave: ${breakdown.keywords||0}/40\n• Experiência: ${breakdown.experience||0}/25\n• Estrutura: ${breakdown.structure||0}/20\n• Formação: ${breakdown.education||0}/15\n\nAnalise o seu também em revitael.web.app`;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('btn-copy-share');
        btn.textContent = 'Copiado!';
        setTimeout(() => {
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copiar texto';
        }, 2000);
    });
});

document.getElementById('btn-download-share').addEventListener('click', async () => {
    const card = document.getElementById('share-card');
    try {
        const canvas = await html2canvas(card, { scale: 2, backgroundColor: null, useCORS: true });
        const link = document.createElement('a');
        link.download = 'revitael-score.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch(e) {
        alert('Não foi possível gerar a imagem. Tente fazer uma captura de tela.');
    }
});

function openShareModal() {
    document.getElementById('share-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeShareModal() {
    document.getElementById('share-modal').classList.add('hidden');
    document.body.style.overflow = '';
}

function updateShareCard(score, breakdown) {
    lastScoreData = { score, breakdown };
    document.getElementById('share-card-score').textContent = score;
    const color = score >= 70 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444';
    document.getElementById('share-card-score').style.color = color;

    const bars = [
        { label: 'Palavras-chave', val: breakdown.keywords || 0, max: 40 },
        { label: 'Experiência',    val: breakdown.experience || 0, max: 25 },
        { label: 'Estrutura',      val: breakdown.structure || 0, max: 20 },
        { label: 'Formação',       val: breakdown.education || 0, max: 15 },
    ];
    document.getElementById('share-card-bars').innerHTML = bars.map(b => `
        <div class="share-card-bar-wrap">
            <div class="share-card-bar-label">${b.label}</div>
            <div class="share-card-bar-track">
                <div class="share-card-bar-fill" style="width:${Math.round((b.val/b.max)*100)}%"></div>
            </div>
        </div>`).join('');

    document.getElementById('share-bar').classList.remove('hidden');
}

// ── COUNTER ANIMATION ────────────────────────────────
(function() {
    const counterEl = document.getElementById('cv-counter');
    if (!counterEl) return;
    let fired = false;
    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting && !fired) {
                fired = true;
                const target = 1247;
                const duration = 2000;
                const start = performance.now();
                function step(now) {
                    const progress = Math.min((now - start) / duration, 1);
                    const eased = 1 - Math.pow(1 - progress, 3);
                    counterEl.textContent = Math.floor(eased * target).toLocaleString('pt-BR');
                    if (progress < 1) requestAnimationFrame(step);
                }
                requestAnimationFrame(step);
                obs.unobserve(e.target);
            }
        });
    }, { threshold: 0.5 });
    obs.observe(counterEl);
})();

// ── PROGRESS BAR ─────────────────────────────────────
const PROGRESS_KEYWORDS = [
    ['nome', 'chamo', 'meu nome'],
    ['email', 'telefone', 'contato', 'linkedin', 'cidade', 'whatsapp'],
    ['objetivo', 'resumo profissional', 'sobre você', 'perfil profissional'],
    ['experiência', 'empresa', 'cargo', 'trabalhou', 'trabalha', 'emprego'],
    ['formação', 'faculdade', 'curso', 'graduação', 'universidade'],
    ['habilidade', 'skill', 'tecnologia', 'ferramenta', 'conhecimento'],
    ['idioma', 'inglês', 'espanhol', 'francês', 'língua'],
    ['certificado', 'curso extra', 'projeto', 'portfólio'],
];

const CV_DATA_KEYS = ['name', 'contact', 'summary', 'experience', 'education', 'skills', 'languages', 'certifications'];

function updateProgress() {
    const allText = creatorMsgs.map(m => m.content.toLowerCase()).join(' ');
    let completed = 0;
    PROGRESS_KEYWORDS.forEach((keywords, i) => {
        const key = CV_DATA_KEYS[i];
        const inData = checkCvDataSection(key);
        const inMessages = keywords.some(kw => allText.includes(kw));
        if (inData || inMessages) completed++;
    });
    const pct = Math.round((completed / 8) * 100);
    const fill = document.getElementById('chat-progress-fill');
    const label = document.getElementById('chat-progress-label');
    if (fill) fill.style.width = pct + '%';
    if (label) label.textContent = `${completed} / 8 seções`;
}

function resetProgress() {
    const fill = document.getElementById('chat-progress-fill');
    const label = document.getElementById('chat-progress-label');
    if (fill) fill.style.width = '0%';
    if (label) label.textContent = '0 / 8 seções';
}

function checkCvDataSection(key) {
    const val = cvData[key];
    if (!val) return false;
    if (typeof val === 'string') return val.length > 0;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object') return Object.values(val).some(v => v && String(v).length > 0);
    return false;
}

// ── LOCALSTORAGE ──────────────────────────────────────
const STORAGE_KEY = 'revitael-saved-cv';

function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            cvData, creatorMsgs, currentStyle, savedAt: Date.now()
        }));
    } catch(e) { /* quota exceeded, ignore */ }
}

function clearStorage() {
    localStorage.removeItem(STORAGE_KEY);
}

function checkSavedCv() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        const hasMessages = Array.isArray(saved?.creatorMsgs) && saved.creatorMsgs.length > 2;
        if (!hasMessages) return;

        const diff = Date.now() - saved.savedAt;
        const days  = Math.floor(diff / 86400000);
        const hours = Math.floor(diff / 3600000);
        let when = days > 0 ? `${days} dia${days > 1 ? 's' : ''} atrás`
                 : hours > 0 ? `${hours}h atrás`
                 : 'recentemente';

        const label = saved?.cvData?.name
            ? `CV de ${saved.cvData.name} · salvo ${when}`
            : `Conversa em andamento · ${Math.floor(saved.creatorMsgs.length / 2)} perguntas respondidas · salvo ${when}`;
        document.getElementById('saved-cv-sub').textContent = label;
        document.getElementById('saved-cv-banner').classList.remove('hidden');

        document.getElementById('btn-saved-continue').onclick = () => {
            restoreFromStorage(saved);
            document.getElementById('saved-cv-banner').classList.add('hidden');
        };
        document.getElementById('btn-saved-discard').onclick = () => {
            clearStorage();
            document.getElementById('saved-cv-banner').classList.add('hidden');
        };
    } catch(e) { /* corrupt data, ignore */ }
}

function restoreFromStorage(saved) {
    cvData = saved.cvData || {};
    creatorMsgs = saved.creatorMsgs || [];
    currentStyle = saved.currentStyle || 'profissional';

    document.querySelectorAll('.style-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.style === currentStyle));

    const container = document.getElementById('creator-messages');
    container.innerHTML = '';
    creatorMsgs.forEach(msg => {
        appendMessage('creator-messages', msg.role === 'assistant' ? 'ai' : 'user', msg.content);
    });

    cvReady = true;
    document.getElementById('btn-download-cv').disabled = false;
    document.getElementById('btn-copy-cv').classList.remove('hidden');
    document.getElementById('btn-translate-cv').classList.remove('hidden');
    document.getElementById('btn-photo-label').classList.remove('hidden');
    document.getElementById('btn-share-link').classList.remove('hidden');
    document.getElementById('ats-panel').classList.remove('hidden');
    document.getElementById('edit-hint').classList.remove('hidden');
    renderCvPreview();
    updateProgress();
}

// ══════════════════════════════════════════════════════
//  MELHORAR CV COM BASE NA ANÁLISE
// ══════════════════════════════════════════════════════
document.getElementById('btn-improve-cv').addEventListener('click', () => {
    // Captura resumo da análise para contexto invisível ao usuário
    const analysisMsg = analyzerMsgs.find(m => m.role === 'assistant');
    const analysisSummary = analysisMsg
        ? analysisMsg.content.replace(/<!--ANALYSIS_JSON:[\s\S]*?-->/g, '').slice(0, 800)
        : '';

    // Limpa estado do criador
    creatorMsgs = [];
    cvData = {};
    cvReady = false;
    clearStorage();

    // Troca para modo criador
    currentMode = 'creator';
    document.getElementById('analyzer-mode').classList.add('hidden');
    document.getElementById('creator-mode').classList.remove('hidden');
    document.getElementById('creator-messages').innerHTML = '';
    ['btn-copy-cv','btn-translate-cv','btn-photo-label','btn-share-link','ats-panel','edit-hint','saved-cv-banner'].forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
    });
    document.getElementById('btn-download-cv').disabled = true;
    resetProgress();
    showPreviewEmpty();
    setMobilePanel('chat');

    // Injeta contexto da análise de forma silenciosa (não aparece no chat)
    if (analysisSummary) {
        creatorMsgs.push({
            role: 'user',
            content: `[CONTEXTO INTERNO: O usuário acabou de analisar um currículo. Feedback recebido:\n${analysisSummary}\nAgora quer criar um currículo novo e melhorado com base nessas informações.]`
        });
        const contextReply = `Vi sua análise! Vou te ajudar a criar um currículo melhorado, focando nos pontos levantados. Para começar: **qual é o seu nome completo e em qual área você atua?**`;
        creatorMsgs.push({ role: 'assistant', content: contextReply });
        appendMessage('creator-messages', 'ai', contextReply);
    } else {
        startCreatorChat();
    }
});

// ══════════════════════════════════════════════════════
//  WARMUP BANNER — fechar manualmente
// ══════════════════════════════════════════════════════
document.getElementById('warmup-close').addEventListener('click', () => {
    document.getElementById('warmup-banner').classList.add('hidden');
});

// ══════════════════════════════════════════════════════
//  MOBILE TABS — toggle Chat / Preview
// ══════════════════════════════════════════════════════
function setMobilePanel(which) {
    const chat    = document.querySelector('#creator-mode .chat-panel');
    const preview = document.querySelector('#creator-mode .preview-panel');
    const tabChat    = document.getElementById('tab-chat');
    const tabPreview = document.getElementById('tab-preview');
    if (!chat || !preview) return;
    if (which === 'chat') {
        chat.classList.add('show-panel');
        preview.classList.remove('show-panel');
        tabChat.classList.add('active');
        tabPreview.classList.remove('active');
    } else {
        preview.classList.add('show-panel');
        chat.classList.remove('show-panel');
        tabPreview.classList.add('active');
        tabChat.classList.remove('active');
    }
}
document.getElementById('tab-chat').addEventListener('click', () => setMobilePanel('chat'));
document.getElementById('tab-preview').addEventListener('click', () => setMobilePanel('preview'));

// Ao receber CV pronto no mobile, troca para preview automaticamente
function switchToPreviewOnMobile() {
    if (window.innerWidth <= 768) setMobilePanel('preview');
}

// ══════════════════════════════════════════════════════
//  FOTO NO CV
// ══════════════════════════════════════════════════════
document.getElementById('photo-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { alert('Foto muito grande. Use uma imagem de até 3MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
        cvData.photo = reader.result;
        renderCvPreview();
        saveToStorage();
    };
    reader.readAsDataURL(file);
});

// ══════════════════════════════════════════════════════
//  COMPARTILHAR CV COMO LINK
// ══════════════════════════════════════════════════════
function encodeCv(data) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}
function decodeCv(b64) {
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
}

document.getElementById('btn-share-link').addEventListener('click', () => {
    const b64  = encodeCv(cvData);
    const url  = `${location.origin}${location.pathname}#share=${b64}`;
    document.getElementById('sharelink-url').value = url;
    document.getElementById('sharelink-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
});
document.getElementById('sharelink-overlay').addEventListener('click', closeSharelinkModal);
document.getElementById('sharelink-close').addEventListener('click', closeSharelinkModal);
function closeSharelinkModal() {
    document.getElementById('sharelink-modal').classList.add('hidden');
    document.body.style.overflow = '';
}
document.getElementById('btn-copy-sharelink').addEventListener('click', () => {
    const input = document.getElementById('sharelink-url');
    input.select();
    navigator.clipboard.writeText(input.value).then(() => {
        const btn = document.getElementById('btn-copy-sharelink');
        btn.textContent = 'Copiado!';
        setTimeout(() => { btn.textContent = 'Copiar'; }, 2500);
    });
});

// ── Verificar link compartilhado ao carregar ──────────
(function checkSharedCv() {
    const hash = window.location.hash;
    if (!hash.startsWith('#share=')) return;
    try {
        const data  = decodeCv(hash.slice(7));
        const style = data.style || 'profissional';
        const html  = buildCvHtml(data, style);
        document.getElementById('cv-viewer-body').innerHTML =
            `<div class="cv-preview-wrap">${html}</div>`;
        document.getElementById('cv-viewer').classList.remove('hidden');

        document.getElementById('btn-viewer-download').addEventListener('click', async () => {
            const btn = document.getElementById('btn-viewer-download');
            btn.disabled = true;
            btn.innerHTML = '<div class="btn-spinner" style="display:inline-block;width:14px;height:14px;border-width:2px"></div> Preparando...';
            try {
                const cssResp = await fetch('/style.css');
                const css = await cssResp.text();
                const name = (data.name||'curriculo').toLowerCase().replace(/\s+/g,'-');
                const fullHtml = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${name}</title><style>${css} body{margin:0;background:#fff;} @page{size:A4;margin:8mm;} @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style></head><body>${buildCvHtml(data, style)}</body></html>`;
                const blob = new Blob([fullHtml], { type: 'text/html' });
                const url  = URL.createObjectURL(blob);
                const win  = window.open(url, '_blank');
                if (win) {
                    win.addEventListener('load', () => { setTimeout(() => { win.print(); win.onafterprint = () => { win.close(); URL.revokeObjectURL(url); }; }, 600); });
                }
            } catch(e) { alert('Erro ao gerar PDF.'); }
            btn.disabled = false;
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Baixar PDF';
        });
    } catch(e) { /* link inválido, ignora */ }
})();

// ══════════════════════════════════════════════════════
//  1. EDIÇÃO DIRETA DO PREVIEW
// ══════════════════════════════════════════════════════

// Salva o campo editado no cvData quando o usuário sai do elemento
document.getElementById('preview-body').addEventListener('blur', e => {
    const el = e.target.closest('[data-cv-field]');
    if (!el || !cvReady) return;
    setCvField(el.dataset.cvField, el.innerText.trim());
    saveToStorage();
}, true);

// Enter confirma a edição (sem quebrar linha)
document.getElementById('preview-body').addEventListener('keydown', e => {
    if (e.target.hasAttribute('data-cv-field') && e.key === 'Enter') {
        e.preventDefault();
        e.target.blur();
    }
}, true);

function setCvField(path, val) {
    const parts = path.split('.');
    let cur = cvData;
    for (let i = 0; i < parts.length - 1; i++) {
        const k = isNaN(parts[i]) ? parts[i] : +parts[i];
        if (cur[k] == null) return;
        cur = cur[k];
    }
    const last = parts[parts.length - 1];
    cur[isNaN(last) ? last : +last] = val;
}

// ══════════════════════════════════════════════════════
//  2. COPIAR CV COMO TEXTO
// ══════════════════════════════════════════════════════

document.getElementById('btn-copy-cv').addEventListener('click', () => {
    const text = cvDataToText(cvData);
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('btn-copy-cv');
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><polyline points="20 6 9 17 4 12"/></svg> Copiado!';
        setTimeout(() => {
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg> Copiar texto';
        }, 2500);
    });
});

function cvDataToText(d) {
    const lines = [];
    if (d.name) lines.push(d.name.toUpperCase());
    const c = d.contact || {};
    const cp = [c.email, c.phone, c.city, c.linkedin].filter(Boolean);
    if (cp.length) lines.push(cp.join(' | '));
    if (d.summary) { lines.push('', 'PERFIL PROFISSIONAL', d.summary); }
    if (d.experience?.length) {
        lines.push('', 'EXPERIÊNCIA PROFISSIONAL');
        d.experience.forEach(e => {
            lines.push(`${e.role||''} — ${e.company||''} (${e.period||''})`);
            (e.bullets||[]).forEach(b => lines.push(`  • ${b}`));
        });
    }
    if (d.education?.length) {
        lines.push('', 'FORMAÇÃO ACADÊMICA');
        d.education.forEach(e => lines.push(`${e.degree||''} — ${e.institution||''} (${e.year||''})`));
    }
    if (d.skills?.length)        { lines.push('', 'HABILIDADES', d.skills.join(', ')); }
    if (d.languages?.length) {
        lines.push('', 'IDIOMAS');
        d.languages.forEach(l => {
            const n = typeof l === 'string' ? l : (l.name||'');
            const lv = typeof l === 'object' ? (l.level||'') : '';
            lines.push(lv ? `${n} — ${lv}` : n);
        });
    }
    if (d.certifications?.length) { lines.push('', 'CERTIFICADOS'); d.certifications.forEach(c => lines.push(`  • ${c}`)); }
    if (d.projects?.length) {
        lines.push('', 'PROJETOS');
        d.projects.forEach(p => {
            const n = typeof p === 'string' ? p : (p.name||'');
            const desc = typeof p === 'object' ? (p.description||'') : '';
            lines.push(desc ? `${n} — ${desc}` : n);
        });
    }
    return lines.join('\n');
}

// ══════════════════════════════════════════════════════
//  3. TRADUZIR PARA INGLÊS
// ══════════════════════════════════════════════════════

document.getElementById('btn-translate-cv').addEventListener('click', async () => {
    if (!cvReady) return;
    const btn = document.getElementById('btn-translate-cv');
    btn.disabled = true;
    btn.innerHTML = '<div class="btn-spinner" style="display:inline-block;width:12px;height:12px;border-width:1.5px"></div> Traduzindo...';

    const prompt = `Translate this CV JSON to professional English. Keep all fields and structure. Return ONLY the <!--CV_JSON:--> tag on a single line with the translated data, exactly like:
<!--CV_JSON:{"name":"...","contact":{...},...}-->

Original CV:
${JSON.stringify(cvData)}`;

    try {
        const res = await callApi('/api/chat', { messages: [{ role: 'user', content: prompt }], mode: 'creator' });
        const match = res.content.match(/<!--CV_JSON:([\s\S]*?)-->/);
        if (!match) throw new Error('Formato inválido');
        const translated = JSON.parse(match[1]);
        cvData = { ...cvData, ...translated };
        renderCvPreview();
        saveToStorage();
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><polyline points="20 6 9 17 4 12"/></svg> Traduzido!';
        setTimeout(() => {
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> PT→EN';
            btn.disabled = false;
        }, 3000);
    } catch(err) {
        btn.disabled = false;
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> PT→EN';
        alert('Erro ao traduzir. Tente novamente.');
    }
});

// ══════════════════════════════════════════════════════
//  4. OTIMIZAÇÃO ATS
// ══════════════════════════════════════════════════════

document.getElementById('ats-toggle').addEventListener('click', () => {
    const body    = document.getElementById('ats-body');
    const chevron = document.getElementById('ats-chevron');
    const isOpen  = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    chevron.classList.toggle('open', !isOpen);
});

document.getElementById('btn-ats-analyze').addEventListener('click', async () => {
    const jobDesc = document.getElementById('ats-job-input').value.trim();
    if (!jobDesc) { document.getElementById('ats-job-input').focus(); return; }

    const btn     = document.getElementById('btn-ats-analyze');
    const btnText = document.getElementById('btn-ats-text');
    const spinner = document.getElementById('btn-ats-spinner');
    const result  = document.getElementById('ats-result');
    btn.disabled = true;
    btnText.textContent = 'Analisando...';
    spinner.classList.remove('hidden');
    result.classList.add('hidden');

    const prompt = `Você é especialista em ATS. Analise o CV abaixo versus a vaga e retorne SOMENTE um JSON válido (sem markdown, sem texto extra):
{"score":75,"present":["React","SQL"],"missing":["Docker","AWS"],"suggestions":["Adicione experiência com X","Mencione projetos em Y"]}

CV: ${JSON.stringify(cvData)}

VAGA: ${jobDesc}`;

    try {
        const res = await callApi('/api/chat', { messages: [{ role: 'user', content: prompt }], mode: 'creator' });
        const jsonMatch = res.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('inválido');
        const data = JSON.parse(jsonMatch[0]);

        const scoreEl = document.getElementById('ats-score-val');
        scoreEl.textContent = `${data.score || 0}%`;
        scoreEl.style.color = (data.score||0) >= 70 ? '#10B981' : (data.score||0) >= 50 ? '#F59E0B' : '#EF4444';
        document.getElementById('ats-present').innerHTML    = (data.present||[]).map(k => `<span class="ats-kw-tag present">${esc(k)}</span>`).join('');
        document.getElementById('ats-missing').innerHTML    = (data.missing||[]).map(k => `<span class="ats-kw-tag missing">${esc(k)}</span>`).join('');
        document.getElementById('ats-suggestions').innerHTML = (data.suggestions||[]).map(s => `<div class="ats-suggestion-item">${esc(s)}</div>`).join('');
        result.classList.remove('hidden');
    } catch(err) {
        document.getElementById('ats-missing').innerHTML = '<span class="ats-kw-tag missing">Erro ao analisar. Tente novamente.</span>';
        document.getElementById('ats-present').innerHTML = '';
        document.getElementById('ats-suggestions').innerHTML = '';
        result.classList.remove('hidden');
    }

    btn.disabled = false;
    btnText.textContent = 'Analisar compatibilidade ATS';
    spinner.classList.add('hidden');
});

// ══════════════════════════════════════════════════════
//  5. HISTÓRICO DE ANÁLISES
// ══════════════════════════════════════════════════════

const HISTORY_KEY = 'revitael-analysis-history';

function saveAnalysisHistory(score, jobDesc, breakdown) {
    try {
        const history = getAnalysisHistory();
        const jobTitle = (jobDesc.split('\n')[0] || 'Vaga').trim().substring(0, 60);
        history.unshift({ score, jobTitle, savedAt: Date.now(), breakdown });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 3)));
    } catch(e) {}
}

function getAnalysisHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch(e) { return []; }
}

function renderAnalysisHistory() {
    const history = getAnalysisHistory();
    const section = document.getElementById('analysis-history');
    const list    = document.getElementById('history-list');
    if (!history.length) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    list.innerHTML = history.map((item, idx) => {
        const color = item.score >= 70 ? '#10B981' : item.score >= 50 ? '#F59E0B' : '#EF4444';
        const diff  = Date.now() - item.savedAt;
        const days  = Math.floor(diff / 86400000);
        const hours = Math.floor(diff / 3600000);
        const when  = days > 0 ? `${days}d atrás` : hours > 0 ? `${hours}h atrás` : 'hoje';
        return `<div class="history-card" data-idx="${idx}">
            <div class="history-score-badge" style="border-color:${color};color:${color}">${item.score}</div>
            <div class="history-info">
                <div class="history-job">${esc(item.jobTitle)}</div>
                <div class="history-date">${when}</div>
            </div>
            <svg class="history-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><polyline points="9 18 15 12 9 6"/></svg>
        </div>`;
    }).join('');
    list.querySelectorAll('.history-card').forEach(card => {
        card.addEventListener('click', () => {
            const item = history[+card.dataset.idx];
            document.getElementById('upload-panel').style.display = 'none';
            document.getElementById('results-panel').classList.remove('hidden');
            animateScore(item.score, item.breakdown || {});
        });
    });
}

// Minimal markdown → HTML
function markdownToHtml(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/^### (.+)$/gm, '<h4 style="margin:.5rem 0 .25rem;font-size:.875rem">$1</h4>')
        .replace(/^## (.+)$/gm, '<h3 style="margin:.5rem 0 .25rem">$1</h3>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
        .replace(/\n{2,}/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^(.)/,'<p>$1')
        .replace(/(.)$/,'$1</p>');
}
