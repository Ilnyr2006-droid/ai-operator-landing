const fallbackTelegramUsername = "ilnurKasum";

export function getTelegramBotUrl() {
  const username = cleanUsername(process.env.TELEGRAM_BOT_USERNAME) || fallbackTelegramUsername;
  return `https://t.me/${username}`;
}

export async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!token || !chatId) {
    return { success: false, reason: "missing_telegram_env" };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text || "").slice(0, 3900),
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      return { success: false, reason: `telegram_api_${response.status}` };
    }

    return { success: true };
  } catch {
    return { success: false, reason: "telegram_api_error" };
  }
}

export async function notifyAdminLead(lead, source, meta = {}) {
  const createdAt = lead?.created_at || new Date().toISOString();
  const lines = [
    "Новая заявка на мини-аудит AI-администратора",
    "",
    `Источник: ${source}`,
    "",
    `Бизнес: ${valueOrDash(lead?.business_name)}`,
    `Город: ${valueOrDash(lead?.city)}`,
    `Ниша: ${valueOrDash(lead?.niche)}`,
    `Каналы общения: ${valueOrDash(lead?.channels)}`,
    `Ссылка: ${valueOrDash(lead?.link)}`,
    `Проблема: ${valueOrDash(lead?.problem)}`,
    `Контакт клиента: ${valueOrDash(lead?.contact)}`,
  ];

  if (meta.telegramUsername) {
    lines.push("", `Telegram user: @${meta.telegramUsername}`);
  }

  if (meta.telegramUserId) {
    if (!meta.telegramUsername) lines.push("");
    lines.push(`Telegram user id: ${meta.telegramUserId}`);
  }

  lines.push("", `Время: ${createdAt}`);

  return sendTelegramMessage(lines.join("\n"));
}

function cleanUsername(username) {
  return String(username || "").trim().replace(/^@/, "");
}

function valueOrDash(value) {
  return String(value || "").trim() || "-";
}
