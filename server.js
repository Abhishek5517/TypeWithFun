const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config();

const db = require('./config/db');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('trust proxy', 1);

const sessionMiddleware = session({
  store: new pgSession({
    pool: db,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET || 'typefun_secret_2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
});
if (process.env.NODE_ENV === 'production') {
  sessionMiddleware.cookie.secure = true;
}
app.use(sessionMiddleware);

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// ─── Typing texts ───────────────────────────────────────────────────────────
const TYPING_TEXTS = [
  "The quick brown fox jumps over the lazy dog and races through the forest path swiftly.",
  "Practice makes perfect and consistency leads to great results over time for all learners.",
  "Technology is changing the world at a rapid pace every single day and we must adapt well.",
  "Success comes to those who work hard and never give up on their dreams no matter what.",
  "Learning new skills every day keeps the mind sharp and focused on achieving future goals.",
  "Good habits built slowly become the foundation of a productive and meaningful life journey.",
  "Reading books daily expands your vocabulary and sharpens your critical thinking skills.",
  "The best way to predict the future is to create it yourself through hard work and vision.",
  "Small daily improvements over time lead to stunning results that surprise even the achiever.",
  "Focus on progress not perfection and you will achieve great things in your lifetime ahead."
];

function generateRoomCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

const activeRooms = new Map();

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/play');
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/play');
  res.render('auth', { page: 'login', error: null });
});

app.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/play');
  res.render('auth', { page: 'register', error: null });
});

app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.render('auth', { page: 'register', error: 'All fields required' });
  if (username.length < 3 || username.length > 30)
    return res.render('auth', { page: 'register', error: 'Username must be 3-30 characters' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const colors = ['#7C3AED','#059669','#DC2626','#2563EB','#D97706','#DB2777'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const result = await db.query(
      'INSERT INTO users (username, email, password_hash, avatar_color) VALUES ($1, $2, $3, $4) RETURNING id',
      [username.trim(), email.trim().toLowerCase(), hash, color]
    );
    const newUserId = result.rows[0].id;
    req.session.user = { id: newUserId, username: username.trim(), avatar_color: color };
    res.redirect('/play');
  } catch (err) {
    // 23505 = unique_violation in PostgreSQL
    const msg = err.code === '23505' ? 'Username or email already taken' : 'Registration failed';
    res.render('auth', { page: 'register', error: msg });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.render('auth', { page: 'login', error: 'All fields required' });
  try {
    const result = await db.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
    if (!result.rows.length) return res.render('auth', { page: 'login', error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!valid) return res.render('auth', { page: 'login', error: 'Invalid credentials' });
    req.session.user = {
      id: result.rows[0].id,
      username: result.rows[0].username,
      avatar_color: result.rows[0].avatar_color
    };
    res.redirect('/play');
  } catch (err) {
    res.render('auth', { page: 'login', error: 'Login failed' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/play', requireAuth, (req, res) => {
  res.render('play', { user: req.session.user });
});

app.get('/dashboard', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    const soloResultsRes = await db.query(
      `SELECT * FROM solo_results WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, [userId]
    );
    const soloStatsRes = await db.query(
      `SELECT MAX(wpm) as best_wpm, AVG(wpm) as avg_wpm, AVG(accuracy) as avg_acc,
       COUNT(*) as total_tests, SUM(total_chars) as total_chars
       FROM solo_results WHERE user_id = $1`, [userId]
    );
    const raceResultsRes = await db.query(
      `SELECT rr.*, r.created_at as race_date FROM race_results rr
       JOIN rooms r ON rr.room_id = r.id
       WHERE rr.user_id = $1 ORDER BY r.created_at DESC LIMIT 20`, [userId]
    );
    const raceStatsRes = await db.query(
      `SELECT COUNT(*) as total_races,
       SUM(CASE WHEN finish_position = 1 THEN 1 ELSE 0 END) as wins,
       AVG(wpm) as avg_wpm, MAX(wpm) as best_wpm
       FROM race_results WHERE user_id = $1`, [userId]
    );
    res.render('dashboard', {
      user: req.session.user,
      soloResults: soloResultsRes.rows,
      soloStats: soloStatsRes.rows[0],
      raceResults: raceResultsRes.rows,
      raceStats: raceStatsRes.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.render('dashboard', {
      user: req.session.user,
      soloResults: [], soloStats: {},
      raceResults: [], raceStats: {}
    });
  }
});

app.get('/leaderboard', requireAuth, async (req, res) => {
  try {
    const soloTopRes = await db.query(
      `SELECT u.username, u.avatar_color, MAX(sr.wpm) as best_wpm,
       AVG(sr.wpm) as avg_wpm, AVG(sr.accuracy) as avg_acc, COUNT(sr.id) as tests
       FROM solo_results sr JOIN users u ON sr.user_id = u.id
       GROUP BY sr.user_id, u.username, u.avatar_color ORDER BY best_wpm DESC LIMIT 20`
    );
    const multiTopRes = await db.query(
      `SELECT u.username, u.avatar_color,
       COUNT(rr.id) as races,
       SUM(CASE WHEN rr.finish_position = 1 THEN 1 ELSE 0 END) as wins,
       MAX(rr.wpm) as best_wpm, AVG(rr.wpm) as avg_wpm
       FROM race_results rr JOIN users u ON rr.user_id = u.id
       GROUP BY rr.user_id, u.username, u.avatar_color ORDER BY wins DESC, best_wpm DESC LIMIT 20`
    );
    res.render('leaderboard', {
      user: req.session.user,
      soloTop: soloTopRes.rows,
      multiTop: multiTopRes.rows
    });
  } catch (err) {
    res.render('leaderboard', { user: req.session.user, soloTop: [], multiTop: [] });
  }
});

// API: Save solo result
app.post('/api/solo-result', requireAuth, async (req, res) => {
  const { wpm, accuracy, correct_chars, wrong_chars, total_chars, duration_seconds, mode } = req.body;
  try {
    await db.query(
      `INSERT INTO solo_results (user_id, wpm, accuracy, correct_chars, wrong_chars, total_chars, duration_seconds, mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [req.session.user.id, wpm, accuracy, correct_chars, wrong_chars, total_chars, duration_seconds, mode || 'normal']
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

// ─── Socket.io Multiplayer ────────────────────────────────────────────────────
io.on('connection', (socket) => {
  const user = socket.request.session?.user;

  socket.on('create_room', async () => {
    if (!user) return socket.emit('error', 'Not authenticated');
    const roomCode = generateRoomCode();
    const text = TYPING_TEXTS[Math.floor(Math.random() * TYPING_TEXTS.length)];
    try {
      const result = await db.query(
        'INSERT INTO rooms (room_code, host_user_id, text_content) VALUES ($1, $2, $3) RETURNING id',
        [roomCode, user.id, text]
      );
      const roomId = result.rows[0].id;
      activeRooms.set(roomCode, {
        id: roomId, code: roomCode, text, hostId: user.id,
        players: new Map(), status: 'waiting', countdownTimer: null
      });
      socket.join(roomCode);
      activeRooms.get(roomCode).players.set(socket.id, {
        socketId: socket.id, userId: user.id, username: user.username,
        avatar_color: user.avatar_color, progress: 0, wpm: 0,
        accuracy: 100, finished: false, finishPos: 0
      });
      socket.emit('room_created', { roomCode, roomId, text });
      broadcastRoomState(roomCode);
    } catch (err) {
      socket.emit('error', 'Failed to create room');
    }
  });

  socket.on('join_room', async ({ roomCode }) => {
    if (!user) return socket.emit('error', 'Not authenticated');
    const room = activeRooms.get(roomCode);
    if (!room) return socket.emit('join_error', 'Room not found');
    if (room.status !== 'waiting') return socket.emit('join_error', 'Race already started');
    if (room.players.size >= 6) return socket.emit('join_error', 'Room is full (max 6)');

    socket.join(roomCode);
    room.players.set(socket.id, {
      socketId: socket.id, userId: user.id, username: user.username,
      avatar_color: user.avatar_color, progress: 0, wpm: 0,
      accuracy: 100, finished: false, finishPos: 0
    });
    socket.emit('room_joined', { roomCode, text: room.text, roomId: room.id });
    broadcastRoomState(roomCode);
  });

  socket.on('start_race', ({ roomCode }) => {
    const room = activeRooms.get(roomCode);
    if (!room || room.hostId !== user?.id) return;
    if (room.players.size < 1) return socket.emit('error', 'Need at least 1 player');
    room.status = 'countdown';
    io.to(roomCode).emit('countdown_start');
    let count = 3;
    const cd = setInterval(() => {
      io.to(roomCode).emit('countdown_tick', count);
      count--;
      if (count < 0) {
        clearInterval(cd);
        room.status = 'racing';
        room.raceStartTime = Date.now();
        io.to(roomCode).emit('race_start', { text: room.text, timestamp: room.raceStartTime });
      }
    }, 1000);
  });

  socket.on('progress_update', ({ roomCode, progress, wpm, accuracy }) => {
    const room = activeRooms.get(roomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    player.progress = Math.min(100, progress);
    player.wpm = wpm || 0;
    player.accuracy = accuracy || 100;
    io.to(roomCode).emit('players_update', getPlayersArray(room));
  });

  socket.on('player_finished', async ({ roomCode, wpm, accuracy, finishTimeMs }) => {
    const room = activeRooms.get(roomCode);
    if (!room || !user) return;
    const player = room.players.get(socket.id);
    if (!player || player.finished) return;
    const finishedCount = [...room.players.values()].filter(p => p.finished).length;
    player.finished = true;
    player.finishPos = finishedCount + 1;
    player.wpm = wpm;
    player.accuracy = accuracy;
    player.progress = 100;
    const finishSec = finishTimeMs / 1000;
    try {
      await db.query(
        `INSERT INTO race_results (room_id, user_id, username, wpm, accuracy, progress_percent, finish_position, finish_time_seconds)
         VALUES ($1, $2, $3, $4, $5, 100, $6, $7)`,
        [room.id, user.id, user.username, wpm, accuracy, player.finishPos, finishSec]
      );
    } catch (e) { console.error('Race result save error:', e.message); }

    io.to(roomCode).emit('players_update', getPlayersArray(room));
    io.to(roomCode).emit('player_completed', { username: user.username, position: player.finishPos, wpm });

    const allDone = [...room.players.values()].every(p => p.finished);
    if (allDone) endRace(roomCode);
    else if (player.finishPos === 1) {
      setTimeout(() => endRace(roomCode), 30000);
    }
  });

  socket.on('disconnect', () => {
    activeRooms.forEach((room, code) => {
      if (room.players.has(socket.id)) {
        const player = room.players.get(socket.id);
        room.players.delete(socket.id);
        io.to(code).emit('player_left', { username: player.username });
        if (room.players.size === 0) {
          activeRooms.delete(code);
        } else {
          if (room.hostId === player.userId) {
            const first = room.players.values().next().value;
            room.hostId = first.userId;
            io.to(code).emit('new_host', { username: first.username, userId: first.userId });
          }
          broadcastRoomState(code);
        }
      }
    });
  });
});

async function endRace(roomCode) {
  const room = activeRooms.get(roomCode);
  if (!room || room.status === 'finished') return;
  room.status = 'finished';
  try {
    await db.query(
      'UPDATE rooms SET status = $1, finished_at = NOW() WHERE room_code = $2',
      ['finished', roomCode]
    );
  } catch (e) {}
  io.to(roomCode).emit('race_finished', { players: getPlayersArray(room) });
}

function getPlayersArray(room) {
  return [...room.players.values()].sort((a, b) => b.progress - a.progress || b.wpm - a.wpm);
}

function broadcastRoomState(roomCode) {
  const room = activeRooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit('room_state', {
    players: getPlayersArray(room),
    status: room.status,
    hostId: room.hostId,
    playerCount: room.players.size,
    roomCode
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 TypeFun server running at http://localhost:${PORT}`);
});