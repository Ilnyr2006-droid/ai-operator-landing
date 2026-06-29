import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { askAiConsultant, isLeadComplete, normalizeLead } from "../server/ai-consultant.js";
import { getTelegramBotUrl, notifyAdminLead } from "../server/telegram.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const leadsPath = path.join(rootDir, "server", "leads.json");
const emailAddress = "ilnur1234567890111213141516@gmail.com";

export const chatRouter = express.Router();

chatRouter.get("/public-config", (_req, res) => {
  res.json({
    telegramBotUrl: getTelegramBotUrl(),
    email: emailAddress,
  });
});

chatRouter.post("/chat", async (req, res) => {
  try {
    const lead = normalizeLead(req.body?.lead);
    const payload = await askAiConsultant({
      messages: req.body?.messages,
      lead,
    });
    const completeLead = mergeLead(lead, payload.lead);

    if (shouldSubmitLead(payload, completeLead, req.body?.messages)) {
      const result = await submitLead(completeLead);
      payload.lead = completeLead;
      payload.cta = result.success ? "submit_lead" : "show_contacts";
      payload.lead_stage = "complete";
      payload.delivered_to = result.delivered_to;
    }

    return res.json(payload);
  } catch (error) {
    console.error("AI consultant error:", {
      name: error?.name,
      message: error?.message,
    });

    return res.status(200).json({
      reply: `Сейчас AI-консультант временно недоступен. Можете открыть Telegram-бота и оставить заявку там: ${getTelegramBotUrl()}`,
      lead: normalizeLead(req.body?.lead),
      intent: "handoff",
      lead_stage: "none",
      cta: "show_contacts",
      handoff_required: true,
      error: true,
    });
  }
});

async function submitLead(lead) {
  const entry = {
    ...normalizeLead(lead),
    source: "website_chat",
    created_at: new Date().toISOString(),
  };

  await saveLeadLocally(entry);

  const telegramResult = await notifyAdminLead(entry, "сайт");

  if (telegramResult.success) {
    return { success: true, delivered_to: "telegram" };
  }

  return { success: true, delivered_to: "local_file" };
}

function shouldSubmitLead(payload, lead, messages) {
  if (!isLeadComplete(lead)) {
    return false;
  }

  if (payload.lead_stage === "complete" || payload.cta === "submit_lead") {
    return true;
  }

  const lastMessage = Array.isArray(messages) ? messages.at(-1)?.content : "";
  return /отправ|оставить\s+заявк|заявк|мини-аудит/i.test(String(lastMessage || ""));
}

function mergeLead(previousLead, nextLead) {
  const previous = normalizeLead(previousLead);
  const next = normalizeLead(nextLead);

  return Object.fromEntries(
    Object.keys(previous).map((key) => [key, next[key] || previous[key]])
  );
}

async function saveLeadLocally(entry) {
  await fs.mkdir(path.dirname(leadsPath), { recursive: true });

  let leads = [];
  try {
    leads = JSON.parse(await fs.readFile(leadsPath, "utf8"));
  } catch {
    leads = [];
  }

  leads.push(entry);
  await fs.writeFile(leadsPath, JSON.stringify(leads, null, 2), "utf8");
}
