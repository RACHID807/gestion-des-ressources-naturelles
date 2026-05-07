const authSection = document.getElementById('auth-section');
const mainSection = document.getElementById('main-section');
const loginForm = document.getElementById('login-form');
const navLogout = document.getElementById('nav-logout');
const missionsContainer = document.getElementById('missions-container');

const API_URL = '/api';

// --- SUPABASE REALTIME CONFIG ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://obrujgpbduzsenllwxgx.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9icnVqZ3BiZHV6c2VubGx3eGd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjcxMjQsImV4cCI6MjA5Mjk0MzEyNH0.CW93l7Ki_IPyLha0fdg6SjmytKECskB3DDor2tRWBG8';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function initRealtime() {
    console.log("Agent : Connexion au flux Temps Réel...");
    supabase
        .channel('agent-missions')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'reports' },
            (payload) => {
                const user = JSON.parse(localStorage.getItem('eco_user'));
                // Si la mission nous est assignée ou mise à jour pour nous
                if (payload.new && payload.new.assigned_to === user.id) {
                    showToast("🚨 NOUVELLE MISSION ASSIGNÉE !");
                    fetchAndRenderMissions();
                } else if (payload.eventType === 'UPDATE' && payload.old && payload.old.assigned_to === user.id) {
                    fetchAndRenderMissions(); // Sync changes
                }
            }
        )
        .subscribe();
}

// --- UX Utilities ---
function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.backgroundColor = isError ? '#e74c3c' : '#2ecc71';
    toast.style.color = 'white';
    toast.style.padding = '15px 25px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    toast.style.zIndex = '9999';
    toast.style.transition = 'opacity 0.5s ease';
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; }, 3000);
    setTimeout(() => { toast.remove(); }, 3500);
}

// --- Navigation ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('agent-id').value;
    const password = document.getElementById('password').value;
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('eco_token', data.token);
            localStorage.setItem('eco_user', JSON.stringify(data.user));
            document.getElementById('agent-user-name').textContent = data.user.name;
            authSection.classList.replace('active', 'hidden');
            mainSection.classList.replace('hidden', 'active');
            fetchAndRenderMissions();
            initRealtime();
            showToast('Agent connecté : ' + data.user.name);
        } else {
            showToast(data.error || 'Erreur', true);
        }
    } catch (err) {
        showToast('Erreur serveur API', true);
    }
});

navLogout.addEventListener('click', () => {
    localStorage.removeItem('eco_token');
    localStorage.removeItem('eco_user');
    mainSection.classList.replace('active', 'hidden');
    authSection.classList.replace('hidden', 'active');
});

const navMissions = document.getElementById('nav-missions');
const navTools = document.getElementById('nav-tools');
const missionsView = document.getElementById('missions-view');
const toolsView = document.getElementById('tools-view');

function switchView(view) {
    navMissions.classList.remove('active');
    navTools.classList.remove('active');
    missionsView.classList.add('hidden');
    toolsView.classList.add('hidden');
    
    if (view === 'missions') {
        navMissions.classList.add('active');
        missionsView.classList.remove('hidden');
        fetchAndRenderMissions();
    } else {
        navTools.classList.add('active');
        toolsView.classList.remove('hidden');
        loadToolsData();
    }
}

navMissions.addEventListener('click', () => switchView('missions'));
navTools.addEventListener('click', () => switchView('tools'));

// Auto-login check
window.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('eco_token');
    if (token) {
        const user = JSON.parse(localStorage.getItem('eco_user'));
        if (user) document.getElementById('agent-user-name').textContent = user.name;
        authSection.classList.replace('active', 'hidden');
        mainSection.classList.replace('hidden', 'active');
        switchView('missions');
        initRealtime();
    }
});

// --- Rendu dynamique des missions API ---
async function fetchAndRenderMissions() {
    try {
        const token = localStorage.getItem('eco_token');
        missionsContainer.innerHTML = '<p>Chargement des missions...</p>';
        const res = await fetch(`${API_URL}/reports`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401) return navLogout.click();
        const { data } = await res.json();
        const user = JSON.parse(localStorage.getItem('eco_user'));

        // Filtrer pour n'afficher que les missions assignées à cet agent
        const myMissions = data.filter(m => m.assigned_to === user.id);

        missionsContainer.innerHTML = '';
        if (!myMissions || myMissions.length === 0) {
            missionsContainer.innerHTML = `
                <div class="glass-panel" style="padding: 40px; text-align: center; grid-column: 1 / -1;">
                    <p style="font-size: 1.2rem; color: #7f8c8d;">✨ Aucune mission assignée pour le moment.</p>
                    <p style="color: #95a5a6; font-size: 0.9rem;">Reposez-vous ou vérifiez plus tard !</p>
                </div>
            `;
            return;
        }

        myMissions.forEach(m => {
            const div = document.createElement('div');
            div.className = 'mission-card glass-panel';

            let badgeClass = m.status === 'en attente' ? 'attente' : m.status === 'en cours' ? 'cours' : 'traite';
            const priorityLabel = m.priority_level === 'urgent' ? '🚨 URGENT' : m.priority_level === 'bas' ? 'Bas' : 'Normal';
            const deadlineText = m.deadline ? new Date(m.deadline).toLocaleDateString() : 'Pas de délai';

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom: 10px;">
                    <span class="badge ${badgeClass}">${m.status}</span>
                    <span style="font-weight: 800; font-size: 0.75rem; color: ${m.priority_level === 'urgent' ? '#e74c3c' : '#7f8c8d'};">${priorityLabel}</span>
                </div>
                <h4>${m.type}</h4>
                <p style="color: #e67e22; font-size: 0.8rem; font-weight: 600;">📅 Date limite : ${deadlineText}</p>
                <p style="margin: 10px 0; font-size: 0.95rem;">${m.description || "Aucune description"}</p>
                
                ${m.image_url ? `<img src="http://localhost:3000${m.image_url}" style="width: 100%; border-radius: 8px; margin-bottom: 10px; border: 1px solid #ddd;" />` : ''}
                
                <div id="logistics-info-${m.id}" style="font-size: 0.85rem; background: #fff3e0; padding: 10px; border-radius: 6px; margin-bottom: 15px; display: ${m.budget_requested > 0 ? 'block' : 'none'};">
                    <b>📦 Moyens demandés :</b> ${m.budget_requested} FCFA | ${m.materials_needed || ''}
                </div>

                <div class="feedback-area" style="margin-bottom: 15px;">
                    <label style="font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 5px;">Rapport de mission / Difficultés :</label>
                    <textarea class="feedback-input" id="feedback-${m.id}" placeholder="Expliquez vos actions ou obstacles..." style="width: 100%; border-radius: 6px; border: 1px solid #ddd; padding: 10px; font-size: 0.85rem; resize: vertical; min-height: 60px;">${m.agent_feedback || ''}</textarea>
                </div>

                <div class="after-photo-area" style="margin-bottom: 15px; display: ${m.status === 'en cours' ? 'block' : 'none'};">
                    <label style="font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 5px;">📸 Photo de résolution (Après) :</label>
                    <input type="file" id="after-img-${m.id}" accept="image/*" class="modern-select" style="padding: 5px; font-size: 0.8rem;" />
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <button class="btn-small" onclick="showLogisticsModal(${m.id})" style="background: #e67e22;">Demander Moyens</button>
                    <select class="status-select" onchange="updateStatus(${m.id}, this)" style="margin-bottom: 0;">
                        <option value="en cours" ${m.status === 'en cours' ? 'selected' : ''}>En cours</option>
                        <option value="Traité" ${m.status === 'Traité' ? 'selected' : ''}>Terminer</option>
                    </select>
                </div>
            `;
            missionsContainer.appendChild(div);
        });
    } catch (err) {
        missionsContainer.innerHTML = '<p style="color:red;">Erreur de récupération des données.</p>';
    }
}

window.showLogisticsModal = (id) => {
    const modalHtml = `
        <div id="logistics-modal" class="modal-overlay">
            <div class="modal-content glass">
                <h3>Demande de Budget & Matériel</h3>
                <p>Précisez les besoins pour la mission #${id}</p>
                <input type="number" id="budget-input" placeholder="Budget estimé (FCFA)" class="modern-select" />
                <textarea id="materials-input" placeholder="Matériel spécifique nécessaire..." class="modern-select" style="min-height: 80px;"></textarea>
                <div class="modal-actions">
                    <button class="btn-secondary" onclick="document.getElementById('logistics-modal').remove()">Annuler</button>
                    <button class="btn-primary" onclick="submitLogistics(${id})">Envoyer la demande</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.submitLogistics = async (id) => {
    const budget = document.getElementById('budget-input').value;
    const materials = document.getElementById('materials-input').value;

    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/reports/${id}/logistics`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ budget_requested: parseFloat(budget), materials_needed: materials })
        });
        if (res.ok) {
            showToast("Demande envoyée à l'administration !");
            document.getElementById('logistics-modal').remove();
            fetchAndRenderMissions();
        }
    } catch(e) { showToast("Erreur lors de l'envoi", true); }
}

// Fonction globale appelée par le select pour PUT update API
window.updateStatus = async function (id, selectElement) {
    const newStatus = selectElement.value;
    const feedback = document.getElementById(`feedback-${id}`).value;
    const afterImgInput = document.getElementById(`after-img-${id}`);
    
    const formData = new FormData();
    formData.append('status', newStatus);
    formData.append('agent_feedback', feedback);
    if (afterImgInput && afterImgInput.files[0]) {
        formData.append('after_image', afterImgInput.files[0]);
    }

    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/reports/${id}/status`, {
            method: 'PUT',
            headers: {
                // Do not set Content-Type, browser will set it for FormData
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        if (res.ok) {
            showToast(`Mission #${id} passée à "${newStatus}" !`);
            fetchAndRenderMissions(); // Refresh to update badge color
        } else {
            showToast("Erreur lors de la mise à jour.", true);
        }
    } catch (err) {
        showToast("Erreur réseau.", true);
    }
}

async function loadToolsData() {
    const toolsContainer = document.getElementById('tools-container');
    toolsContainer.innerHTML = '<p>Chargement des infrastructures...</p>';
    
    try {
        const token = localStorage.getItem('eco_token');
        const headers = { 'Authorization': `Bearer ${token}` };
        
        // Fetch public stats for overview
        const pubRes = await fetch(`${API_URL}/public/community-resources`);
        const pubData = await pubRes.json();
        const stats = pubData.data;

        // Display a nice summary widget for the agent
        let html = `
            <div class="mission-card glass-panel" style="grid-column: 1/-1; border-left: 4px solid var(--secondary-color);">
                <h4>🌍 Aperçu de la Zone</h4>
                <div style="display:flex; justify-content:space-around; margin-top:10px;">
                    <div style="text-align:center;">💧 Eau Smart: <b>${stats.smartWaterPercentage}%</b></div>
                    <div style="text-align:center;">⚡ Batterie Moy: <b>${stats.averageBatteryLevel}%</b></div>
                    <div style="text-align:center;">⛏️ Conformité: <b>${stats.averageCompliance}/100</b></div>
                </div>
            </div>
            <h4 style="grid-column: 1/-1; margin-top:20px;">Détails des Équipements</h4>
        `;

        // Fetch Energy resources (microgrids)
        const energyRes = await fetch(`${API_URL}/energy-resources`, { headers });
        const energyData = await energyRes.json();
        
        energyData.data.forEach(e => {
            const isCritical = e.battery_level < 30;
            html += `
                <div class="mission-card glass-panel" style="${isCritical ? 'border: 2px solid #e74c3c;' : ''}">
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <span class="badge ${e.smart_grid_active ? 'cours' : 'attente'}">${e.smart_grid_active ? 'Réseau Connecté' : 'Mode Isolé'}</span>
                        <span style="font-size:1.5rem;">⚡</span>
                    </div>
                    <h4 style="margin-bottom:5px;">${e.name}</h4>
                    <p style="font-size:0.85rem; color:#666;">Type: ${e.type} | Capacité: ${e.capacity_mw}MW</p>
                    <div style="margin-top:10px;">
                        <small>Batterie: ${e.battery_level}%</small>
                        <div style="width:100%; background:#ddd; height:8px; border-radius:4px; margin-top:2px;">
                            <div style="width:${e.battery_level}%; background:${isCritical ? '#e74c3c' : '#27ae60'}; height:100%; border-radius:4px;"></div>
                        </div>
                    </div>
                    ${isCritical ? '<p style="color:#e74c3c; font-size:0.75rem; font-weight:bold; margin-top:10px;">🚨 Batterie Faible - Intervention requise</p>' : ''}
                </div>
            `;
        });

        // Fetch Water resources
        const waterRes = await fetch(`${API_URL}/water-resources`, { headers });
        const waterData = await waterRes.json();
        
        waterData.data.forEach(w => {
            if (!w.smart_meter_active) return; // Only show smart tracked resources to agent radar
            const isPolluted = w.status !== 'clean';
            html += `
                <div class="mission-card glass-panel">
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                        <span class="badge ${isPolluted ? 'attente' : 'traite'}">${isPolluted ? 'Alerte Pollution' : 'Normal'}</span>
                        <span style="font-size:1.5rem;">💧</span>
                    </div>
                    <h4 style="margin-bottom:5px;">${w.name}</h4>
                    <p style="font-size:0.85rem; color:#666;">Smart Meter <b>Actif</b></p>
                    <p style="font-size:0.85rem; color:#666;">Niveau de pollution lu: <b>${w.pollution_level}</b></p>
                </div>
            `;
        });

        toolsContainer.innerHTML = html;
        
    } catch(err) {
        toolsContainer.innerHTML = '<p style="color:red;">Erreur de connexion aux équipements.</p>';
    }
}
