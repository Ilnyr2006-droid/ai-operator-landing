import TelegramBot from "node-telegram-bot-api";
import { askAiConsultant, normalizeLead } from "./ai-consultant.js";
import { notifyAdminLead } from "./telegram.js";

const startMessage =
  "Здравствуйте. Я AI-консультант. Помогу понять, подойдет ли AI-бот вашему бизнесу, расскажу про цены и помогу оставить заявку на бесплатный мини-аудит.";

const quickButtons = [
  ["Что умеет AI-бот?", "Сколько стоит?"],
  ["Что входит?", "Кому подходит?"],
  ["Оставить заявку"],
];

const leadSteps = [
  ["business_name", "Как называется ваш бизнес?"],
  ["city", "В каком городе вы работаете?"],
  ["niche", "Какая у вас ниша?"],
  ["channels", "Где клиенты обычно вам пишут: Telegram, WhatsApp, VK, сайт, Авито или другие каналы?"],
  ["link", "Пришлите ссылку на сайт, соцсети или карточку компании."],
  ["problem", "Что сейчас мешает больше всего?"],
  ["contact", "Оставьте контакт для связи: Telegram, телефон или email."],
];

const sessions = new Map();

export function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return null;
  }

  if (globalThis.__aiOperatorTelegramBot) {
    return globalThis.__aiOperatorTelegramBot;
  }

  const bot = new TelegramBot(token, { polling: true });
  globalThis.__aiOperatorTelegramBot = bot;

  bot.onText(/^\/start/i, async (message) => {
    const chatId = message.chat.id;
    sessions.set(chatId, createSession());
    await sendStart(bot, chatId);
  });

  bot.on("message", async (message) => {
    if (!message.text || message.text.startsWith("/start")) return;

    const chatId = message.chat.id;
    const text = message.text.trim();
    const session = getSession(chatId);

    try {
      if (isLeadStart(text) || session.mode === "lead") {
        await handleLeadMessage(bot, message, session, text);
        return;
      }

      session.history.push({ role: "user", content: text });
      const payload = await askAiConsultant({
        messages: session.history,
        lead: session.lead,
      });

      session.lead = normalizeLead({ ...session.lead, ...payload.lead });
      session.history.push({ role: "assistant", content: payload.reply });

      await bot.sendMessage(chatId, payload.reply, keyboardOptions());
    } catch {
      await bot.sendMessage(
        chatId,
        "Сейчас AI-консультант временно недоступен. Попробуйте позже или оставьте заявку через кнопку ниже.",
        keyboardOptions()
      );
    }
  });

  bot.on("polling_error", (error) => {
    console.error("Telegram bot polling error:", {
      code: error?.code,
      message: error?.message,
    });
  });

  console.log("Telegram bot polling started");
  return bot;
}

async function sendStart(bot, chatId) {
  await bot.sendMessage(chatId, startMessage, keyboardOptions());
}

async function handleLeadMessage(bot, message, session, text) {
  const chatId = message.chat.id;

  if (isLeadStart(text) && session.mode !== "lead") {
    session.mode = "lead";
    session.leadStep = 0;
    session.lead = normalizeLead();
    await bot.sendMessage(chatId, leadSteps[0][1], removeKeyboardOptions());
    return;
  }

  const [field] = leadSteps[session.leadStep] || [];

  if (field) {
    session.lead[field] = text;
    session.leadStep += 1;
  }

  const nextStep = leadSteps[session.leadStep];

  if (nextStep) {
    await bot.sendMessage(chatId, nextStep[1], removeKeyboardOptions());
    return;
  }

  const completeLead = {
    ...normalizeLead(session.lead),
    created_at: new Date().toISOString(),
  };
  const summary = formatLeadSummary(completeLead);
  const telegramResult = await notifyAdminLead(completeLead, "Telegram-бот", {
    telegramUsername: message.from?.username,
    telegramUserId: message.from?.id,
  });

  session.mode = "chat";
  session.leadStep = 0;
  session.lead = normalizeLead();
  session.history = [];

  await bot.sendMessage(chatId, summary);

  if (telegramResult.success) {
    await bot.sendMessage(
      chatId,
      "Спасибо, заявка отправлена. Ильнур посмотрит ваш бизнес и подготовит пример сценария AI-бота.",
      keyboardOptions()
    );
    return;
  }

  await bot.sendMessage(
    chatId,
    "Спасибо, заявка собрана. Автоматическая отправка владельцу сейчас может быть недоступна. Скопируйте заявку выше и отправьте ее в этот чат позже.",
    keyboardOptions()
  );
}

function createSession() {
  return {
    mode: "chat",
    leadStep: 0,
    lead: normalizeLead(),
    history: [],
  };
}

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, createSession());
  }

  return sessions.get(chatId);
}

function isLeadStart(text) {
  return /оставить\s+заявк|заявк|мини-аудит/i.test(text);
}

function keyboardOptions() {
  return {
    reply_markup: {
      keyboard: quickButtons,
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  };
}

function removeKeyboardOptions() {
  return {
    reply_markup: {
      remove_keyboard: true,
    },
  };
}

function formatLeadSummary(lead) {
  return [
    "Заявка на мини-аудит AI-бота",
    "",
    `Бизнес: ${lead.business_name || "-"}`,
    `Город: ${lead.city || "-"}`,
    `Ниша: ${lead.niche || "-"}`,
    `Каналы общения: ${lead.channels || "-"}`,
    `Ссылка: ${lead.link || "-"}`,
    `Проблема: ${lead.problem || "-"}`,
    `Контакт клиента: ${lead.contact || "-"}`,
    "",
    "Хочу получить пример AI-бота для моего бизнеса.",
  ].join("\n");
}
