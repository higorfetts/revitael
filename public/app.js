// ═══════════════════════════════════════════════════
//  REVITAEL — app.js
// ═══════════════════════════════════════════════════

const API_BASE = 'https://us-central1-revitael.cloudfunctions.net';

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

    if (mode === 'creator' && creatorMsgs.length === 0) startCreatorChat();
}

// ── RESET ─────────────────────────────────────────────
document.getElementById('btn-reset-creator').addEventListener('click', () => {
    if (!confirm('Recomeçar a conversa? O progresso será perdido.')) return;
    creatorMsgs = [];
    cvData = {};
    cvReady = false;
    document.getElementById('creator-messages').innerHTML = '';
    document.getElementById('btn-download-cv').disabled = true;
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

    const typingId = showTyping('creator-messages');

    try {
        const res = await callApi('/api/chat', { messages: creatorMsgs, mode: 'creator' });
        removeTyping('creator-messages', typingId);
        appendMessage('creator-messages', 'ai', res.content);
        creatorMsgs.push({ role: 'assistant', content: res.content });
        parseCvJson(res.content);
    } catch (err) {
        removeTyping('creator-messages', typingId);
        appendMessage('creator-messages', 'ai', '⚠️ Erro ao conectar. Verifique sua conexão e tente novamente.');
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
    const match = text.match(/<!--CV_JSON:([\s\S]*?)-->/);
    if (!match) return;
    try {
        const data = JSON.parse(match[1]);
        cvData = { ...cvData, ...data };
        if (data.style) {
            currentStyle = data.style;
            document.querySelectorAll('.style-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.style === data.style));
        }
        renderCvPreview();
        cvReady = true;
        document.getElementById('btn-download-cv').disabled = false;
    } catch(e) { /* invalid JSON, ignore */ }
}

// ── CV PREVIEW RENDER ─────────────────────────────────
function showPreviewEmpty() {
    document.getElementById('preview-body').innerHTML = `
        <div class="preview-empty">
            <div class="preview-empty-icon">📄</div>
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

    const contactLine = [email, phone, linkedin, city].filter(Boolean).join(' · ');

    const expHtml = exp.map(e => `
        <div class="exp-item">
            <div class="exp-header">
                <span class="exp-role">${e.role||''}</span>
                <span class="exp-period">${e.period||''}</span>
            </div>
            <div class="exp-company">${e.company||''}</div>
            ${(e.bullets||[]).length > 0 ? `<ul class="exp-bullets">${e.bullets.map(b=>`<li>${b}</li>`).join('')}</ul>` : ''}
        </div>`).join('');

    const eduHtml = edu.map(e => `
        <div class="exp-item">
            <div class="exp-role">${e.degree||''}</div>
            <div class="exp-company">${e.institution||''}</div>
            <div class="exp-period">${e.year||''}</div>
        </div>`).join('');

    const skillsHtml = skills.map(s => `<span class="skill-tag">${s}</span>`).join('');
    const langsHtml  = langs.map(l => {
        const parts = typeof l === 'string' ? [l,''] : [l.name||l, l.level||''];
        return `<div class="lang-item"><span>${parts[0]}</span><span>${parts[1]}</span></div>`;
    }).join('');
    const certsHtml  = certs.map(c => `<div class="exp-item"><div class="exp-role">${c}</div></div>`).join('');
    const projHtml   = projects.map(p => {
        const pname = typeof p === 'string' ? p : (p.name||'');
        const pdesc = typeof p === 'object' ? (p.description||'') : '';
        return `<div class="exp-item"><div class="exp-role">${pname}</div>${pdesc?`<div class="exp-company">${pdesc}</div>`:''}</div>`;
    }).join('');

    if (style === 'moderno') {
        return `<div class="cv-moderno">
            <div class="cv-header">
                <div class="cv-name">${name}</div>
                ${d.role ? `<div class="cv-role">${d.role}</div>` : ''}
                <div class="cv-contacts">${contactLine}</div>
            </div>
            <div class="cv-body">
                <div>
                    ${skills.length ? `<div class="cv-section"><div class="cv-section-title">Habilidades</div>${skillsHtml}</div>` : ''}
                    ${langs.length  ? `<div class="cv-section"><div class="cv-section-title">Idiomas</div>${langsHtml}</div>` : ''}
                    ${certs.length  ? `<div class="cv-section"><div class="cv-section-title">Certificados</div>${certsHtml}</div>` : ''}
                </div>
                <div>
                    ${summary ? `<div class="cv-section"><div class="cv-section-title">Sobre</div><p>${summary}</p></div>` : ''}
                    ${exp.length ? `<div class="cv-section"><div class="cv-section-title">Experiência</div>${expHtml}</div>` : ''}
                    ${edu.length ? `<div class="cv-section"><div class="cv-section-title">Formação</div>${eduHtml}</div>` : ''}
                    ${projects.length ? `<div class="cv-section"><div class="cv-section-title">Projetos</div>${projHtml}</div>` : ''}
                </div>
            </div>
        </div>`;
    }

    if (style === 'minimalista') {
        return `<div class="cv-minimalista">
            <div class="cv-name">${name}</div>
            ${d.role ? `<div class="cv-role">${d.role}</div>` : ''}
            <div class="cv-contacts">${contactLine}</div>
            ${summary ? `<div class="cv-section"><div class="cv-section-title">Perfil</div><p>${summary}</p></div>` : ''}
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
        <div class="cv-header">
            <div class="cv-name">${name}</div>
            ${d.role ? `<div class="cv-role">${d.role}</div>` : ''}
            <div class="cv-contacts">${contactLine}</div>
        </div>
        <div class="cv-body">
            <div>
                ${summary ? `<div class="cv-section"><div class="cv-section-title">Perfil</div><p>${summary}</p></div>` : ''}
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
    const html  = buildCvHtml(cvData, currentStyle);
    const el    = document.getElementById('cv-render');
    el.innerHTML = html;
    const name   = (cvData.name || 'curriculo').toLowerCase().replace(/\s+/g,'-');
    await html2pdf().set({
        margin: 0, filename: `${name}-revitael.pdf`,
        image: { type:'jpeg', quality:.98 },
        html2canvas: { scale:2, useCORS:true },
        jsPDF: { unit:'mm', format:'a4', orientation:'portrait' }
    }).from(el).save();
    el.innerHTML = '';
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

    try {
        const res = await callApi('/api/chat', { messages: analyzerMsgs, mode: 'analyzer' });
        analyzerMsgs.push({ role: 'assistant', content: res.content });

        document.getElementById('upload-panel').style.display = 'none';
        document.getElementById('results-panel').classList.remove('hidden');

        const cleanText = res.content.replace(/<!--ANALYSIS_JSON:[\s\S]*?-->/g, '').trim();
        appendMessage('analyzer-messages', 'ai', cleanText);
        parseAnalysisJson(res.content);
    } catch(err) {
        alert('Erro ao analisar. Verifique sua conexão e tente novamente.');
    }

    analyzerBusy = false;
    document.getElementById('btn-analyze-text').textContent = '🔍 Analisar agora';
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
    const typingId = showTyping('analyzer-messages');
    try {
        const res = await callApi('/api/chat', { messages: analyzerMsgs, mode: 'analyzer' });
        removeTyping('analyzer-messages', typingId);
        const clean = res.content.replace(/<!--ANALYSIS_JSON:[\s\S]*?-->/g,'').trim();
        appendMessage('analyzer-messages', 'ai', clean);
        analyzerMsgs.push({ role: 'assistant', content: res.content });
    } catch(err) {
        removeTyping('analyzer-messages', typingId);
        appendMessage('analyzer-messages', 'ai', '⚠️ Erro ao conectar. Tente novamente.');
    }
    analyzerBusy = false;
    setSendDisabled('analyzer-send', false);
}

// Parse analysis JSON and update score UI
function parseAnalysisJson(text) {
    const match = text.match(/<!--ANALYSIS_JSON:([\s\S]*?)-->/);
    if (!match) return;
    try {
        const d = JSON.parse(match[1]);
        const score = Math.min(100, Math.max(0, d.score || 0));
        animateScore(score, d.scoreBreakdown || {});
    } catch(e) { /* ignore */ }
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

// API call
async function callApi(path, body) {
    const res = await fetch(API_BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
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
