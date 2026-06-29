# Landing - AI Bot

Лендинг для проверки спроса на сервис `AI-бот для малого бизнеса` с backend-чатом AI-консультанта.

## Как открыть

Установить зависимости и запустить локальный сервер:

```bash
npm install
npm run dev
```

После запуска открыть:

`http://127.0.0.1:8029`

## Скриншоты

### Desktop

![Desktop screenshot](docs/screenshots/landing-desktop-full.png)

### Mobile

![Mobile screenshot](docs/screenshots/landing-mobile-full.png)

## Контакты

- Telegram: https://t.me/ilnurKasum
- Email: ilnur1234567890111213141516@gmail.com

## AI-консультант

На сайте есть чат-виджет AI-консультанта.

Frontend отправляет сообщения на backend endpoint:

`POST /api/chat`

Backend обращается к OpenAI Responses API и использует модель из переменной окружения.

Для работы нужен файл `.env`:

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
```

Пример переменных есть в `.env.example`.

Важно: API-ключ нельзя хранить во frontend-коде и нельзя коммитить `.env`.

Локальный запуск:

```bash
npm install
npm run dev
```

Если OpenAI API временно недоступен или ключ не задан, чат покажет fallback с прямой ссылкой на Telegram.

## SEO и GEO

Перед публикацией нужно заменить `SITE_URL` на реальный домен в файлах:

- `index.html`
- `robots.txt`
- `sitemap.xml`
- `llms.txt`

Сейчас временный домен указан как `https://example.com`.

После публикации:

1. Проверить сайт в Google Search Console.
2. Добавить сайт в Яндекс Вебмастер.
3. Отправить `sitemap.xml`.
4. Проверить JSON-LD через Rich Results Test / Schema Markup Validator.
5. Проверить, что `robots.txt` доступен по адресу `/robots.txt`.
6. Проверить, что `sitemap.xml` доступен по адресу `/sitemap.xml`.
7. Проверить, что `llms.txt` доступен по адресу `/llms.txt`.

## Связанные заметки

- [[AI Operator Business System]]
- [[AI Operator Offer and Pricing]]
- [[AI Operator Sales Scripts]]
- [[Minimum Viable Offer]]
