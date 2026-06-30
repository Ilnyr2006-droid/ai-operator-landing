import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTelegramBotUrl } from "./telegram.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const knowledgePath = path.join(__dirname, "knowledge", "ai-bot-consultant.md");

export function normalizeLead(lead = {}) {
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

export function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [{ role: "user", content: "Здравствуйте" }];
  }

  return messages
    .slice(-16)
    .map((message) => ({
      role: message?.role === "assistant" ? "assistant" : "user",
      content: clean(message?.content, 1200),
    }))
    .filter((message) => message.content.trim());
}

export function isLeadComplete(lead) {
  return Object.values(normalizeLead(lead)).every(Boolean);
}

export async function askAiConsultant({ messages, lead }) {
  const normalizedLead = normalizeLead(lead);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return normalizeModelPayload(
      {
        reply: fallbackReply(),
        intent: "handoff",
        lead_stage: "none",
        cta: "show_contacts",
        handoff_required: true,
      },
      normalizedLead
    );
  }

  const knowledge = await fs.readFile(knowledgePath, "utf8");
  const modelReply = await askOpenAI({
    apiKey,
    messages: normalizeMessages(messages),
    lead: normalizedLead,
    knowledge,
  });

  return normalizeModelPayload(modelReply, normalizedLead);
}

function fallbackReply() {
  return `Сейчас AI-консультант временно недоступен. Можете открыть Telegram-бота и оставить заявку там: ${getTelegramBotUrl()}`;
}

async function askOpenAI({ apiKey, messages, lead, knowledge }) {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const instructions = [
    "Ты AI-консультант сайта и Telegram-бота Ильнура Касумова по запуску AI-администраторов для малого бизнеса. Отвечай только по базе знаний ниже.",
    "Не выдумывай цены, сроки, условия, гарантии и обещания.",
    "Если информации нет, предложи мини-аудит или передачу вопроса Ильнуру.",
    "Отвечай на русском языке, кратко, спокойно, профессионально.",
    "Главная цель — помочь человеку понять услугу и мягко довести до заявки на бесплатный мини-аудит.",
    "Если пользователь хочет оставить заявку, собирай поля по одному: business_name, city, niche, channels, link, problem, contact.",
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

function normalizeModelPayload(payload, previousLead) {
  return {
    reply: clean(payload?.reply) || fallbackReply(),
    intent: clean(payload?.intent) || "unknown",
    lead_stage: clean(payload?.lead_stage) || "none",
    lead: mergeLead(previousLead, payload?.lead),
    cta: clean(payload?.cta) || "none",
    handoff_required: Boolean(payload?.handoff_required),
  };
}

function clean(value, limit = 1000) {
  return String(value || "").trim().slice(0, limit);
}

function mergeLead(previousLead, nextLead) {
  const previous = normalizeLead(previousLead);
  const next = normalizeLead(nextLead);

  return Object.fromEntries(
    Object.keys(previous).map((key) => [key, next[key] || previous[key]])
  );
}
