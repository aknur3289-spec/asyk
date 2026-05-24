# Асык (Kazakh Knucklebones) — Web Game

## Структура проекта
```
asyk/
├── backend/
│   ├── main.py          # FastAPI: POST /api/score, GET /api/leaderboard
│   ├── database.py      # Supabase клиент
│   └── requirements.txt
└── frontend/
    ├── index.html       # Разметка + экраны
    └── game.js          # Canvas физика + API fetch
```

## Запуск бэкенда (Render)

### 1. Supabase — создайте таблицу
```sql
create table leaderboard (
  id          bigint generated always as identity primary key,
  player_name text    not null,
  score       int     not null default 0,
  moves       int     not null default 0,
  created_at  timestamptz default now()
);
```

### 2. Переменные окружения (Render → Environment)
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=your-anon-key
```

### 3. Deploy на Render
- **Build command:** `pip install -r requirements.txt`
- **Start command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Root directory:** `backend`

### 4. Обновите URL в frontend/game.js
```js
const API_BASE = "https://your-app.onrender.com";
```

## Зависимости
```
fastapi
uvicorn[standard]
supabase
python-dotenv
```
