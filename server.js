import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatRouter } from "./routes/chat.js";
import { startTelegramBot } from "./server/telegram-bot.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8029;

app.use(express.json({ limit: "64kb" }));
app.use("/api", chatRouter);
app.use(express.static(__dirname));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`AI bot landing is running at http://127.0.0.1:${port}`);
});

if (process.env.TELEGRAM_BOT_TOKEN) {
  try {
    startTelegramBot();
  } catch (error) {
    console.error("Telegram bot start error:", {
      name: error?.name,
      message: error?.message,
    });
  }
}
