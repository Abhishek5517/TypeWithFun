# 🎮 TypeFun — Multiplayer Typing Game

A real-time multiplayer typing speed game built with Node.js, Socket.io, and Postgres.

## Features
- **Solo Practice** — WPM tracking, accuracy %, multiple text modes (Normal / Punctuation / Numbers), time limits (15s / 30s / 60s / 120s)
- **Multiplayer Race** — Create/join rooms, real-time race tracks, live progress of all players
- **Personal Dashboard** — WPM progress chart, accuracy history, solo & race records
- **Leaderboard** — Global solo rankings + race win rankings with podium display
- **User Auth** — Register/login with hashed passwords (bcrypt)

## Tech Stack
- **Backend**: Node.js + Express
- **Realtime**: Socket.io
- **Database**: Postgres
- **Templating**: EJS
- **Auth**: express-session + bcryptjs
- **Charts**: Chart.js

---

## Setup Instructions

### 1. Install Dependencies
```bash
cd typefun
npm install
```

### 2. Configure MySQL
Make sure MySQL is running, then:
```sql
-- Run the schema file
mysql -u root -p < config/schema.sql
```

### 3. Configure Environment
```bash
cp .env.example .env
```
Edit `.env`:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=typefun_db
SESSION_SECRET=any_long_random_string_here
PORT=3000
```

### 4. Start the Server
```bash
# Development (with auto-restart)
npm run dev

# Production
npm start
```

### 5. Open in Browser
```
http://localhost:3000
```

---

## How to Play Multiplayer

1. **Player 1**: Click "Multiplayer Race" → "Create Room" → Share the 6-letter room code
2. **Player 2+**: Click "Multiplayer Race" → Enter room code → "Join"
3. **Host**: Click "Start Race!" when all players are ready
4. **Countdown** from 3... 2... 1... GO!
5. **Race** — type the given text as fast as possible
6. **Results** — podium and full leaderboard shown at the end

---

## Project Structure
```
typefun/
├── server.js           # Main server (Express + Socket.io)
├── config/
│   ├── db.js           # MySQL connection pool
│   └── schema.sql      # Database schema
├── views/
│   ├── auth.ejs        # Login/Register page
│   ├── play.ejs        # Main game page (solo + multiplayer)
│   ├── dashboard.ejs   # Personal stats dashboard
│   └── leaderboard.ejs # Global leaderboards
├── public/             # Static assets
├── .env.example        # Environment template
└── package.json
```

## Socket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `create_room` | Client → Server | Create a new room |
| `join_room` | Client → Server | Join existing room |
| `start_race` | Client → Server | Host starts the race |
| `progress_update` | Client → Server | Send typing progress |
| `player_finished` | Client → Server | Player completed text |
| `room_state` | Server → Client | Room players list |
| `countdown_start/tick` | Server → Client | Countdown events |
| `race_start` | Server → Client | Race begins |
| `players_update` | Server → Client | Live progress update |
| `race_finished` | Server → Client | All players done |
