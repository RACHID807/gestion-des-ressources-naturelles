const authSection = document.getElementById('auth-section');
const mainSection = document.getElementById('main-section');
const loginForm = document.getElementById('login-form');
const navLogout = document.getElementById('nav-logout');
const missionsContainer = document.getElementById('missions-container');

const API_URL = '/api';

// --- SUPABASE REALTIME CONFIG ---
const SUPABASE_URL = 'https://obrujgpbduzsenllwxgx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9icnVqZ3BiZHV6c2VubGx3eGd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjcxMjQsImV4cCI6MjA5Mjk0MzEyNH0.CW93l7Ki_IPyLha0fdg6SjmytKECskB3DDor2tRWBG8';
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

// Auto-login check
window.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('eco_token');
    if (token) {
        const user = JSON.parse(localStorage.getItem('eco_user'));
        if (user) document.getElementById('agent-user-name').textContent = user.name;
        authSection.classList.replace('active', 'hidden');
        mainSection.classList.replace('hidden', 'active');
        fetchAndRenderMissions();
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

    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/reports/${id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: newStatus, agent_feedback: feedback })
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
