const header = document.querySelector(".site-header");
const revealItems = document.querySelectorAll("[data-reveal]");
const telegramUrl = "https://t.me/ilnurKasum";
const emailAddress = "ilnur1234567890111213141516@gmail.com";
const initialChatMessage =
  "Здравствуйте. Я помогу понять, подойдет ли AI-бот вашему бизнесу, расскажу про цены и могу принять заявку на бесплатный мини-аудит.";
const unavailableMessage =
  "Сейчас AI-консультант временно недоступен. Можете написать напрямую в Telegram: https://t.me/ilnurKasum";
const quickQuestions = [
  "Что делает AI-бот?",
  "Сколько стоит?",
  "Что входит?",
  "Для кого подходит?",
  "Оставить заявку",
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

initChatWidget();

function initChatWidget() {
  const widget = document.createElement("section");
  widget.className = "chat-widget";
  widget.innerHTML = `
    <button class="chat-toggle" type="button" aria-expanded="false" aria-controls="chat-panel">
      <span class="chat-toggle-full">AI-консультант</span>
      <span class="chat-toggle-short">Чат</span>
    </button>
    <div class="chat-panel" id="chat-panel" aria-hidden="true">
      <div class="chat-header">
        <div>
          <strong>AI-консультант</strong>
          <span>Отвечу на вопросы и помогу оставить заявку</span>
        </div>
        <button class="chat-close" type="button" aria-label="Закрыть чат">×</button>
      </div>
      <div class="chat-messages" aria-live="polite"></div>
      <div class="chat-quick-actions"></div>
      <form class="chat-input-row">
        <input class="chat-input" type="text" placeholder="Напишите вопрос" autocomplete="off" />
        <button class="chat-send" type="submit">Отправить</button>
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
      const reply = data.reply || unavailableMessage;
      chatHistory.push({ role: "assistant", content: reply });
      renderMessage(messages, data.error ? "bot error" : "bot", reply);

      if (data.cta === "submit_lead" || data.lead_stage === "complete") {
        renderLeadSummary(messages, currentLead);
      }

      if (data.intent === "unknown" || data.error) {
        renderQuickActions(quickActions, handleQuickAction);
      }
    } catch {
      typing.remove();
      renderMessage(messages, "bot error", unavailableMessage);
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
  message.textContent = text;
  container.appendChild(message);
  scrollChat(container);
  return message;
}

function renderTyping(container) {
  const typing = document.createElement("div");
  typing.className = "chat-typing";
  typing.textContent = "Бот печатает...";
  container.appendChild(typing);
  scrollChat(container);
  return typing;
}

function renderQuickActions(container, onClick) {
  container.innerHTML = "";
  quickQuestions.forEach((question) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = question;
    button.addEventListener("click", () => onClick(question));
    container.appendChild(button);
  });
}

function renderLeadSummary(container, lead) {
  lastLeadText = formatLead(lead);
  const summary = document.createElement("div");
  summary.className = "chat-lead-summary";
  summary.innerHTML = `
    <strong>Заявка на мини-аудит</strong>
    <pre></pre>
    <div>
      <button class="chat-copy" type="button">Скопировать заявку</button>
      <a href="${telegramUrl}" target="_blank" rel="noreferrer">Написать в Telegram</a>
      <a class="chat-email" href="${buildEmailLink(lastLeadText)}">Отправить email</a>
    </div>
  `;
  summary.querySelector("pre").textContent = lastLeadText;
  summary.querySelector(".chat-copy").addEventListener("click", async () => {
    await copyLeadText(lastLeadText);
  });
  summary.querySelector(`a[href="${telegramUrl}"]`).addEventListener("click", async () => {
    await copyLeadText(lastLeadText);
  });
  container.appendChild(summary);
  scrollChat(container);
}

function formatLead(lead) {
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

function buildEmailLink(text) {
  return `mailto:${emailAddress}?subject=${encodeURIComponent("Мини-аудит AI-бот")}&body=${encodeURIComponent(text)}`;
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
