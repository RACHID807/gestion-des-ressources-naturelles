require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'eco-citoyen-fallback-secret-key-2026';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve the frontend files from the parent directory
app.use(express.static(path.join(__dirname, '../')));

// Multer Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Basic health check
app.get('/api/status', (req, res) => {
    res.json({ status: 'Online', service: 'Ressources Naturelles API' });
});

// Database connection test
app.get('/api/test-db', (req, res) => {
    db.get("SELECT count(*) as count FROM users", (err, row) => {
        if (err) return res.status(500).json({ error: "DB Connection failed", details: err.message });
        res.json({ status: "connected", userCount: row ? row.count : 0 });
    });
});

// --- AUTHENTICATION MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// Register (Citizens)
app.post('/api/auth/register', (req, res) => {
    const { name, email, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run("INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id", [name, email, hashedPassword, 'citoyen'], function(err, result) {
        if (err) return res.status(500).json({ error: "Email déjà utilisé" });
        res.json({ id: result.rows[0].id, message: "Utilisateur créé avec succès" });
    });
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    console.log('--- LOGIN ATTEMPT ---');
    console.log('Email:', email);
    
    db.get("SELECT * FROM users WHERE email = $1", [email], (err, user) => {
        if (err) {
            console.error('❌ DB error on login:', err.message);
            return res.status(500).json({ error: 'Erreur base de données', details: err.message });
        }
        if (!user) {
            console.warn('User not found for email:', email);
            return res.status(401).json({ error: "Utilisateur non trouvé" });
        }
        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) {
            console.warn('Invalid password for email:', email);
            return res.status(401).json({ error: "Mot de passe incorrect" });
        }
        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ message: 'Login successful', token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    });
});

// --- RESOURCES API ---
app.get('/api/resources', (req, res) => {
    db.all('SELECT * FROM resources', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// --- REPORTS API ---
app.get('/api/reports', (req, res) => {
    const sql = `
        SELECT r.*, u.name as assigned_agent_name 
        FROM reports r 
        LEFT JOIN users u ON r.assigned_to = u.id 
        ORDER BY r.created_at DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// --- REPORTS API (Protected) ---
app.post('/api/reports', authenticateToken, upload.single('image'), (req, res) => {
    const { type, description, latitude, longitude } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const userId = req.user.id; // From token

    db.run(
        `INSERT INTO reports (user_id, type, description, latitude, longitude, image_url, status) VALUES ($1, $2, $3, $4, $5, $6, 'en attente') RETURNING id`,
        [userId, type, description, latitude, longitude, imageUrl],
        function(err, result) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: result.rows[0].id, message: 'Report created successfully', imageUrl });
        }
    );
});

// Update report status (Protected)
app.put('/api/reports/:id/status', authenticateToken, upload.single('after_image'), (req, res) => {
    const { id } = req.params;
    const { status, agent_feedback } = req.body;
    const afterImageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    let sql = `UPDATE reports SET status = $1, agent_feedback = $2 WHERE id = $3`;
    let params = [status, agent_feedback, id];

    if (afterImageUrl) {
        sql = `UPDATE reports SET status = $1, agent_feedback = $2, after_image_url = $3 WHERE id = $4`;
        params = [status, agent_feedback, afterImageUrl, id];
    }

    db.run(sql, params, function(err, result) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Status updated successfully', afterImageUrl });
    });
});

// --- CITIZEN PERSONAL DATA ---
app.get('/api/my-reports', authenticateToken, (req, res) => {
    db.all('SELECT * FROM reports WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.get('/api/my-rewards', authenticateToken, (req, res) => {
    db.all('SELECT * FROM rewards WHERE user_id = $1 ORDER BY granted_at DESC', [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const totalPoints = rows.reduce((sum, r) => sum + (r.points || 0), 0);
        res.json({ data: rows, totalPoints });
    });
});

// Assign report to agent (Protected - Admin Only)
app.put('/api/reports/:id/assign', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { id } = req.params;
    const { assigned_to, priority_level, deadline } = req.body;

    db.run(
        `UPDATE reports SET assigned_to = $1, priority_level = $2, deadline = $3, status = 'en cours' WHERE id = $4`,
        [assigned_to, priority_level || 'normal', deadline, id],
        function(err, result) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Report assigned with logistics successfully', changes: result.rowCount });
        }
    );
});

// Request budget/materials (Agent Only)
app.put('/api/reports/:id/logistics', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { budget_requested, materials_needed } = req.body;
    db.run(
        `UPDATE reports SET budget_requested = $1, materials_needed = $2 WHERE id = $3`,
        [budget_requested, materials_needed, id],
        function(err, result) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Logistics request sent' });
        }
    );
});

// Rate agent work (Admin Only)
app.put('/api/reports/:id/rate', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { id } = req.params;
    const { rating, impact_score } = req.body;
    
    db.run(
        `UPDATE reports SET admin_rating = $1, impact_score = $2 WHERE id = $3`,
        [rating, impact_score, id],
        function(err, result) {
            if (err) return res.status(500).json({ error: err.message });
            
            // Auto-grant points to agent
            db.get("SELECT assigned_to FROM reports WHERE id = $1", [id], (err, report) => {
                if (report && report.assigned_to) {
                    const points = (rating * 10) + (impact_score / 2);
                    db.run("INSERT INTO rewards (user_id, points, badge_name) VALUES ($1, $2, $3)", 
                        [report.assigned_to, points, rating >= 4 ? 'Elite Eco-Hero' : 'Mission accomplie']);
                }
            });

            res.json({ message: 'Agent rated and points granted' });
        }
    );
});

// --- ARTICLES & SENSITIZATION ---
app.get('/api/articles', (req, res) => {
    db.all('SELECT * FROM articles ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.post('/api/articles', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { title, content, category, image_url } = req.body;
    db.run(
        "INSERT INTO articles (title, content, category, image_url) VALUES ($1, $2, $3, $4) RETURNING id",
        [title, content, category, image_url],
        function(err, result) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: result.rows[0].id, message: "Article publié" });
        }
    );
});

// --- LEADERBOARD ---
app.get('/api/leaderboard', (req, res) => {
    const sql = `
        SELECT u.name, SUM(r.points) as total_points, COUNT(r.id) as badges 
        FROM users u 
        LEFT JOIN rewards r ON u.id = r.user_id 
        WHERE u.role = 'agent' 
        GROUP BY u.id, u.name 
        ORDER BY total_points DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// --- STATS API (Protected) ---
app.get('/api/stats', authenticateToken, (req, res) => {
    const stats = {};
    
    const queries = [
        { key: 'totalReports', sql: 'SELECT COUNT(*) as val FROM reports' },
        { key: 'pendingReports', sql: 'SELECT COUNT(*) as val FROM reports WHERE status = $1', params: ['en attente'] },
        { key: 'activeAgents', sql: 'SELECT COUNT(*) as val FROM users WHERE role = $1', params: ['agent'] },
        { key: 'totalResources', sql: 'SELECT COUNT(*) as val FROM resources' },
        { key: 'totalSensors', sql: 'SELECT COUNT(*) as val FROM sensors' },
        { key: 'totalCarbonSaved', sql: 'SELECT SUM(carbon_impact) as val FROM sensor_readings' },
        { key: 'totalWaterResources', sql: 'SELECT COUNT(*) as val FROM water_resources' },
        { key: 'pollutedWater', sql: 'SELECT COUNT(*) as val FROM water_resources WHERE status != \'clean\'' },
        { key: 'totalMiningSites', sql: 'SELECT COUNT(*) as val FROM mining_sites' },
        { key: 'highImpactMining', sql: 'SELECT COUNT(*) as val FROM mining_sites WHERE environmental_impact > 7' },
        { key: 'totalOilFields', sql: 'SELECT COUNT(*) as val FROM oil_fields' },
        { key: 'leakingOilFields', sql: 'SELECT COUNT(*) as val FROM oil_fields WHERE status = \'leaking\'' },
        { key: 'byType', sql: 'SELECT type, COUNT(*) as count FROM reports GROUP BY type' },
        { key: 'byPriority', sql: 'SELECT priority_level, COUNT(*) as count FROM reports GROUP BY priority_level' }
    ];

    let completed = 0;
    queries.forEach(q => {
        db.all(q.sql, q.params || [], (err, rows) => {
            if (!err && rows) {
                if (q.key.startsWith('by')) {
                    stats[q.key] = rows;
                } else {
                    stats[q.key] = parseInt(rows[0].val);
                }
            }
            completed++;
            if (completed === queries.length) {
                res.json({ data: stats });
            }
        });
    });
});

// --- AI SIMULATION API ---
app.post('/api/ai/analyze', authenticateToken, upload.single('image'), (req, res) => {
    // Simulate AI processing delay
    setTimeout(() => {
        const types = ['pollution', 'dechets', 'deforestation'];
        const randomType = types[Math.floor(Math.random() * types.length)];
        const confidence = (Math.random() * (0.99 - 0.85) + 0.85).toFixed(2);
        
        res.json({ 
            detectedType: randomType, 
            confidence: confidence,
            message: "Analyse terminée avec succès" 
        });
    }, 2000);
});

// --- INTERNAL NOTES API ---
app.get('/api/reports/:id/notes', authenticateToken, (req, res) => {
    const sql = `
        SELECT n.*, u.name as user_name 
        FROM internal_notes n 
        JOIN users u ON n.user_id = u.id 
        WHERE n.report_id = $1 
        ORDER BY n.created_at ASC
    `;
    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.post('/api/reports/:id/notes', authenticateToken, (req, res) => {
    const { content } = req.body;
    db.run(
        "INSERT INTO internal_notes (report_id, user_id, content) VALUES ($1, $2, $3)",
        [req.params.id, req.user.id, content],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Note ajoutée" });
        }
    );
});

// --- QUIZ API ---
app.get('/api/quizzes', (req, res) => {
    db.all('SELECT * FROM quizzes', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.get('/api/quizzes/:id/questions', authenticateToken, (req, res) => {
    db.all('SELECT * FROM questions WHERE quiz_id = $1', [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Parse JSON options
        const questions = rows.map(r => ({ ...r, options: JSON.parse(r.options) }));
        res.json({ data: questions });
    });
});

app.post('/api/quizzes/:id/submit', authenticateToken, (req, res) => {
    const { score } = req.body;
    const quizId = req.params.id;
    const userId = req.user.id;

    db.run(
        "INSERT INTO user_quiz_results (user_id, quiz_id, score) VALUES ($1, $2, $3)",
        [userId, quizId, score],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            // If score is perfect or high, grant bonus points
            if (score >= 80) {
                db.run("INSERT INTO rewards (user_id, points, badge_name) VALUES ($1, $2, $3)", 
                    [userId, 50, 'Génie de l\'Environnement']);
            }
            
            res.json({ message: "Score enregistré", bonus: score >= 80 });
        }
    );
});

// --- USERS API (Protected - Admin Only) ---
app.get('/api/users', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    db.all('SELECT id, name, email, role FROM users ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.post('/api/users', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ error: "Tous les champs sont requis" });

    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run("INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id", [name, email, hashedPassword, role], function(err, result) {
        if (err) return res.status(500).json({ error: "Email déjà utilisé ou erreur serveur" });
        res.json({ id: result.rows[0].id, message: "Utilisateur créé avec succès" });
    });
});

// --- SENSORS & CARBON IMPACT API ---
app.get('/api/sensors', authenticateToken, (req, res) => {
    db.all('SELECT * FROM sensors ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.post('/api/sensors/:id/reading', (req, res) => {
    const { id } = req.params;
    const { data } = req.body; // Sensor data, e.g., { pm25: 350, temperature: 28 }

    // Calculate carbon impact based on sensor type
    let carbonImpact = 0;
    db.get("SELECT * FROM sensors WHERE id = $1", [id], (err, sensor) => {
        if (err || !sensor) return res.status(404).json({ error: "Capteur non trouvé" });

        if (sensor.type === 'air_quality' && data.pm25) {
            // CO2 saved: if PM2.5 below baseline, estimate reduction
            const reduction = Math.max(0, sensor.carbon_baseline - data.pm25);
            carbonImpact = reduction * 0.1; // Arbitrary formula: 0.1 kg CO2 per unit PM2.5 reduction
        } else if (sensor.type === 'water_level' && data.level) {
            // For water: if level stable, assume less pollution runoff
            carbonImpact = data.level > 0 ? 0.5 : 0; // Simple positive impact
        } else if (sensor.type === 'temperature' && data.temp) {
            // Temperature: cooler = better for carbon sequestration
            carbonImpact = Math.max(0, (30 - data.temp) * 0.2);
        }

        // Update sensor last_reading
        db.run("UPDATE sensors SET last_reading = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [JSON.stringify(data), id]);

        // Insert reading history
        db.run("INSERT INTO sensor_readings (sensor_id, reading_data, carbon_impact) VALUES ($1, $2, $3)", 
            [id, JSON.stringify(data), carbonImpact]);

        res.json({ message: "Lecture enregistrée", carbonImpact, sensor: sensor.type });
    });
});

app.get('/api/carbon-impact', (req, res) => {
    // Calculate total carbon impact from all readings
    db.all("SELECT SUM(carbon_impact) as total FROM sensor_readings", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const totalCarbonSaved = rows[0].total || 0;

        // Additional metrics: total trees equivalent (1 tree ~ 20kg CO2/year)
        const treesEquivalent = Math.floor(totalCarbonSaved / 20);

        res.json({ 
            totalCarbonSaved: parseFloat(totalCarbonSaved.toFixed(2)), 
            treesEquivalent,
            unit: "kg CO2"
        });
    });
});

// --- WATER RESOURCES API ---
app.get('/api/water-resources', authenticateToken, (req, res) => {
    db.all('SELECT * FROM water_resources ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.post('/api/water-resources/:id/quality', (req, res) => {
    const { id } = req.params;
    const { pH, turbidity, contaminants } = req.body;

    db.get("SELECT * FROM water_resources WHERE id = $1", [id], (err, resource) => {
        if (err || !resource) return res.status(404).json({ error: "Ressource non trouvée" });

        const baseline = JSON.parse(resource.quality_baseline || '{}');
        let pollutionChange = 0;
        let carbonImpact = 0;

        // Calculate pollution level change
        if (pH && baseline.pH) pollutionChange += Math.abs(pH - baseline.pH) * 10;
        if (turbidity && baseline.turbidity) pollutionChange += Math.max(0, turbidity - baseline.turbidity);

        // CO2 impact: pollution reduction saves CO2 (water treatment avoided)
        carbonImpact = Math.max(0, (resource.pollution_level - pollutionChange) * 0.5);

        // Update resource
        db.run("UPDATE water_resources SET pollution_level = $1, carbon_impact = carbon_impact + $2, status = CASE WHEN $1 > 5 THEN 'critical' WHEN $1 > 2 THEN 'polluted' ELSE 'clean' END WHERE id = $3", 
            [pollutionChange, carbonImpact, id]);

        res.json({ message: "Qualité mise à jour", pollutionChange, carbonImpact });
    });
});

// --- MINING SITES API ---
app.get('/api/mining-sites', authenticateToken, (req, res) => {
    db.all('SELECT * FROM mining_sites ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.post('/api/mining-sites/:id/impact', (req, res) => {
    const { id } = req.params;
    const { extraction_rate, dust_level, noise_level } = req.body;

    db.get("SELECT * FROM mining_sites WHERE id = $1", [id], (err, site) => {
        if (err || !site) return res.status(404).json({ error: "Site non trouvé" });

        let environmentalImpact = site.environmental_impact;
        let carbonEmissions = site.carbon_emissions;

        // Update based on readings
        if (dust_level > 50) environmentalImpact += 0.5; // Dust increases impact
        if (noise_level > 80) environmentalImpact += 0.3;
        if (extraction_rate > site.extraction_rate) carbonEmissions += (extraction_rate - site.extraction_rate) * 0.01; // CO2 per ton

        // Update site
        db.run("UPDATE mining_sites SET extraction_rate = $1, environmental_impact = $2, carbon_emissions = $3 WHERE id = $4", 
            [extraction_rate, environmentalImpact, carbonEmissions, id]);

        res.json({ message: "Impact mis à jour", environmentalImpact, carbonEmissions });
    });
});

// --- OIL FIELDS API ---
app.get('/api/oil-fields', authenticateToken, (req, res) => {
    db.all('SELECT * FROM oil_fields ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.post('/api/oil-fields/:id/leak', (req, res) => {
    const { id } = req.params;
    const { leak_detected, production_rate, methane_level } = req.body;

    db.get("SELECT * FROM oil_fields WHERE id = $1", [id], (err, field) => {
        if (err || !field) return res.status(404).json({ error: "Champ non trouvé" });

        let carbonEmissions = field.carbon_emissions;
        let status = field.status;

        if (leak_detected) {
            carbonEmissions += 1000; // Major leak impact
            status = 'leaking';
        } else if (methane_level > 10) {
            carbonEmissions += methane_level * 25; // Methane is potent GHG
        }

        // Update field
        db.run("UPDATE oil_fields SET production_rate = $1, carbon_emissions = $2, status = $3 WHERE id = $4", 
            [production_rate, carbonEmissions, status, id]);

        res.json({ message: "État mis à jour", carbonEmissions, status });
    });
});

// --- ENERGY RESOURCES API ---
app.get('/api/energy-resources', authenticateToken, (req, res) => {
    db.all('SELECT * FROM energy_resources ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.put('/api/energy-resources/:id/toggle-smart-grid', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.get("SELECT smart_grid_active FROM energy_resources WHERE id = $1", [id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Ressource non trouvée" });
        const newValue = !row.smart_grid_active;
        db.run("UPDATE energy_resources SET smart_grid_active = $1 WHERE id = $2", [newValue, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Smart Grid mis à jour", smart_grid_active: newValue });
        });
    });
});

// --- ADVANCED MANAGEMENT TOGGLES ---
app.put('/api/water-resources/:id/toggle-smart-meter', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.get("SELECT smart_meter_active FROM water_resources WHERE id = $1", [id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Ressource non trouvée" });
        const newValue = !row.smart_meter_active;
        db.run("UPDATE water_resources SET smart_meter_active = $1 WHERE id = $2", [newValue, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Smart Meter mis à jour", smart_meter_active: newValue });
        });
    });
});

app.put('/api/mining-sites/:id/toggle-bioleaching', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.get("SELECT bioleaching_active FROM mining_sites WHERE id = $1", [id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Site non trouvé" });
        const newValue = !row.bioleaching_active;
        let scoreQuery = newValue ? ", compliance_score = LEAST(100, compliance_score + 10)" : ", compliance_score = GREATEST(0, compliance_score - 10)";
        
        db.run(`UPDATE mining_sites SET bioleaching_active = $1 ${scoreQuery} WHERE id = $2`, [newValue, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Biolixiviation mise à jour", bioleaching_active: newValue });
        });
    });
});

// --- PUBLIC COMMUNITY STATS ---
app.get('/api/public/community-resources', (req, res) => {
    const stats = {
        smartWaterPercentage: 0,
        averageBatteryLevel: 0,
        averageCompliance: 0
    };

    const queries = [
        { key: 'smartWater', sql: "SELECT COUNT(*) as total, SUM(CASE WHEN smart_meter_active THEN 1 ELSE 0 END) as smart FROM water_resources" },
        { key: 'batteryLevel', sql: "SELECT AVG(battery_level) as avg_bat FROM energy_resources" },
        { key: 'compliance', sql: "SELECT AVG(compliance_score) as avg_comp FROM mining_sites" }
    ];

    let completed = 0;
    queries.forEach(q => {
        db.all(q.sql, [], (err, rows) => {
            if (!err && rows && rows.length > 0) {
                if (q.key === 'smartWater') {
                    const total = rows[0].total || 0;
                    const smart = rows[0].smart || 0;
                    stats.smartWaterPercentage = total > 0 ? Math.round((smart / total) * 100) : 0;
                } else if (q.key === 'batteryLevel') {
                    stats.averageBatteryLevel = Math.round(rows[0].avg_bat || 0);
                } else if (q.key === 'compliance') {
                    stats.averageCompliance = Math.round(rows[0].avg_comp || 0);
                }
            }
            completed++;
            if (completed === queries.length) {
                res.json({ data: stats });
            }
        });
    });
});

// --- EXTENDED STATS ---
app.get('/api/extended-stats', authenticateToken, (req, res) => {
    const stats = {};

    const queries = [
        { key: 'totalWaterResources', sql: 'SELECT COUNT(*) as val FROM water_resources' },
        { key: 'pollutedWater', sql: 'SELECT COUNT(*) as val FROM water_resources WHERE status != \'clean\'' },
        { key: 'totalMiningSites', sql: 'SELECT COUNT(*) as val FROM mining_sites' },
        { key: 'highImpactMining', sql: 'SELECT COUNT(*) as val FROM mining_sites WHERE environmental_impact > 7' },
        { key: 'totalOilFields', sql: 'SELECT COUNT(*) as val FROM oil_fields' },
        { key: 'leakingOilFields', sql: 'SELECT COUNT(*) as val FROM oil_fields WHERE status = \'leaking\'' },
        { key: 'totalCarbonFromResources', sql: 'SELECT (SELECT SUM(carbon_impact) FROM water_resources) + (SELECT SUM(carbon_emissions) FROM mining_sites) + (SELECT SUM(carbon_emissions) FROM oil_fields) as val' }
    ];

    let completed = 0;
    queries.forEach(q => {
        db.all(q.sql, q.params || [], (err, rows) => {
            if (!err && rows) {
                stats[q.key] = parseInt(rows[0].val) || 0;
            }
            completed++;
            if (completed === queries.length) {
                res.json({ data: stats });
            }
        });
    });
});

app.listen(PORT, () => {
    console.log(`Backend API v1 is running on http://localhost:${PORT}`);
});

module.exports = app;
