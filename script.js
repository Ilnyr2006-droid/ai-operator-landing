const header = document.querySelector(".site-header");
const revealItems = document.querySelectorAll("[data-reveal]");
const fallbackTelegramUrl = "https://t.me/ilnurKasum";
const emailAddress = "ilnur1234567890111213141516@gmail.com";
const initialChatMessage =
  "Здравствуйте. Подскажу, подойдет ли AI-администратор вашему бизнесу, расскажу про цены и помогу оставить заявку на бесплатный мини-аудит.";
const quickQuestions = [
  { label: "Что умеет?", value: "Что делает AI-администратор?" },
  { label: "Цена", value: "Сколько стоит?" },
  { label: "Что входит", value: "Что входит?" },
  { label: "Кому подходит", value: "Для кого подходит?" },
  { label: "Заявка", value: "Оставить заявку" },
];
let chatHistory = [{ role: "assistant", content: initialChatMessage }];
let currentLead = {
  business_name: "",
  city: "",
  niche: "",
  channels: "",
  link: "",
  problem: "",
  contact: "",
};
let lastLeadText = "";
let telegramUrl = fallbackTelegramUrl;

document.body.classList.add("can-reveal");

function syncHeader() {
  header.classList.toggle("is-scrolled", window.scrollY > 24);
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.18 }
);

revealItems.forEach((item) => observer.observe(item));
window.addEventListener("scroll", syncHeader, { passive: true });
syncHeader();

bootstrap();

async function bootstrap() {
  const publicConfig = await loadPublicConfig();
  telegramUrl = publicConfig.telegramBotUrl || fallbackTelegramUrl;
  applyPublicConfig(publicConfig);
  initChatWidget();
  initDebugPanel();
}

async function loadPublicConfig() {
  try {
    const response = await fetch("/api/public-config");
    if (!response.ok) throw new Error("Public config unavailable");
    return await response.json();
  } catch {
    return {
      telegramBotUrl: fallbackTelegramUrl,
      email: emailAddress,
    };
  }
}

function applyPublicConfig(config) {
  document.querySelectorAll("[data-telegram-bot-link]").forEach((link) => {
    link.href = config.telegramBotUrl || fallbackTelegramUrl;
  });
}

function initChatWidget() {
  const widget = document.createElement("section");
  widget.className = "chat-widget";
  widget.innerHTML = `
    <button class="chat-toggle" type="button" aria-expanded="false" aria-controls="chat-panel" aria-label="Открыть AI-консультанта">
      <span class="chat-orb" aria-hidden="true">AI</span>
      <span class="chat-toggle-text">
        <strong>Спросить AI</strong>
        <small>про цены и запуск</small>
      </span>
    </button>
    <div class="chat-panel" id="chat-panel" aria-hidden="true">
      <div class="chat-header">
        <div class="chat-title">
          <span class="chat-header-orb" aria-hidden="true">AI</span>
          <div>
            <strong>AI-консультант</strong>
            <span>Поможет с запуском AI-администратора.</span>
            <small><i></i> отвечает автоматически</small>
          </div>
        </div>
        <button class="chat-close" type="button" aria-label="Закрыть чат">×</button>
      </div>
      <div class="chat-messages" aria-live="polite"></div>
      <div class="chat-quick-actions"></div>
      <form class="chat-input-row">
        <input class="chat-input" type="text" placeholder="Напишите вопрос..." autocomplete="off" />
        <button class="chat-send" type="submit" aria-label="Отправить">↑</button>
      </form>
    </div>
  `;

  document.body.appendChild(widget);

  const toggle = widget.querySelector(".chat-toggle");
  const panel = widget.querySelector(".chat-panel");
  const close = widget.querySelector(".chat-close");
  const form = widget.querySelector(".chat-input-row");
  const input = widget.querySelector(".chat-input");
  const messages = widget.querySelector(".chat-messages");
  const quickActions = widget.querySelector(".chat-quick-actions");

  renderMessage(messages, "bot", initialChatMessage);
  renderQuickActions(quickActions, handleQuickAction);

  toggle.addEventListener("click", () => {
    const isOpen = panel.classList.toggle("is-open");
    panel.setAttribute("aria-hidden", String(!isOpen));
    toggle.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) input.focus();
  });

  close.addEventListener("click", () => {
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    await handleUserMessage(text);
  });

  async function handleQuickAction(text) {
    await handleUserMessage(text);
  }

  async function handleUserMessage(text) {
    renderMessage(messages, "user", text);
    chatHistory.push({ role: "user", content: text });
    quickActions.innerHTML = "";
    const typing = renderTyping(messages);
    setFormDisabled(form, true);

    try {
      const data = await sendChatMessage();
      typing.remove();
      currentLead = { ...currentLead, ...(data.lead || {}) };
      const reply = data.reply || getUnavailableMessage();
      chatHistory.push({ role: "assistant", content: reply });
      renderMessage(messages, data.error ? "bot error" : "bot", reply);

      if (data.cta === "submit_lead" || data.lead_stage === "complete") {
        renderLeadSummary(messages, currentLead);
        renderMessage(messages, "bot", getLeadDeliveryMessage(data.delivered_to));
      }

      if (data.intent === "unknown" || data.error) {
        renderQuickActions(quickActions, handleQuickAction);
      }
    } catch {
      typing.remove();
      renderMessage(messages, "bot error", getUnavailableMessage());
      renderQuickActions(quickActions, handleQuickAction);
    } finally {
      setFormDisabled(form, false);
      input.focus();
      scrollChat(messages);
    }
  }
}

async function sendChatMessage() {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: chatHistory,
      lead: currentLead,
    }),
  });

  return response.json();
}

function renderMessage(container, type, text) {
  const message = document.createElement("div");
  message.className = `chat-message ${type}`;
  if (type === "bot" && container.querySelectorAll(".chat-message.bot").length === 0) {
    const label = document.createElement("span");
    label.className = "chat-message-label";
    label.textContent = "AI-консультант";
    message.appendChild(label);
    message.appendChild(document.createTextNode(text));
  } else {
    message.textContent = text;
  }
  container.appendChild(message);
  scrollChat(container);
  return message;
}

function renderTyping(container) {
  const typing = document.createElement("div");
  typing.className = "chat-typing";
  typing.innerHTML = '<span>AI пишет</span><i></i><i></i><i></i>';
  container.appendChild(typing);
  scrollChat(container);
  return typing;
}

function renderQuickActions(container, onClick) {
  container.innerHTML = "";
  quickQuestions.forEach((question) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = question.label;
    button.addEventListener("click", () => onClick(question.value));
    container.appendChild(button);
  });
}

function renderLeadSummary(container, lead) {
  lastLeadText = formatLead(lead);
  const summary = document.createElement("div");
  summary.className = "chat-lead-summary";
  summary.innerHTML = `
    <strong>Заявка собрана</strong>
    <pre></pre>
    <div>
      <button class="chat-copy" type="button">Скопировать</button>
      <a class="chat-telegram" href="${telegramUrl}" target="_blank" rel="noreferrer">Открыть Telegram-бота</a>
      <a class="chat-email" href="${buildEmailLink(lastLeadText)}">Email</a>
    </div>
  `;
  summary.querySelector("pre").textContent = lastLeadText;
  summary.querySelector(".chat-copy").addEventListener("click", async () => {
    await copyLeadText(lastLeadText);
  });
  summary.querySelector(".chat-telegram").addEventListener("click", async () => {
    await copyLeadText(lastLeadText);
  });
  container.appendChild(summary);
  scrollChat(container);
}

function formatLead(lead) {
  return [
    "Заявка на мини-аудит AI-администратора",
    "",
    `Бизнес: ${lead.business_name || "-"}`,
    `Город: ${lead.city || "-"}`,
    `Ниша: ${lead.niche || "-"}`,
    `Каналы общения: ${lead.channels || "-"}`,
    `Ссылка: ${lead.link || "-"}`,
    `Проблема: ${lead.problem || "-"}`,
    `Контакт клиента: ${lead.contact || "-"}`,
    "",
    "Хочу получить пример AI-администратора для моего бизнеса.",
  ].join("\n");
}

function buildEmailLink(text) {
  return `mailto:${emailAddress}?subject=${encodeURIComponent("Мини-аудит AI-администратора")}&body=${encodeURIComponent(text)}`;
}

function getUnavailableMessage() {
  return `Сейчас AI-консультант временно недоступен. Можете открыть Telegram-бота и оставить заявку там: ${telegramUrl}`;
}

function getLeadDeliveryMessage(deliveredTo) {
  if (deliveredTo === "telegram") {
    return "Спасибо, заявка собрана. Я передал её Ильнуру в Telegram. Он посмотрит ваш бизнес и подготовит пример AI-администратора.";
  }

  return "Заявка собрана, но автоматическая отправка может быть недоступна. Скопируйте заявку и отправьте её в Telegram-бота.";
}

async function copyLeadText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Browser may block clipboard access; Telegram/email buttons remain available.
  }
}

function setFormDisabled(form, disabled) {
  form.querySelectorAll("input, button").forEach((item) => {
    item.disabled = disabled;
  });
}

function scrollChat(container) {
  container.scrollTop = container.scrollHeight;
}

function initDebugPanel() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("debug") !== "true") return;

  const panel = document.createElement("aside");
  panel.className = "debug-panel";
  panel.innerHTML = `
    <strong>Debug effects</strong>
    <label>
      Интенсивность свечения
      <input type="range" min="0" max="1" step="0.01" value="0.42" data-var="--glow-intensity">
    </label>
    <label>
      Прозрачность AI-слоя
      <input type="range" min="0" max="1" step="0.01" value="0.88" data-var="--xray-opacity">
    </label>
    <label>
      Размер мозаики
      <input type="range" min="10" max="34" step="1" value="18" data-var="--mosaic-size" data-unit="px">
    </label>
    <label>
      Цвет свечения
      <input type="color" value="#2f6f5f" data-var="--glow-color">
    </label>
    <label>
      Толщина границы
      <input type="range" min="1" max="4" step="1" value="1" data-var="--glow-border" data-unit="px">
    </label>
  `;

  panel.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      const unit = input.dataset.unit || "";
      document.documentElement.style.setProperty(input.dataset.var, `${input.value}${unit}`);
    });
  });

  document.body.appendChild(panel);
}
