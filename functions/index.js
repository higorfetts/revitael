const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const Anthropic = require("@anthropic-ai/sdk");

const anthropicKey = defineSecret("ANTHROPIC_API_KEY");

// ── SYSTEM PROMPTS ──────────────────────────────────────────────────────────

const CREATOR_SYSTEM = `Você é o Revitael, um assistente especialista em criar currículos profissionais incríveis.
Seu objetivo é guiar o usuário passo a passo para coletar todas as informações necessárias e criar um currículo perfeito.

FLUXO:
1. Apresente-se brevemente e pergunte o nome e área profissional
2. Colete: dados de contato (email, telefone, LinkedIn, cidade)
3. Pergunte sobre objetivo/resumo profissional (ofereça ajuda se travar)
4. Experiências profissionais (empresa, cargo, período, principais realizações)
5. Formação acadêmica (curso, instituição, ano)
6. Habilidades técnicas e soft skills
7. Idiomas
8. Certificados e cursos extras (SUGIRA proativamente: "Você tem algum certificado de X?")
9. Projetos pessoais ou portfólio (se relevante)
10. Pergunte qual estilo: Profissional (preto e branco), Moderno (lilás/roxo), Minimalista

REGRAS:
- Seja conversacional, animado e encorajador
- Faça UMA pergunta por vez para não sobrecarregar
- Dê exemplos quando o usuário travar ("Ex: 'Reduzi custos em 30% ao implementar...'")
- Sugira proativamente coisas que a pessoa pode ter esquecido
- Quando tiver TODAS as infos, inclua no final da resposta um bloco JSON entre as tags <!--CV_JSON: e --> com os dados estruturados assim:
<!--CV_JSON:{"name":"","contact":{"email":"","phone":"","linkedin":"","city":""},"summary":"","experience":[{"company":"","role":"","period":"","bullets":[]}],"education":[{"degree":"","institution":"","year":""}],"skills":[],"languages":[],"certifications":[],"projects":[],"style":"profissional"}-->

Responda sempre no idioma do usuário (português por padrão).`;

const ANALYZER_SYSTEM = `Você é o Revitael, um especialista em análise de currículos e recrutamento.
Você receberá o texto de um currículo e a descrição de uma vaga, e deve fazer uma análise detalhada.

ANÁLISE OBRIGATÓRIA (inclua sempre no bloco JSON ao final):
1. Score de 0-100 baseado em:
   - Correspondência de palavras-chave da vaga (40pts)
   - Clareza e estrutura do currículo (20pts)
   - Experiências relevantes (25pts)
   - Formação e certificados (15pts)
2. Pontos fortes (lista)
3. Gaps críticos (o que falta e impacta muito)
4. Palavras-chave da vaga que não estão no currículo
5. Sugestões de melhoria (concretas e acionáveis)

APÓS a análise, pergunte:
- Se o usuário tem experiências/certificados não listados que poderiam melhorar o score
- Se quiser criar um novo currículo otimizado para essa vaga

SEMPRE inclua ao final da PRIMEIRA resposta de análise:
<!--ANALYSIS_JSON:{"score":0,"strengths":[],"gaps":[],"missingKeywords":[],"suggestions":[],"scoreBreakdown":{"keywords":0,"structure":0,"experience":0,"education":0}}-->

Responda sempre em português, de forma clara e motivadora.`;

// ── MAIN FUNCTION ──────────────────────────────────────────────────────────

exports.revitaelApi = onRequest(
    { secrets: [anthropicKey], cors: true, timeoutSeconds: 120, memory: "256MiB" },
    async (req, res) => {
        res.set("Access-Control-Allow-Origin", "*");
        res.set("Access-Control-Allow-Headers", "Content-Type");
        res.set("Access-Control-Allow-Methods", "POST, OPTIONS");

        if (req.method === "OPTIONS") { res.status(204).send(""); return; }
        if (req.method !== "POST")    { res.status(405).json({ error: "Method not allowed" }); return; }

        const path = req.path;

        try {
            const anthropic = new Anthropic({ apiKey: anthropicKey.value() });

            if (path === "/api/chat") {
                const { messages, mode } = req.body;
                if (!messages || !Array.isArray(messages)) {
                    res.status(400).json({ error: "messages array required" }); return;
                }

                const systemPrompt = mode === "analyzer" ? ANALYZER_SYSTEM : CREATOR_SYSTEM;

                const response = await anthropic.messages.create({
                    model: "claude-sonnet-4-6",
                    max_tokens: 2048,
                    system: systemPrompt,
                    messages: messages.map(m => ({ role: m.role, content: m.content }))
                });

                res.json({ content: response.content[0].text });
                return;
            }

            res.status(404).json({ error: "Not found" });

        } catch (err) {
            console.error("Revitael API error:", err);
            res.status(500).json({ error: "Erro interno. Tente novamente." });
        }
    }
);
