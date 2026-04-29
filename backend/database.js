const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase requires SSL; rejectUnauthorized:false works for most dev setups
  ssl: {
    rejectUnauthorized: false
  }
});
// Log connection errors
pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});
// Test connection at startup
pool.query('SELECT 1', (err, res) => {
  if (err) {
    console.error('Failed to connect to Supabase PostgreSQL:', err);
  } else {
    console.log('Successfully connected to Supabase PostgreSQL');
  }
});
console.log('PostgreSQL pool initialized:', !!pool);

// Simple wrapper matching previous SQLite API (run, get, all)
const db = {
  run: (sql, params, cb) => {
    if (typeof params === 'function') { cb = params; params = []; }
    pool.query(sql, params || [])
      .then(res => cb && cb(null, res))
      .catch(err => cb && cb(err));
  },
  get: (sql, params, cb) => {
    if (typeof params === 'function') { cb = params; params = []; }
    pool.query(sql, params || [])
      .then(res => cb && cb(null, res.rows[0]))
      .catch(err => cb && cb(err));
  },
  all: (sql, params, cb) => {
    if (typeof params === 'function') { cb = params; params = []; }
    pool.query(sql, params || [])
      .then(res => cb && cb(null, res.rows))
      .catch(err => cb && cb(err));
  },
};

// Initialize schema
db.run(`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT,
            email TEXT UNIQUE,
            password TEXT,
            role TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS resources (
            id SERIAL PRIMARY KEY,
            type TEXT,
            name TEXT,
            latitude REAL,
            longitude REAL,
            description TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS reports (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            type TEXT,
            description TEXT,
            latitude REAL,
            longitude REAL,
            image_url TEXT,
            status TEXT DEFAULT 'en attente',
            assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
            agent_feedback TEXT,
            priority_level TEXT DEFAULT 'normal',
            deadline TIMESTAMP,
            budget_requested DECIMAL(12, 2) DEFAULT 0,
            materials_needed TEXT,
            admin_rating INTEGER,
            impact_score INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`);

        // Articles Table
        db.run(`CREATE TABLE IF NOT EXISTS articles (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT,
            image_url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Rewards Table
        db.run(`CREATE TABLE IF NOT EXISTS rewards (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            badge_name TEXT,
            points INTEGER DEFAULT 0,
            granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Insert some dummy data for resources
        db.get("SELECT count(*) as count FROM resources", (err, row) => {
            if (row && parseInt(row.count) === 0) {
                db.run("INSERT INTO resources (type, name, latitude, longitude, description) VALUES ('Forêt', 'Forêt du Banco', 5.3855, -4.0435, 'Parc national forestier important')");
                db.run("INSERT INTO resources (type, name, latitude, longitude, description) VALUES ('Eau', 'Lagune Ébrié', 5.2750, -4.0250, 'Zone aquatique majeure')");
            }
        });

        // Seed Users
        db.get("SELECT count(*) as count FROM users", (err, row) => {
            if (row && parseInt(row.count) === 0) {
                const adminPass = bcrypt.hashSync('admin123', 10);
                const agentPass = bcrypt.hashSync('agent123', 10);
                const testPass = bcrypt.hashSync('test123', 10);

                db.run("INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)", ['Admin System', 'admin@eco.ci', adminPass, 'admin']);
                db.run("INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)", ['Agent Terrain 1', 'agent1@eco.ci', agentPass, 'agent']);
                db.run("INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)", ['Citoyen Test', 'test@eco.ci', testPass, 'citoyen']);
                console.log("Seeded default users.");
            }
        });
module.exports = db;
