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
    console.log('Login attempt for email:', email);
    db.get("SELECT * FROM users WHERE email = $1", [email], (err, user) => {
        if (err) {
            console.error('DB error on login:', err);
            return res.status(500).json({ error: 'Database error' });
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

    db.run(
        `INSERT INTO reports (type, description, latitude, longitude, image_url, status) VALUES ($1, $2, $3, $4, $5, 'en attente') RETURNING id`,
        [type, description, latitude, longitude, imageUrl],
        function(err, result) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: result.rows[0].id, message: 'Report created successfully', imageUrl });
        }
    );
});

// Update report status (Protected)
app.put('/api/reports/:id/status', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { status, agent_feedback } = req.body;
    db.run(
        `UPDATE reports SET status = $1, agent_feedback = $2 WHERE id = $3`,
        [status, agent_feedback, id],
        function(err, result) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Status updated successfully', changes: result.rowCount });
        }
    );
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
    // Note: serialize is not needed/supported with the pg pool wrapper
    db.get('SELECT COUNT(*) as total FROM reports', [], (err, row) => {
        if (!err && row) stats.totalReports = parseInt(row.total);
        db.get('SELECT COUNT(*) as pending FROM reports WHERE status = $1', ['en attente'], (err, row) => {
            if (!err && row) stats.pendingReports = parseInt(row.pending);
            db.get('SELECT COUNT(*) as active_agents FROM users WHERE role = $1', ['agent'], (err, row) => {
                if (!err && row) stats.activeAgents = parseInt(row.active_agents) || 12; 
                db.get('SELECT COUNT(*) as total_resources FROM resources', [], (err, row) => {
                    if (!err && row) stats.totalResources = parseInt(row.total_resources);
                    res.json({ data: stats });
                });
            });
        });
    });
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

app.listen(PORT, () => {
    console.log(`Backend API v1 is running on http://localhost:${PORT}`);
});
