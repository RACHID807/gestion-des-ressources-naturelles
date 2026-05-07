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
            after_image_url TEXT,
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

        // Internal Notes Table
        db.run(`CREATE TABLE IF NOT EXISTS internal_notes (
            id SERIAL PRIMARY KEY,
            report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id),
            content TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Quiz Tables
        db.run(`CREATE TABLE IF NOT EXISTS quizzes (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT,
            points_reward INTEGER DEFAULT 50
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS questions (
            id SERIAL PRIMARY KEY,
            quiz_id INTEGER REFERENCES quizzes(id) ON DELETE CASCADE,
            question TEXT NOT NULL,
            options TEXT NOT NULL, -- JSON string
            correct_index INTEGER NOT NULL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS user_quiz_results (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            quiz_id INTEGER REFERENCES quizzes(id),
            score INTEGER,
            completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Sensors Table for IoT Integration
        db.run(`CREATE TABLE IF NOT EXISTS sensors (
            id SERIAL PRIMARY KEY,
            type TEXT NOT NULL, -- e.g., 'air_quality', 'water_level', 'temperature'
            location_name TEXT,
            latitude REAL,
            longitude REAL,
            api_endpoint TEXT, -- URL to fetch data from sensor
            last_reading JSONB, -- Store latest sensor data as JSON
            carbon_baseline REAL DEFAULT 0, -- Baseline CO2 level for calculations
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Sensor Readings History
        db.run(`CREATE TABLE IF NOT EXISTS sensor_readings (
            id SERIAL PRIMARY KEY,
            sensor_id INTEGER REFERENCES sensors(id) ON DELETE CASCADE,
            reading_data JSONB, -- Full reading data
            carbon_impact REAL DEFAULT 0, -- Calculated CO2 impact
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Water Resources Table
        db.run(`CREATE TABLE IF NOT EXISTS water_resources (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT, -- e.g., 'river', 'lake', 'groundwater'
            latitude REAL,
            longitude REAL,
            quality_baseline JSONB, -- Baseline pH, turbidity, etc.
            pollution_level REAL DEFAULT 0,
            carbon_impact REAL DEFAULT 0, -- CO2 from pollution
            status TEXT DEFAULT 'clean', -- 'clean', 'polluted', 'critical'
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Mining Sites Table
        db.run(`CREATE TABLE IF NOT EXISTS mining_sites (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            resource_type TEXT, -- e.g., 'gold', 'diamond', 'bauxite'
            latitude REAL,
            longitude REAL,
            extraction_rate REAL DEFAULT 0, -- Tons per month
            environmental_impact REAL DEFAULT 0, -- Biodiversity loss score
            carbon_emissions REAL DEFAULT 0, -- CO2 from extraction
            status TEXT DEFAULT 'active', -- 'active', 'suspended', 'rehabilitated'
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Oil Fields Table
        db.run(`CREATE TABLE IF NOT EXISTS oil_fields (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT, -- e.g., 'onshore', 'offshore'
            latitude REAL,
            longitude REAL,
            production_rate REAL DEFAULT 0, -- Barrels per day
            leak_risk REAL DEFAULT 0, -- Risk score 0-10
            carbon_emissions REAL DEFAULT 0, -- CO2 from production/leaks
            status TEXT DEFAULT 'operational', -- 'operational', 'shutdown', 'leaking'
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Energy Resources Table
        db.run(`CREATE TABLE IF NOT EXISTS energy_resources (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT, -- 'solar', 'microgrid', 'biomass'
            latitude REAL,
            longitude REAL,
            capacity_mw REAL DEFAULT 0,
            battery_level REAL DEFAULT 0,
            smart_grid_active BOOLEAN DEFAULT false,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Add new columns to existing tables for advanced management
        db.run(`ALTER TABLE water_resources ADD COLUMN IF NOT EXISTS smart_meter_active BOOLEAN DEFAULT false`);
        db.run(`ALTER TABLE water_resources ADD COLUMN IF NOT EXISTS recycling_rate REAL DEFAULT 0`);
        db.run(`ALTER TABLE mining_sites ADD COLUMN IF NOT EXISTS bioleaching_active BOOLEAN DEFAULT false`);
        db.run(`ALTER TABLE mining_sites ADD COLUMN IF NOT EXISTS compliance_score INTEGER DEFAULT 100`);

        // Seed some energy resources
        db.get("SELECT count(*) as count FROM energy_resources", (err, row) => {
            if (row && parseInt(row.count) === 0) {
                db.run("INSERT INTO energy_resources (name, type, latitude, longitude, capacity_mw, battery_level, smart_grid_active) VALUES ($1, $2, $3, $4, $5, $6, $7)", 
                    ['Centrale Solaire Boundiali', 'solar', 9.52, -6.48, 37.5, 80, true]);
                db.run("INSERT INTO energy_resources (name, type, latitude, longitude, capacity_mw, battery_level, smart_grid_active) VALUES ($1, $2, $3, $4, $5, $6, $7)", 
                    ['Micro-réseau Biomasse Tiassalé', 'biomass', 5.89, -4.82, 5.0, 45, false]);
            }
        });

        // Seed some quiz data if empty
        db.get("SELECT count(*) as count FROM quizzes", (err, row) => {
            if (row && parseInt(row.count) === 0) {
                db.run("INSERT INTO quizzes (title, category) VALUES ('Guerrier de l Eau', 'EAU') RETURNING id", function(err, result) {
                    const quizId = result ? result.rows[0].id : 1;
                    db.run("INSERT INTO questions (quiz_id, question, options, correct_index) VALUES ($1, $2, $3, $4)", 
                        [quizId, 'Quelle est la principale source de pollution plastique des lagunes ?', JSON.stringify(['Déchets ménagers', 'Pluie', 'Poissons', 'Sable']), 0]);
                    db.run("INSERT INTO questions (quiz_id, question, options, correct_index) VALUES ($1, $2, $3, $4)", 
                        [quizId, 'Combien de temps faut-il à une bouteille plastique pour se décomposer ?', JSON.stringify(['10 ans', '100 ans', '450 ans', 'Jamais']), 2]);
                });
            }
        });

        // Seed some sensor data if empty
        db.get("SELECT count(*) as count FROM sensors", (err, row) => {
            if (row && parseInt(row.count) === 0) {
                db.run("INSERT INTO sensors (type, location_name, latitude, longitude, api_endpoint, carbon_baseline) VALUES ($1, $2, $3, $4, $5, $6)", 
                    ['air_quality', 'Lagune Ébrié - Capteurs Air', 5.2750, -4.0250, 'https://api.example.com/sensor/air', 400]);
                db.run("INSERT INTO sensors (type, location_name, latitude, longitude, api_endpoint, carbon_baseline) VALUES ($1, $2, $3, $4, $5, $6)", 
                    ['water_level', 'Rivière Comoé - Niveau Eau', 6.5, -3.5, 'https://api.example.com/sensor/water', 0]);
                db.run("INSERT INTO sensors (type, location_name, latitude, longitude, api_endpoint, carbon_baseline) VALUES ($1, $2, $3, $4, $5, $6)", 
                    ['temperature', 'Forêt du Banco - Température', 5.3855, -4.0435, 'https://api.example.com/sensor/temp', 25]);
            }
        });

        // Seed water resources
        db.get("SELECT count(*) as count FROM water_resources", (err, row) => {
            if (row && parseInt(row.count) === 0) {
                db.run("INSERT INTO water_resources (name, type, latitude, longitude, quality_baseline, pollution_level) VALUES ($1, $2, $3, $4, $5, $6)", 
                    ['Rivière Comoé', 'river', 6.5, -3.5, '{\"pH\": 7.0, \"turbidity\": 5}', 2.5]);
                db.run("INSERT INTO water_resources (name, type, latitude, longitude, quality_baseline, pollution_level) VALUES ($1, $2, $3, $4, $5, $6)", 
                    ['Lac Ébrié', 'lake', 5.2750, -4.0250, '{\"pH\": 6.8, \"turbidity\": 3}', 1.0]);
            }
        });

        // Seed mining sites
        db.get("SELECT count(*) as count FROM mining_sites", (err, row) => {
            if (row && parseInt(row.count) === 0) {
                db.run("INSERT INTO mining_sites (name, resource_type, latitude, longitude, extraction_rate, environmental_impact) VALUES ($1, $2, $3, $4, $5, $6)", 
                    ['Mine d\'or de Bonikro', 'gold', 6.8, -3.2, 50, 7.5]);
                db.run("INSERT INTO mining_sites (name, resource_type, latitude, longitude, extraction_rate, environmental_impact) VALUES ($1, $2, $3, $4, $5, $6)", 
                    ['Carrière de bauxite Sangaredi', 'bauxite', 11.1, -13.5, 2000, 8.0]);
            }
        });

        // Seed oil fields
        db.get("SELECT count(*) as count FROM oil_fields", (err, row) => {
            if (row && parseInt(row.count) === 0) {
                db.run("INSERT INTO oil_fields (name, type, latitude, longitude, production_rate, leak_risk) VALUES ($1, $2, $3, $4, $5, $6)", 
                    ['Champ pétrolier d\'Espoir', 'onshore', 5.0, -6.0, 15000, 3.5]);
                db.run("INSERT INTO oil_fields (name, type, latitude, longitude, production_rate, leak_risk) VALUES ($1, $2, $3, $4, $5, $6)", 
                    ['Plateforme offshore CI-27', 'offshore', 4.5, -3.5, 25000, 2.0]);
            }
        });

        db.get("SELECT count(*) as count FROM quizzes", (err, row) => {
            if (row && parseInt(row.count) === 0) {
                db.run("INSERT INTO quizzes (title, category) VALUES ('Guerrier de l Eau', 'EAU') RETURNING id", function(err, result) {
                    const quizId = result ? result.rows[0].id : 1;
                    db.run("INSERT INTO questions (quiz_id, question, options, correct_index) VALUES ($1, $2, $3, $4)", 
                        [quizId, 'Quelle est la principale source de pollution plastique des lagunes ?', JSON.stringify(['Déchets ménagers', 'Pluie', 'Poissons', 'Sable']), 0]);
                    db.run("INSERT INTO questions (quiz_id, question, options, correct_index) VALUES ($1, $2, $3, $4)", 
                        [quizId, 'Combien de temps faut-il à une bouteille plastique pour se décomposer ?', JSON.stringify(['10 ans', '100 ans', '450 ans', 'Jamais']), 2]);
                });
            }
        });

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
