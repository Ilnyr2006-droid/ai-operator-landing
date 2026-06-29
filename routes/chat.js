import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const knowledgePath = path.join(rootDir, "server", "knowledge", "ai-bot-consultant.md");
const leadsPath = path.join(rootDir, "server", "leads.json");

const fallbackReply =
  "Сейчас AI-консультант временно недоступен. Можете написать напрямую в Telegram: https://t.me/ilnurKasum";

export const chatRouter = express.Router();

chatRouter.post("/chat", async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(200).json({
        reply: fallbackReply,
        lead: normalizeLead(req.body?.lead),
        intent: "handoff",
        lead_stage: "none",
        cta: "show_contacts",
        error: true,
      });
    }

    const messages = normalizeMessages(req.body?.messages);
    const lead = normalizeLead(req.body?.lead);
    const knowledge = await fs.readFile(knowledgePath, "utf8");
    const modelReply = await askOpenAI({ apiKey, messages, lead, knowledge });
    const payload = normalizeModelPayload(modelReply, lead);

    if (payload.lead_stage === "complete" || payload.cta === "submit_lead") {
      const completeLead = normalizeLead(payload.lead);

      if (isLeadComplete(completeLead)) {
        const result = await submitLead(completeLead);
        payload.lead = completeLead;
        payload.cta = result.success ? "submit_lead" : "show_contacts";
        payload.lead_stage = "complete";
      }
    }

    return res.json(payload);
  } catch (error) {
    console.error("AI consultant error:", {
      name: error?.name,
      message: error?.message,
    });

    return res.status(200).json({
      reply: fallbackReply,
      lead: normalizeLead(req.body?.lead),
      intent: "handoff",
      lead_stage: "none",
      cta: "show_contacts",
      error: true,
    });
  }
});

async function askOpenAI({ apiKey, messages, lead, knowledge }) {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const instructions = [
    "Ты AI-консультант сайта Ильнура Касумова. Отвечай только по базе знаний ниже.",
    "Не выдумывай цены, сроки, условия, гарантии и обещания.",
    "Если информации нет, предложи мини-аудит или передачу вопроса Ильнуру.",
    "Отвечай на русском языке, кратко, спокойно, профессионально.",
    "Главная цель — помочь посетителю понять услугу и мягко довести до заявки на бесплатный мини-аудит.",
    "Верни ответ в JSON-формате:",
    '{"reply":"текст ответа пользователю","intent":"faq | pricing | process | fit | objection | lead_start | lead_collecting | lead_complete | unknown | handoff","lead_stage":"none | business_name | city | niche | channels | link | problem | contact | complete","lead":{"business_name":"","city":"","niche":"","channels":"","link":"","problem":"","contact":""},"cta":"none | offer_audit | ask_next_lead_question | show_contacts | submit_lead","handoff_required":false}',
    "Не добавляй markdown в JSON. Возвращай только валидный JSON.",
    "",
    "Текущие данные заявки:",
    JSON.stringify(lead),
    "",
    "База знаний:",
    knowledge,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      instructions,
      text: { format: { type: "json_object" } },
      input: [
        {
          role: "user",
          content: "Верни только валидный JSON по указанной схеме.",
        },
        ...messages.map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.content,
        })),
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API failed with status ${response.status}`);
  }

  const data = await response.json();
  const text = data.output_text || extractResponseText(data);

  if (!text) {
    throw new Error("OpenAI API returned empty response");
  }

  return parseJsonText(text);
}

function extractResponseText(data) {
  const chunks = [];

  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Model did not return JSON");
    }
    return JSON.parse(match[0]);
  }
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [{ role: "user", content: "Здравствуйте" }];
  }

  return messages
    .slice(-16)
    .map((message) => ({
      role: message?.role === "assistant" ? "assistant" : "user",
      content: String(message?.content || "").slice(0, 1200),
    }))
    .filter((message) => message.content.trim());
}

function normalizeLead(lead = {}) {
  return {
    business_name: clean(lead.business_name),
    city: clean(lead.city),
    niche: clean(lead.niche),
    channels: clean(lead.channels),
    link: clean(lead.link),
    problem: clean(lead.problem),
    contact: clean(lead.contact),
  };
}

function normalizeModelPayload(payload, previousLead) {
  return {
    reply: clean(payload?.reply) || fallbackReply,
    intent: clean(payload?.intent) || "unknown",
    lead_stage: clean(payload?.lead_stage) || "none",
    lead: {
      ...normalizeLead(previousLead),
      ...normalizeLead(payload?.lead),
    },
    cta: clean(payload?.cta) || "none",
    handoff_required: Boolean(payload?.handoff_required),
  };
}

function clean(value) {
  return String(value || "").trim().slice(0, 1000);
}

function isLeadComplete(lead) {
  return Object.values(normalizeLead(lead)).every(Boolean);
}

async function submitLead(lead) {
  const entry = {
    ...normalizeLead(lead),
    source: "website_chat",
    created_at: new Date().toISOString(),
  };

  console.log("New AI bot mini-audit lead:", entry);

  await fs.mkdir(path.dirname(leadsPath), { recursive: true });

  let leads = [];
  try {
    leads = JSON.parse(await fs.readFile(leadsPath, "utf8"));
  } catch {
    leads = [];
  }

  leads.push(entry);
  await fs.writeFile(leadsPath, JSON.stringify(leads, null, 2), "utf8");

  return { success: true };
}
