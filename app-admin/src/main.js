const authSection = document.getElementById('auth-section');
const mainSection = document.getElementById('main-section');
const loginForm = document.getElementById('login-form');
const navLogout = document.getElementById('nav-logout');
const tableBody = document.getElementById('admin-reports-table');
const usersTableBody = document.getElementById('admin-users-table');
const addAgentForm = document.getElementById('add-agent-form');

const API_URL = '/api';
let statusChartInstance = null;
let adminMap = null;
let markerLayer = null;
let agentsList = []; // Cache for assignment

// --- SUPABASE REALTIME CONFIG ---
const SUPABASE_URL = 'https://obrujgpbduzsenllwxgx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9icnVqZ3BiZHV6c2VubGx3eGd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjcxMjQsImV4cCI6MjA5Mjk0MzEyNH0.CW93l7Ki_IPyLha0fdg6SjmytKECskB3DDor2tRWBG8';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function initRealtime() {
    console.log("Connexion au flux Temps Réel...");
    supabase
        .channel('schema-db-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'reports' },
            (payload) => {
                console.log('Changement détecté en direct!', payload);
                if (payload.eventType === 'INSERT') {
                    showAdminNotification("⚠️ NOUVELLE ALERTE REÇUE EN DIRECT !");
                } else if (payload.eventType === 'UPDATE') {
                    showAdminNotification("ℹ️ Statut mis à jour en direct");
                }
                loadDashboard(); // Refresh UI automatically
            }
        )
        .subscribe();
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('admin-id').value;
    const password = document.getElementById('password').value;
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if(res.ok) {
            if (data.user.role !== 'admin') {
                return alert("Accès réservé aux administrateurs");
            }
            localStorage.setItem('eco_token', data.token);
            localStorage.setItem('eco_user', JSON.stringify(data.user));
            document.getElementById('admin-user-name').textContent = data.user.name;
            document.getElementById('admin-user-avatar').textContent = data.user.name.charAt(0).toUpperCase();
            authSection.classList.replace('active', 'hidden');
            mainSection.classList.replace('hidden', 'active');
            loadDashboard();
            initRealtime(); 
        } else {
            alert(data.error || "Erreur de connexion");
        }
    } catch(err) {
        alert("Erreur de connexion serveur");
    }
});

navLogout.addEventListener('click', () => {
    localStorage.removeItem('eco_token');
    localStorage.removeItem('eco_user');
    mainSection.classList.replace('active', 'hidden');
    authSection.classList.replace('hidden', 'active');
});

// Auto-login check
window.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('eco_token');
    if (token) {
        const user = JSON.parse(localStorage.getItem('eco_user'));
        if (user) {
            document.getElementById('admin-user-name').textContent = user.name;
            document.getElementById('admin-user-avatar').textContent = user.name.charAt(0).toUpperCase();
        }
        authSection.classList.replace('active', 'hidden');
        mainSection.classList.replace('hidden', 'active');
        loadDashboard();
        initRealtime(); // Start listening
    }
});

// Sidebar UX basic
const navItems = document.querySelectorAll('.sidebar li');
const views = document.querySelectorAll('.dashboard-content');

navItems.forEach(item => {
    if(item.id !== 'nav-logout') {
        item.addEventListener('click', () => {
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // Hide all views
            views.forEach(v => v.classList.add('hidden'));

            if(item.id === 'nav-dashboard') {
                views[0].classList.remove('hidden');
                loadDashboard();
            } else if(item.id === 'nav-users') {
                document.getElementById('users-view').classList.remove('hidden');
                loadUsers();
            } else if(item.id === 'nav-leaderboard') {
                document.getElementById('leaderboard-view').classList.remove('hidden');
                loadLeaderboard();
            } else if(item.id === 'nav-sensitization') {
                document.getElementById('sensitization-view').classList.remove('hidden');
                loadArticles();
            }
        });
    }
});

// --- DATA FETCHING ---
async function loadDashboard() {
    try {
        const token = localStorage.getItem('eco_token');
        const headers = { 'Authorization': `Bearer ${token}` };

        // Fetch Stats
        const statRes = await fetch(`${API_URL}/stats`, { headers });
        if (statRes.status === 401) return navLogout.click();
        const { data: stats } = await statRes.json();
        
        // Fetch Reports
        const repRes = await fetch(`${API_URL}/reports`, { headers });
        const { data: reports } = await repRes.json();

        // Update Stat Cards (with querySelector fallback for simplicity)
        const values = document.querySelectorAll('.stat-card .value');
        if(values.length >= 4) {
            values[0].textContent = stats.totalReports || 0;
            values[1].textContent = stats.pendingReports || 0;
            values[2].textContent = stats.activeAgents || 0;
            values[3].textContent = stats.totalResources || 0;
        }

        // Fetch Agents for assignment
        const userRes = await fetch(`${API_URL}/users`, { headers });
        const { data: users } = await userRes.json();
        agentsList = users.filter(u => u.role === 'agent');

        renderTable(reports);
        renderChart(reports);
        renderAdminMap(reports);

    } catch(err) {
        console.error("Dashboard Load Error", err);
    }
}

function renderTable(reports) {
    tableBody.innerHTML = '';
    // Show only latest 10
    const latest = reports.slice(0, 10);
    latest.forEach(alert => {
        let statusStyle = alert.status === 'en attente' ? 'color: #e74c3c; font-weight: bold;' : 
                         alert.status === 'en cours' ? 'color: #f39c12;' : 'color: #27ae60;';
        
        let assignmentHtml = alert.assigned_agent_name 
            ? `<span style="font-size: 0.85rem; color: #34495e;">👤 ${alert.assigned_agent_name}</span>`
            : `<button class="btn-small primary" onclick="showAssignModal(${alert.id})">Assigner Agent</button>`;

        let feedbackHtml = alert.agent_feedback 
            ? `<div style="font-size: 0.8rem; color: #7f8c8d; font-style: italic; margin-top: 4px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${alert.agent_feedback}">📝 ${alert.agent_feedback}</div>`
            : '';

        tableBody.innerHTML += `
            <tr>
                <td style="font-weight: 600;">#${alert.id}</td>
                <td style="color: #7f8c8d;">${new Date(alert.created_at).toLocaleString('fr-FR')}</td>
                <td>${alert.type}</td>
                <td>${assignmentHtml}${feedbackHtml}</td>
                <td style="font-size: 0.85rem;">${alert.latitude?.toFixed(2)}, ${alert.longitude?.toFixed(2)}</td>
                <td style="${statusStyle}">${alert.status}</td>
                <td>
                    <button class="btn-small" onclick="showReportDetails(${alert.id})">Voir</button>
                    ${alert.image_url ? `<button class="btn-small" onclick="window.open('http://localhost:3000${alert.image_url}')">📷</button>` : ''}
                </td>
            </tr>
        `;
    });
}

// Assignment Modal Logic
window.showAssignModal = (reportId) => {
    const modalHtml = `
        <div id="assign-modal" class="modal-overlay">
            <div class="modal-content glass">
                <h3>Assigner l'Alerte #${reportId}</h3>
                <p>Définissez les paramètres de la mission :</p>
                
                <label style="display:block; text-align:left; margin-bottom:5px; font-weight:600;">Agent :</label>
                <select id="agent-select" class="modern-select">
                    <option value="">-- Sélectionner un Agent --</option>
                    ${agentsList.map(a => `<option value="${a.id}">${a.name} (${a.email})</option>`).join('')}
                </select>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                    <div>
                        <label style="display:block; text-align:left; margin-bottom:5px; font-weight:600;">Priorité :</label>
                        <select id="priority-select" class="modern-select" style="margin-bottom:0;">
                            <option value="normal">Normal</option>
                            <option value="bas">Bas</option>
                            <option value="urgent">🚨 Urgent</option>
                        </select>
                    </div>
                    <div>
                        <label style="display:block; text-align:left; margin-bottom:5px; font-weight:600;">Date limite :</label>
                        <input type="date" id="deadline-input" class="modern-select" style="margin-bottom:0; padding: 10px;" />
                    </div>
                </div>

                <div class="modal-actions">
                    <button class="btn-secondary" onclick="closeAssignModal()">Annuler</button>
                    <button class="btn-primary" onclick="confirmAssignment(${reportId})">Lancer la Mission</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.closeAssignModal = () => {
    const modal = document.getElementById('assign-modal');
    if(modal) modal.remove();
};

window.confirmAssignment = async (reportId) => {
    const agentId = document.getElementById('agent-select').value;
    const priority = document.getElementById('priority-select').value;
    const deadline = document.getElementById('deadline-input').value;

    if(!agentId) return alert("Veuillez choisir un agent");

    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/reports/${reportId}/assign`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                assigned_to: parseInt(agentId),
                priority_level: priority,
                deadline: deadline || null
            })
        });
        
        if(res.ok) {
            alert("Mission lancée avec succès !");
            closeAssignModal();
            loadDashboard(); // Refresh
        } else {
            alert("Erreur lors de l'assignation");
        }
    } catch(err) {
        alert("Erreur serveur");
    }
};

window.showReportDetails = async (reportId) => {
    const token = localStorage.getItem('eco_token');
    const res = await fetch(`${API_URL}/reports`, { headers: { 'Authorization': `Bearer ${token}` } });
    const { data: reports } = await res.json();
    const report = reports.find(r => r.id === reportId);

    if(!report) return;

    const deadlineStr = report.deadline ? new Date(report.deadline).toLocaleDateString() : 'Aucune';
    const priorityColor = report.priority_level === 'urgent' ? '#e74c3c' : report.priority_level === 'bas' ? '#95a5a6' : '#2ecc71';

    const modalHtml = `
        <div id="details-modal" class="modal-overlay">
            <div class="modal-content glass" style="text-align: left; max-width: 700px; max-height: 90vh; overflow-y: auto;">
                <h3 style="margin-bottom: 20px; border-bottom: 2px solid var(--primary-color); padding-bottom: 10px;">Détails du Signalement #${report.id}</h3>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div>
                        <p><strong>Type :</strong> ${report.type}</p>
                        <p><strong>Priorité :</strong> <span style="color: ${priorityColor}; font-weight: 800; text-transform: uppercase;">${report.priority_level}</span></p>
                        <p><strong>Date Limite :</strong> <span style="color: #e67e22; font-weight: 600;">${deadlineStr}</span></p>
                    </div>
                    <div>
                        <p><strong>Agent :</strong> ${report.assigned_agent_name || 'Non assigné'}</p>
                        <p><strong>Statut :</strong> <span class="badge">${report.status}</span></p>
                    </div>
                </div>

                <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p><strong>Description du citoyen :</strong></p>
                    <p style="font-style: italic; color: #555;">"${report.description || 'Pas de description'}"</p>
                </div>

                ${report.budget_requested > 0 || report.materials_needed ? `
                    <div style="background: #fff3e0; padding: 15px; border-radius: 8px; border-left: 4px solid #ff9800; margin-bottom: 20px;">
                        <h5 style="color: #e65100; margin-bottom: 10px;">📦 Demande de Logistique (Agent)</h5>
                        <p><strong>Budget :</strong> ${report.budget_requested} FCFA</p>
                        <p><strong>Matériel :</strong> ${report.materials_needed || 'Aucun'}</p>
                    </div>
                ` : ''}

                <div style="background: #eef2f7; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p><strong>Rapport final / Retour agent :</strong></p>
                    <p style="color: #2c3e50; font-weight: 500;">${report.agent_feedback || '<i>En attente du retour...</i>'}</p>
                </div>

                ${report.status === 'Traité' && !report.admin_rating ? `
                    <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; border: 1px solid #c8e6c9;">
                        <h5 style="color: #2e7d32; margin-bottom: 10px;">⭐ Noter cette intervention</h5>
                        <div style="display: flex; gap: 15px; align-items: center;">
                            <select id="rate-value" class="modern-select" style="margin-bottom:0; width: 150px;">
                                <option value="5">5 Étoiles (Excellent)</option>
                                <option value="4">4 Étoiles (Très bien)</option>
                                <option value="3">3 Étoiles (Moyen)</option>
                                <option value="2">2 Étoiles (Insuffisant)</option>
                                <option value="1">1 Étoile (Médiocre)</option>
                            </select>
                            <input type="number" id="impact-value" placeholder="Score Impact (0-100)" class="modern-select" style="margin-bottom:0; width: 180px;" />
                            <button class="btn-primary" onclick="rateMission(${report.id})" style="width: auto;">Valider la Note</button>
                        </div>
                    </div>
                ` : report.admin_rating ? `
                    <div style="text-align: center; padding: 10px; background: #f1f1f1; border-radius: 8px;">
                        <p>Note Admin : <b>${report.admin_rating}/5</b> | Score Impact : <b>${report.impact_score} pts</b></p>
                    </div>
                ` : ''}

                <div class="modal-actions" style="justify-content: flex-end; margin-top: 20px;">
                    <button class="btn-primary" onclick="document.getElementById('details-modal').remove()">Fermer</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.rateMission = async (reportId) => {
    const rating = document.getElementById('rate-value').value;
    const impact = document.getElementById('impact-value').value || 0;

    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/reports/${reportId}/rate`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ rating: parseInt(rating), impact_score: parseInt(impact) })
        });
        if(res.ok) {
            alert("Agent noté ! Points distribués.");
            document.getElementById('details-modal').remove();
            loadDashboard();
        }
    } catch(e) { alert("Erreur lors de la notation"); }
};

// --- LEADERBOARD & ARTICLES ---
async function loadLeaderboard() {
    const container = document.getElementById('leaderboard-container');
    container.innerHTML = '<p>Chargement...</p>';
    try {
        const res = await fetch(`${API_URL}/leaderboard`);
        const { data } = await res.json();
        container.innerHTML = '';
        data.forEach((agent, index) => {
            container.innerHTML += `
                <div class="leaderboard-card glass" style="display: flex; align-items: center; gap: 20px; padding: 20px; margin-bottom: 10px;">
                    <div class="rank">#${index + 1}</div>
                    <div class="avatar">${agent.name.charAt(0)}</div>
                    <div style="flex: 1;">
                        <h4 style="margin:0;">${agent.name}</h4>
                        <small>${agent.badges} missions récompensées</small>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 1.5rem; font-weight: 800; color: #27ae60;">${agent.total_points || 0}</div>
                        <small>ECO-POINTS</small>
                    </div>
                </div>
            `;
        });
    } catch(e) {}
}

async function loadArticles() {
    const list = document.getElementById('articles-list');
    list.innerHTML = '<p>Chargement des articles...</p>';
    try {
        const res = await fetch(`${API_URL}/articles`);
        const { data } = await res.json();
        list.innerHTML = '';
        data.forEach(art => {
            list.innerHTML += `
                <div class="article-card glass" style="padding: 20px; margin-bottom: 15px;">
                    <div style="display:flex; justify-content:space-between;">
                        <span class="badge" style="background: #3498db;">${art.category}</span>
                        <small>${new Date(art.created_at).toLocaleDateString()}</small>
                    </div>
                    <h4 style="margin: 10px 0;">${art.title}</h4>
                    <p style="color: #666; font-size: 0.9rem;">${art.content.substring(0, 150)}...</p>
                </div>
            `;
        });
    } catch(e) {}
}

const addArticleForm = document.getElementById('add-article-form');
if(addArticleForm) {
    addArticleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('article-title').value;
        const category = document.getElementById('article-category').value;
        const content = document.getElementById('article-content').value;

        try {
            const token = localStorage.getItem('eco_token');
            const res = await fetch(`${API_URL}/articles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ title, content, category })
            });
            if(res.ok) {
                alert("Article publié avec succès !");
                addArticleForm.reset();
                document.getElementById('add-article-modal').classList.add('hidden');
                loadArticles();
            }
        } catch(e) {}
    });
}

function renderChart(reports) {
    const ctx = document.getElementById('statusChart').getContext('2d');
    
    let chartData = { attente: 0, cours: 0, traite: 0 };
    reports.forEach(r => {
        if(r.status === 'en attente') chartData.attente++;
        else if(r.status === 'en cours') chartData.cours++;
        else chartData.traite++;
    });

    if(statusChartInstance) {
        statusChartInstance.data.datasets[0].data = [chartData.attente, chartData.cours, chartData.traite];
        statusChartInstance.update();
    } else {
        statusChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['En attente', 'En cours', 'Traité'],
                datasets: [{
                    label: 'Nombre de Signalements',
                    data: [chartData.attente, chartData.cours, chartData.traite],
                    backgroundColor: ['#e74c3c', '#f39c12', '#27ae60'],
                    borderWidth: 0,
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { borderDash: [5, 5] } },
                    x: { grid: { display: false } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }
}

function renderAdminMap(reports) {
    if (!adminMap) {
        adminMap = L.map('admin-map').setView([7.54, -5.5471], 7);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(adminMap);
        markerLayer = L.layerGroup().addTo(adminMap);
    } else {
        markerLayer.clearLayers();
    }

    const redIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });
    const orangeIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });
    const greenIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });

    reports.forEach(rep => {
        if (rep.latitude && rep.longitude) {
            let icon = redIcon;
            if (rep.status === 'en cours') icon = orangeIcon;
            else if (rep.status === 'Traité') icon = greenIcon;

            const marker = L.marker([rep.latitude, rep.longitude], { icon }).addTo(markerLayer);
            marker.bindPopup(`
                <div style="font-family: 'Outfit', sans-serif;">
                    <b style="color: var(--secondary-color);">#${rep.id} - ${rep.type}</b><br>
                    <span style="font-size: 0.8rem; color: #666;">Statut: ${rep.status}</span><br>
                    <p style="margin-top: 5px; font-size: 0.9rem;">${rep.description || 'Pas de description'}</p>
                    ${rep.image_url ? `<img src="http://localhost:3000${rep.image_url}" style="width: 100%; max-width: 200px; border-radius: 4px; margin-top: 10px;" />` : ''}
                </div>
            `);
        }
    });

    // Optionnel: Ajuster la vue pour englober tous les marqueurs si présent
    if (reports.length > 0) {
        const group = new L.featureGroup(markerLayer.getLayers());
        if (group.getBounds().isValid()) {
            adminMap.fitBounds(group.getBounds(), { padding: [30, 30] });
        }
    }
}

function loadAllReportsView() {
    alert("Vue détaillée des rapports intégrée prochainement ou en filtrant le tableau.");
}

// Notification system for admin (Polling every 15s to simulate realtime push notifications)
let lastTotalReports = -1;
function pollNewAlerts() {
    setInterval(async () => {
        if(mainSection.classList.contains('hidden')) return;
        try {
            const token = localStorage.getItem('eco_token');
            const statRes = await fetch(`${API_URL}/stats`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (statRes.status === 401) return;
            const { data: stats } = await statRes.json();
            if(lastTotalReports !== -1 && stats.totalReports > lastTotalReports) {
                showAdminNotification(`⚠️ Nouveau signalement reçu ! Total : ${stats.totalReports}`);
                loadDashboard(); // Refresh silent
            }
            lastTotalReports = stats.totalReports;
        } catch(e) {}
    }, 15000);
}

function showAdminNotification(message) {
    const notif = document.createElement('div');
    notif.textContent = message;
    notif.style.position = 'fixed';
    notif.style.top = '20px';
    notif.style.right = '20px';
    notif.style.backgroundColor = '#e74c3c';
    notif.style.color = 'white';
    notif.style.padding = '15px 25px';
    notif.style.borderRadius = '8px';
    notif.style.boxShadow = '0 4px 6px rgba(0,0,0,0.2)';
    notif.style.zIndex = '9999';
    notif.style.fontWeight = 'bold';
    notif.style.transition = 'all 0.5s ease';
    document.body.appendChild(notif);
    
    setTimeout(() => { notif.style.opacity = '0'; notif.style.transform = 'translateY(-20px)'; }, 5000);
    setTimeout(() => { notif.remove(); }, 5500);
}

// --- USERS MANAGEMENT ---
async function loadUsers() {
    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401 || res.status === 403) {
            alert("Non autorisé");
            return;
        }
        const { data } = await res.json();
        usersTableBody.innerHTML = '';
        data.forEach(user => {
            let roleStyle = user.role === 'admin' ? 'color: #e74c3c; font-weight: bold;' : 
                            user.role === 'agent' ? 'color: #3498db; font-weight: bold;' : 'color: #2ecc71;';
            usersTableBody.innerHTML += `
                <tr>
                    <td>#${user.id}</td>
                    <td style="font-weight: 600;">${user.name}</td>
                    <td>${user.email}</td>
                    <td style="${roleStyle}">${user.role.toUpperCase()}</td>
                </tr>
            `;
        });
    } catch(err) {
        console.error("Users Load Error", err);
    }
}

addAgentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-agent-name').value;
    const email = document.getElementById('new-agent-email').value;
    const password = document.getElementById('new-agent-password').value;
    
    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, email, password, role: 'agent' })
        });
        const data = await res.json();
        if(res.ok) {
            alert("Agent créé avec succès !");
            addAgentForm.reset();
            document.getElementById('add-agent-modal').classList.add('hidden');
            loadUsers(); // Refresh table
        } else {
            alert(data.error || "Erreur de création");
        }
    } catch(err) {
        alert("Erreur serveur");
    }
});
