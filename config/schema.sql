-- ============================================
-- TypeFun Multiplayer - PostgreSQL Setup
-- ============================================

-- Database create (run separately)
CREATE DATABASE typefun_db;

-- Connect to DB
\c typefun_db;

-- =========================
-- Users table
-- =========================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(30) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  avatar_color VARCHAR(7) DEFAULT '#7C3AED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- Solo typing test results
-- =========================
CREATE TABLE IF NOT EXISTS solo_results (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  wpm INT NOT NULL,
  accuracy DECIMAL(5,2) NOT NULL,
  correct_chars INT NOT NULL,
  wrong_chars INT NOT NULL,
  total_chars INT NOT NULL,
  duration_seconds INT NOT NULL,
  mode VARCHAR(20) DEFAULT 'normal',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =========================
-- ENUM for room status
-- =========================
DO $$ BEGIN
  CREATE TYPE room_status AS ENUM ('waiting','countdown','racing','finished');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- =========================
-- Rooms table
-- =========================
CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  room_code VARCHAR(10) NOT NULL UNIQUE,
  host_user_id INT,
  text_content TEXT NOT NULL,
  status room_status DEFAULT 'waiting',
  max_players INT DEFAULT 6,
  winner_user_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,

  FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- =========================
-- Multiplayer race results
-- =========================
CREATE TABLE IF NOT EXISTS race_results (
  id SERIAL PRIMARY KEY,
  room_id INT NOT NULL,
  user_id INT NOT NULL,
  username VARCHAR(30) NOT NULL,
  wpm INT DEFAULT 0,
  accuracy DECIMAL(5,2) DEFAULT 0,
  progress_percent INT DEFAULT 0,
  finish_position INT DEFAULT 0,
  finish_time_seconds DECIMAL(8,3) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =========================
-- Indexes
-- =========================
CREATE INDEX idx_solo_user ON solo_results(user_id);
CREATE INDEX idx_solo_created ON solo_results(created_at);
CREATE INDEX idx_race_room ON race_results(room_id);
CREATE INDEX idx_race_user ON race_results(user_id);
CREATE INDEX idx_rooms_code ON rooms(room_code);
CREATE INDEX idx_rooms_status ON rooms(status);