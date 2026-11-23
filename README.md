# Neon Ultimate Tic-Tac-Toe (GitHub Pages + PeerJS)

Супер-крестики-нолики для статического хостинга. Онлайн — через **PeerJS** (P2P), без своего сервера и БД.

## Что есть

- Игра **против бота** (лёгкий / средний / сложный)
- Игра **вдвоём на одном устройстве**
- **Онлайн по коду комнаты или ссылке** (Firebase Realtime Database)
- Сохранение партии с ботом в localStorage
- Неоновый дизайн, тёмная/светлая тема, звуки
- Правила внутри приложения

## Онлайн без сервера

1. Один игрок выбирает «По сети» → **Создать комнату**.
2. Появляется 6-значный код и ссылка `?room=XXXXXX`.
3. Второй открывает ту же страницу и вводит код **или** переходит по ссылке.
4. Хосты: создатель = ✕ (X), гость = ○ (O).
5. Ходы синхронизируются напрямую между браузерами.

Ходы идут через Firebase. Игровые данные идут P2P.

> Нужен современный браузер с WebRTC. Оба игрока должны быть онлайн одновременно.  
> Если NAT/firewall жёсткий, соединение может не установиться (редко).

## Настройка онлайна (Firebase Realtime Database)

Ходы передаются через бесплатную Firebase Realtime Database (обычный WebSocket, без WebRTC/NAT).

1. На https://console.firebase.google.com создайте проект (Analytics можно отключить).
2. **Build → Realtime Database → Create database** (любой регион).
3. Вкладка **Rules** → вставьте содержимое файла `database.rules.json` → **Publish**.
4. **Project settings → Your apps → Web (`</>`)** → скопируйте `firebaseConfig`
   в `src/lib/firebaseConfig.js` (обязательно с `databaseURL`).
5. `npm install && npm run build`, выкладывайте как обычно.

Комната живёт, пока хост на сайте; при закрытии вкладки хоста она удаляется автоматически.

## Чего нет

- Аккаунты, профили, друзья, рейтинг
- Backend, база данных, свой WebSocket-сервер

## Как запустить локально

```bash
npm install
npm run dev
```

Firebase ставится через `npm install` автоматически.

## Как выложить на GitHub Pages

1. Создайте репозиторий, залейте **содержимое этой папки**.
2. Соберите:

```bash
npm install
npm run build
```

3. Вариант с папкой `docs`:

```bash
rm -rf docs
mv dist docs
git add docs
git commit -m "Deploy"
git push
```

В настройках Pages: branch `main` → folder `/docs`.

Если репозиторий не корневой (`username.github.io/repo-name`), в `vite.config.js` укажите:

```js
base: '/имя-репозитория/',
```

и пересоберите.

## Технологии

- React + Vite
- Zustand
- Firebase Realtime Database
- Чистый CSS (neon theme)
