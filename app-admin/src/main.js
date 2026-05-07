const authSection = document.getElementById('auth-section');
const mainSection = document.getElementById('main-section');
const loginForm = document.getElementById('login-form');
const navLogout = document.getElementById('nav-logout');
const tableBody = document.getElementById('admin-reports-table');
const usersTableBody = document.getElementById('admin-users-table');
const addAgentForm = document.getElementById('add-agent-form');

const API_URL = '/api';
let statusChartInstance = null;
let typeChartInstance = null;
let adminMap = null;
let markerLayer = null;
let agentsList = []; // Cache for assignment

// --- SUPABASE REALTIME CONFIG ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://obrujgpbduzsenllwxgx.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9icnVqZ3BiZHV6c2VubGx3eGd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjcxMjQsImV4cCI6MjA5Mjk0MzEyNH0.CW93l7Ki_IPyLha0fdg6SjmytKECskB3DDor2tRWBG8';
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
    
    console.log("Tentative de connexion vers :", `${API_URL}/auth/login`);

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        console.log("Réponse reçue, status :", res.status);
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
            } else if(item.id === 'nav-water') {
                document.getElementById('water-view').classList.remove('hidden');
                loadWaterResources();
            } else if(item.id === 'nav-mining') {
                document.getElementById('mining-view').classList.remove('hidden');
                loadMiningSites();
            } else if(item.id === 'nav-energy') {
                document.getElementById('energy-view').classList.remove('hidden');
                loadEnergyResources();
            } else if(item.id === 'nav-oil') {
                document.getElementById('oil-view').classList.remove('hidden');
                loadOilFields();
            } else if(item.id === 'nav-sensors') {
                document.getElementById('sensors-view').classList.remove('hidden');
                loadSensors();
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
        if(values.length >= 10) {
            values[0].textContent = stats.totalReports || 0;
            values[1].textContent = stats.pendingReports || 0;
            values[2].textContent = stats.activeAgents || 0;
            values[3].textContent = stats.totalResources || 0;
            values[4].textContent = stats.totalSensors || 0;
            values[5].textContent = `${(stats.totalCarbonSaved / 1000).toFixed(1)}t` || '0t';
            values[6].textContent = stats.totalWaterResources || 0;
            values[7].textContent = stats.pollutedWater || 0;
            values[8].textContent = stats.totalMiningSites || 0;
            values[9].textContent = stats.totalOilFields || 0;
        }

        // Fetch Agents for assignment
        const userRes = await fetch(`${API_URL}/users`, { headers });
        const { data: users } = await userRes.json();
        agentsList = users.filter(u => u.role === 'agent');

        renderTable(reports);
        renderCharts(reports, stats);
        renderAdminMap(reports);

    } catch(err) {
        console.error("Dashboard Load Error", err);
    }
}

// renderCharts moved to the bottom

async function renderAdminMap(reports) {
    if (!adminMap) {
        adminMap = L.map('admin-map').setView([7.54, -5.5471], 7);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors', maxZoom: 20
        }).addTo(adminMap);
    }

    // Clear previous markers
    if (markerLayer) adminMap.removeLayer(markerLayer);
    markerLayer = L.layerGroup().addTo(adminMap);

    // Add reports
    const redIcon = L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png', iconSize: [25, 41] });
    const orangeIcon = L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png', iconSize: [25, 41] });
    const greenIcon = L.icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png', iconSize: [25, 41] });

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
                    ${rep.image_url ? `<img src="${rep.image_url}" style="width: 100%; max-width: 200px; border-radius: 4px; margin-top: 10px;" />` : ''}
                </div>
            `);
        }
    });

    // Add sensors
    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/sensors`, { headers: { 'Authorization': `Bearer ${token}` } });
        const { data: sensors } = await res.json();
        
        sensors.forEach(sensor => {
            const sensorIcon = L.icon({ 
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png', 
                iconSize: [25, 41] 
            });
            const marker = L.marker([sensor.latitude, sensor.longitude], { icon: sensorIcon }).addTo(markerLayer);
            const lastReading = sensor.last_reading ? JSON.parse(sensor.last_reading) : {};
            marker.bindPopup(`<b>Capteur: ${sensor.type}</b><br>${sensor.location_name}<br>Dernière lecture: ${JSON.stringify(lastReading)}`);
        });

        // Add water resources
        const waterRes = await fetch(`${API_URL}/water-resources`, { headers: { 'Authorization': `Bearer ${token}` } });
        const { data: waters } = await waterRes.json();
        waters.forEach(water => {
            const waterIcon = L.icon({ 
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-cyan.png', 
                iconSize: [25, 41] 
            });
            const marker = L.marker([water.latitude, water.longitude], { icon: waterIcon }).addTo(markerLayer);
            marker.bindPopup(`<b>Eau: ${water.name}</b><br>Type: ${water.type}<br>Statut: ${water.status}<br>Pollution: ${water.pollution_level}`);
        });

        // Add mining sites
        const miningRes = await fetch(`${API_URL}/mining-sites`, { headers: { 'Authorization': `Bearer ${token}` } });
        const { data: minings } = await miningRes.json();
        minings.forEach(site => {
            const miningIcon = L.icon({ 
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png', 
                iconSize: [25, 41] 
            });
            const marker = L.marker([site.latitude, site.longitude], { icon: miningIcon }).addTo(markerLayer);
            marker.bindPopup(`<b>Mine: ${site.name}</b><br>Ressource: ${site.resource_type}<br>Extraction: ${site.extraction_rate}t/mois<br>Impact: ${site.environmental_impact}`);
        });

        // Add oil fields
        const oilRes = await fetch(`${API_URL}/oil-fields`, { headers: { 'Authorization': `Bearer ${token}` } });
        const { data: oils } = await oilRes.json();
        oils.forEach(field => {
            const oilIcon = L.icon({ 
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png', 
                iconSize: [25, 41] 
            });
            const marker = L.marker([field.latitude, field.longitude], { icon: oilIcon }).addTo(markerLayer);
            marker.bindPopup(`<b>Pétrole: ${field.name}</b><br>Type: ${field.type}<br>Production: ${field.production_rate} barils/jour<br>Risque fuite: ${field.leak_risk}`);
        });

    } catch(err) {
        console.error("Error loading resources for map", err);
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

                <div class="internal-notes-section" style="margin-bottom: 20px;">
                    <h5 style="color: #607d8b; border-bottom: 1px solid #ddd; padding-bottom: 5px;">📔 Notes Internes (Confidentiel)</h5>
                    <div id="notes-list-${report.id}" style="max-height: 150px; overflow-y: auto; margin: 10px 0; font-size: 0.85rem;">
                        Chargement des notes...
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="new-note-${report.id}" placeholder="Ajouter une note de coordination..." class="modern-select" style="margin-bottom:0; flex:1;" />
                        <button class="btn-primary" onclick="addInternalNote(${report.id})" style="width: auto;">Note</button>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
                    <button class="btn-secondary" onclick="exportReportPDF(${report.id})" style="width: auto;">📄 Export PDF</button>
                    <button class="btn-primary" onclick="document.getElementById('details-modal').remove()" style="width: auto;">Fermer</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    loadInternalNotes(report.id);
};

window.loadInternalNotes = async (reportId) => {
    const container = document.getElementById(`notes-list-${reportId}`);
    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/reports/${reportId}/notes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const { data: notes } = await res.json();
        
        if (notes.length === 0) {
            container.innerHTML = '<p style="color: #999; font-style: italic;">Aucune note pour le moment.</p>';
            return;
        }

        container.innerHTML = notes.map(n => `
            <div class="note-bubble">
                <div class="meta">
                    <span>👤 ${n.user_name}</span>
                    <span>${new Date(n.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <div style="font-size: 0.9rem; line-height: 1.4;">${n.content}</div>
            </div>
        `).join('');
    } catch(e) { container.innerHTML = 'Erreur chargement notes'; }
};

window.addInternalNote = async (reportId) => {
    const input = document.getElementById(`new-note-${reportId}`);
    const content = input.value;
    if (!content) return;

    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/reports/${reportId}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ content })
        });
        if (res.ok) {
            input.value = '';
            loadInternalNotes(reportId);
        }
    } catch(e) {}
};

window.exportReportPDF = (reportId) => {
    // We add a class to body just in case, though the @media print handles most
    window.print();
};

// --- NEW RESOURCE LOADING FUNCTIONS ---
async function loadWaterResources() {
    const tableBody = document.getElementById('water-resources-table');
    tableBody.innerHTML = '<tr><td colspan="7">Chargement...</td></tr>';
    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/water-resources`, { headers: { 'Authorization': `Bearer ${token}` } });
        const { data } = await res.json();
        tableBody.innerHTML = data.map(w => {
            const smartBtnClass = w.smart_meter_active ? 'btn-primary' : 'btn-secondary';
            const smartBtnText = w.smart_meter_active ? '✅ Smart On' : '❌ Smart Off';
            return `
            <tr>
                <td>${w.id}</td>
                <td>${w.name}</td>
                <td>${w.type}</td>
                <td><span class="badge ${w.status === 'clean' ? 'status-completed' : 'status-pending'}">${w.status}</span></td>
                <td>${w.pollution_level}</td>
                <td>${w.recycling_rate}%</td>
                <td><button class="btn-small ${smartBtnClass}" onclick="toggleSmartMeter(${w.id})">${smartBtnText}</button></td>
            </tr>
        `}).join('');
    } catch(e) { tableBody.innerHTML = '<tr><td colspan="7">Erreur chargement</td></tr>'; }
}

async function loadMiningSites() {
    const tableBody = document.getElementById('mining-sites-table');
    tableBody.innerHTML = '<tr><td colspan="7">Chargement...</td></tr>';
    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/mining-sites`, { headers: { 'Authorization': `Bearer ${token}` } });
        const { data } = await res.json();
        tableBody.innerHTML = data.map(m => {
            const bioBtnClass = m.bioleaching_active ? 'btn-primary' : 'btn-secondary';
            const bioBtnText = m.bioleaching_active ? '✅ Active' : '❌ Inactive';
            const complianceColor = m.compliance_score >= 80 ? '#27ae60' : (m.compliance_score >= 50 ? '#f39c12' : '#e74c3c');
            return `
            <tr>
                <td>${m.id}</td>
                <td>${m.name}</td>
                <td>${m.resource_type}</td>
                <td>${m.extraction_rate}</td>
                <td>${m.environmental_impact}</td>
                <td style="color:${complianceColor}; font-weight:bold;">${m.compliance_score}/100</td>
                <td><button class="btn-small ${bioBtnClass}" onclick="toggleBioleaching(${m.id})">${bioBtnText}</button></td>
            </tr>
        `}).join('');
    } catch(e) { tableBody.innerHTML = '<tr><td colspan="7">Erreur chargement</td></tr>'; }
}

async function loadOilFields() {
    const tableBody = document.getElementById('oil-fields-table');
    tableBody.innerHTML = '<tr><td colspan="6">Chargement...</td></tr>';
    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/oil-fields`, { headers: { 'Authorization': `Bearer ${token}` } });
        const { data } = await res.json();
        tableBody.innerHTML = data.map(o => `
            <tr>
                <td>${o.id}</td>
                <td>${o.name}</td>
                <td>${o.type}</td>
                <td>${o.production_rate}</td>
                <td>${o.leak_risk}</td>
                <td>${o.carbon_emissions} kg</td>
            </tr>
        `).join('');
    } catch(e) { tableBody.innerHTML = '<tr><td colspan="6">Erreur chargement</td></tr>'; }
}

async function loadEnergyResources() {
    const tableBody = document.getElementById('energy-resources-table');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="6">Chargement...</td></tr>';
    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/energy-resources`, { headers: { 'Authorization': `Bearer ${token}` } });
        const { data } = await res.json();
        tableBody.innerHTML = data.map(e => {
            const gridBtnClass = e.smart_grid_active ? 'btn-primary' : 'btn-secondary';
            const gridBtnText = e.smart_grid_active ? '✅ Connecté' : '❌ Isolé';
            const batteryColor = e.battery_level > 50 ? '#27ae60' : '#e74c3c';
            return `
            <tr>
                <td>${e.id}</td>
                <td>${e.name}</td>
                <td>${e.type}</td>
                <td>${e.capacity_mw}</td>
                <td>
                    <div style="width:100%; background:#ddd; border-radius:10px; height:10px; margin-top:5px;">
                        <div style="width:${e.battery_level}%; background:${batteryColor}; height:100%; border-radius:10px;"></div>
                    </div>
                    <small>${e.battery_level}%</small>
                </td>
                <td><button class="btn-small ${gridBtnClass}" onclick="toggleSmartGrid(${e.id})">${gridBtnText}</button></td>
            </tr>
        `}).join('');
    } catch(e) { tableBody.innerHTML = '<tr><td colspan="6">Erreur chargement</td></tr>'; }
}

window.toggleSmartMeter = async (id) => {
    try {
        const token = localStorage.getItem('eco_token');
        await fetch(`${API_URL}/water-resources/${id}/toggle-smart-meter`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
        loadWaterResources();
    } catch(e) {}
};

window.toggleBioleaching = async (id) => {
    try {
        const token = localStorage.getItem('eco_token');
        await fetch(`${API_URL}/mining-sites/${id}/toggle-bioleaching`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
        loadMiningSites();
    } catch(e) {}
};

window.toggleSmartGrid = async (id) => {
    try {
        const token = localStorage.getItem('eco_token');
        await fetch(`${API_URL}/energy-resources/${id}/toggle-smart-grid`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
        loadEnergyResources();
    } catch(e) {}
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

function renderCharts(reports, stats) {
    const statusCtx = document.getElementById('statusChart').getContext('2d');
    const typeCtx = document.getElementById('typeChart').getContext('2d');
    
    // Status Chart
    let statusData = { attente: 0, cours: 0, traite: 0 };
    reports.forEach(r => {
        if(r.status === 'en attente') statusData.attente++;
        else if(r.status === 'en cours') statusData.cours++;
        else statusData.traite++;
    });

    if(statusChartInstance) {
        statusChartInstance.data.datasets[0].data = [statusData.attente, statusData.cours, statusData.traite];
        statusChartInstance.update();
    } else {
        statusChartInstance = new Chart(statusCtx, {
            type: 'bar',
            data: {
                labels: ['En attente', 'En cours', 'Traité'],
                datasets: [{
                    label: 'Signalements',
                    data: [statusData.attente, statusData.cours, statusData.traite],
                    backgroundColor: [
                        'rgba(231, 76, 60, 0.8)', 
                        'rgba(243, 156, 18, 0.8)', 
                        'rgba(39, 174, 96, 0.8)'
                    ],
                    borderColor: ['#e74c3c', '#f39c12', '#27ae60'],
                    borderWidth: 1,
                    borderRadius: 8
                }]
            },
            options: { 
                responsive: true, 
                plugins: { 
                    legend: { display: false } 
                },
                scales: {
                    y: { beginAtZero: true, grid: { display: false } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // Type Chart
    if (stats && stats.byType) {
        const labels = stats.byType.map(t => t.type);
        const values = stats.byType.map(t => t.count);

        if(typeChartInstance) {
            typeChartInstance.data.labels = labels;
            typeChartInstance.data.datasets[0].data = values;
            typeChartInstance.update();
        } else {
            typeChartInstance = new Chart(typeCtx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: [
                            '#FF8200', 
                            '#009E60', 
                            '#3498db', 
                            '#9b59b6', 
                            '#e67e22',
                            '#1abc9c'
                        ],
                        borderWidth: 0,
                        hoverOffset: 10
                    }]
                },
                options: { 
                    responsive: true, 
                    cutout: '70%',
                    plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } }
                    }
                }
            });
        }
    }
}

async function loadSensors() {
    const tableBody = document.getElementById('sensors-table');
    tableBody.innerHTML = '<tr><td colspan="6">Chargement...</td></tr>';
    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/sensors`, { headers: { 'Authorization': `Bearer ${token}` } });
        const { data } = await res.json();
        tableBody.innerHTML = data.map(s => {
            let readingStr = "Aucune";
            if (s.last_reading) {
                try {
                    const r = JSON.parse(s.last_reading);
                    readingStr = Object.entries(r).map(([k,v]) => `<b>${k}</b>: ${v}`).join(', ');
                } catch(e) {}
            }
            
            let status = '<span class="badge status-completed">Actif</span>';
            if (s.carbon_baseline > 0 && readingStr !== "Aucune" && readingStr.includes("pm25") && JSON.parse(s.last_reading).pm25 > s.carbon_baseline) {
                 status = '<span class="badge status-pending" style="background:#e74c3c;">Alerte</span>';
            }

            return `
            <tr>
                <td>${s.id}</td>
                <td style="font-weight:600; color:var(--secondary-color);">${s.type}</td>
                <td>${s.location_name}</td>
                <td><div style="background:#f0f7f0; padding:4px; border-radius:4px; font-size:0.85rem;">${readingStr}</div></td>
                <td>${s.carbon_baseline}</td>
                <td>${status}</td>
            </tr>
            `;
        }).join('');
    } catch(e) { tableBody.innerHTML = '<tr><td colspan="6">Erreur chargement</td></tr>'; }
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
