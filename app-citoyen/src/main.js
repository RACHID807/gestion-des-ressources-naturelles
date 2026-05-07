// Selectors
const authSection = document.getElementById('auth-section');
const mainSection = document.getElementById('main-section');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const btnShowRegister = document.getElementById('btn-show-register');
const btnShowLogin = document.getElementById('btn-show-login');

const navMap = document.getElementById('nav-map');
const navReport = document.getElementById('nav-report');
const navLogout = document.getElementById('nav-logout');

const mapView = document.getElementById('map-view');
const reportView = document.getElementById('report-view');
const activitiesView = document.getElementById('activities-view');
const impactView = document.getElementById('impact-view');
const educationView = document.getElementById('education-view');
const navActivities = document.getElementById('nav-activities');
const navImpact = document.getElementById('nav-impact');
const navEducation = document.getElementById('nav-education');
const newReportForm = document.getElementById('new-report-form');

const btnGeolocate = document.getElementById('btn-geolocate');
const docLat = document.getElementById('report-lat');
const docLng = document.getElementById('report-lng');

const reportImageInput = document.getElementById('report-image');
const btnSelectFile = document.getElementById('btn-select-file');
const fileNameLabel = document.getElementById('file-name-label');
const imagePreview = document.getElementById('image-preview');
const previewImg = document.getElementById('preview-img');

let map; // Leaflet map instance
const API_URL = '/api';

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

// --- Navigation Logic ---
function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.btn-text').forEach(btn => btn.classList.remove('active'));

  if (viewId === 'map') {
    mapView.classList.replace('hidden', 'active');
    navMap.classList.add('active');
    setTimeout(() => { if(map) map.invalidateSize(); }, 100);
    fetchResourcesAndRefreshMap(); // Always refresh map data on switch
  } else if (viewId === 'report') {
    reportView.classList.replace('hidden', 'active');
    navReport.classList.add('active');
  } else if (viewId === 'activities') {
    activitiesView.classList.replace('hidden', 'active');
    navActivities.classList.add('active');
    loadMyActivities();
  } else if (viewId === 'impact') {
    impactView.classList.replace('hidden', 'active');
    navImpact.classList.add('active');
    loadImpactGallery();
    loadCommunityStats();
  } else if (viewId === 'education') {
    educationView.classList.replace('hidden', 'active');
    navEducation.classList.add('active');
    loadArticles();
    loadQuizzes();
  }
}

navMap.addEventListener('click', () => switchView('map'));
navReport.addEventListener('click', () => switchView('report'));
navActivities.addEventListener('click', () => switchView('activities'));
navImpact.addEventListener('click', () => switchView('impact'));
navEducation.addEventListener('click', () => switchView('education'));
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
        if (user) document.getElementById('citoyen-user-name').textContent = user.name;
        authSection.classList.replace('active', 'hidden');
        mainSection.classList.replace('hidden', 'active');
        initMap();
        switchView('map');
    }
});

// --- Auth Logic ---
btnShowRegister.addEventListener('click', () => {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
});

btnShowLogin.addEventListener('click', () => {
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    
    try {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if(res.ok) {
            showToast('Inscription réussie ! Vous pouvez vous connecter.');
            btnShowLogin.click(); // Switch back to login
            registerForm.reset();
        } else {
            showToast(data.error || 'Erreur lors de l\'inscription', true);
        }
    } catch(err) {
        showToast('Erreur serveur', true);
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if(res.ok) {
            localStorage.setItem('eco_token', data.token);
            localStorage.setItem('eco_user', JSON.stringify(data.user));
            document.getElementById('citoyen-user-name').textContent = data.user.name;
            authSection.classList.replace('active', 'hidden');
            mainSection.classList.replace('hidden', 'active');
            initMap();
            switchView('map');
            showToast('Connexion réussie ! Bienvenue ' + data.user.name);
        } else {
            showToast(data.error || 'Erreur identifiants', true);
        }
    } catch(err) {
        showToast('Erreur de connexion serveur', true);
    }
});

// --- Map Logic (Leaflet + Fetch API) ---
function initMap() {
    if (map) return;
    map = L.map('map').setView([7.54, -5.5471], 7);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors', maxZoom: 20
    }).addTo(map);
}

async function fetchResourcesAndRefreshMap() {
    try {
        const token = localStorage.getItem('eco_token');
        const headers = { 'Authorization': `Bearer ${token}` };

        // Fetch resources
        const res1 = await fetch(`${API_URL}/resources`, { headers });
        const data1 = await res1.json();
        
        // Fetch reports
        const res2 = await fetch(`${API_URL}/reports`, { headers });
        const data2 = await res2.json();

        // Fetch IoT Sensors
        const res3 = await fetch(`${API_URL}/sensors`, { headers });
        const data3 = res3.ok ? await res3.json() : { data: [] };

        if (res1.status === 401 || res2.status === 401) return navLogout.click();

        // Draw resources
        data1.data?.forEach(res => {
            const marker = L.marker([res.latitude, res.longitude]).addTo(map);
            marker.bindPopup(`<b>${res.name}</b><br>Type: ${res.type}`);
        });

        // Draw reports with red icons
        const redIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        });

        data2.data?.forEach(rep => {
            if(rep.latitude && rep.longitude) {
                const marker = L.marker([rep.latitude, rep.longitude], {icon: redIcon}).addTo(map);
                marker.bindPopup(`<b>Alerte: ${rep.type}</b><br>Statut: ${rep.status}`);
            }
        });

        // Draw IoT Sensors with blue icons
        const blueIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
        });

        data3.data?.forEach(sensor => {
            if(sensor.latitude && sensor.longitude) {
                const marker = L.marker([sensor.latitude, sensor.longitude], {icon: blueIcon}).addTo(map);
                
                // Format reading
                let readingStr = "Aucune donnée";
                if (sensor.last_reading) {
                    try {
                        const r = JSON.parse(sensor.last_reading);
                        readingStr = Object.entries(r).map(([k,v]) => `${k}: ${v}`).join(', ');
                    } catch(e) {}
                }

                const popupContent = `
                    <div style="text-align:center;">
                        <b>📡 Capteur IoT: ${sensor.type}</b><br>
                        <small>${sensor.location_name}</small><br>
                        <div style="margin: 8px 0; background:#f0f7f0; padding:5px; border-radius:4px; font-size:0.85rem;">
                            📊 <b>Dernière lecture:</b><br>${readingStr}
                        </div>
                        <button onclick="reportFromSensor(${sensor.latitude}, ${sensor.longitude})" 
                            style="background:var(--secondary-color); color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem; width:100%;">
                            🚨 Signaler une anomalie ici
                        </button>
                    </div>
                `;
                marker.bindPopup(popupContent);
            }
        });
    } catch(err) {
        console.error("Erreur chargement carte:", err);
    }
}

// Global function to pre-fill report form from sensor
window.reportFromSensor = (lat, lng) => {
    switchView('report');
    docLat.value = lat;
    docLng.value = lng;
    btnGeolocate.textContent = "Position Capteur ✓";
    btnGeolocate.classList.replace('btn-secondary', 'btn-primary');
    showToast("Coordonnées du capteur pré-remplies.");
};

// --- Report Form Logic ---
btnGeolocate.addEventListener('click', () => {
    btnGeolocate.textContent = "Recherche...";
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition((position) => {
            docLat.value = position.coords.latitude;
            docLng.value = position.coords.longitude;
            btnGeolocate.textContent = "Position trouvée ✓";
            btnGeolocate.classList.replace('btn-secondary', 'btn-primary');
        }, (error) => {
            alert("Erreur géolocalisation");
            btnGeolocate.textContent = "Réessayer";
        });
    } else alert("Non supporté");
});

// --- Image Preview Logic ---
btnSelectFile.addEventListener('click', () => reportImageInput.click());

reportImageInput.addEventListener('change', () => {
    const file = reportImageInput.files[0];
    if (file) {
        fileNameLabel.textContent = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            imagePreview.classList.remove('hidden');
            callAIAnalysis(file);
        };
        reader.readAsDataURL(file);
    } else {
        fileNameLabel.textContent = "Aucun fichier choisi";
        imagePreview.classList.add('hidden');
        document.getElementById('ai-badge').classList.add('hidden');
    }
});

async function callAIAnalysis(file) {
    const aiBadge = document.getElementById('ai-badge');
    const reportType = document.getElementById('report-type');
    
    aiBadge.textContent = "🤖 Analyse IA...";
    aiBadge.classList.remove('hidden');
    aiBadge.style.background = "var(--secondary-color)";

    const formData = new FormData();
    formData.append('image', file);

    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/ai/analyze`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        
        if (res.ok) {
            reportType.value = data.detectedType;
            aiBadge.textContent = `🤖 IA: ${(data.confidence * 100).toFixed(0)}% de certitude`;
            aiBadge.style.background = "#27ae60";
            showToast("L'IA a identifié le type de problème !");
        }
    } catch(err) {
        aiBadge.classList.add('hidden');
    }
}

newReportForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!docLat.value || !docLng.value) return showToast("Veuillez localiser votre position", true);
    
    // Use FormData for file upload
    const formData = new FormData();
    formData.append('type', document.getElementById('report-type').value);
    formData.append('description', document.getElementById('report-description').value);
    formData.append('latitude', parseFloat(docLat.value));
    formData.append('longitude', parseFloat(docLng.value));
    
    if (reportImageInput.files[0]) {
        formData.append('image', reportImageInput.files[0]);
    }

    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/reports`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData 
        });
        if(res.ok) {
            showToast("Signalement envoyé avec succès !");
            newReportForm.reset();
            imagePreview.classList.add('hidden');
            fileNameLabel.textContent = "Aucun fichier choisi";
            btnGeolocate.textContent = "Localiser ma position";
            btnGeolocate.classList.replace('btn-primary', 'btn-secondary');
            switchView('map');
        } else throw new Error("Erreur serveur");
    } catch(err) {
        showToast("Impossible d'envoyer le signalement", true);
    }
});

// --- ACTIVITIES & REWARDS LOGIC ---
async function loadMyActivities() {
    const reportsList = document.getElementById('my-reports-list');
    const badgesList = document.getElementById('my-badges-list');
    const totalPointsSpan = document.getElementById('total-points');

    reportsList.innerHTML = '<p>Chargement de vos actions...</p>';
    
    try {
        const token = localStorage.getItem('eco_token');
        const headers = { 'Authorization': `Bearer ${token}` };

        // Fetch Reports
        const repRes = await fetch(`${API_URL}/my-reports`, { headers });
        const { data: reports } = await repRes.json();

        // Fetch Rewards
        const rewRes = await fetch(`${API_URL}/my-rewards`, { headers });
        const { data: rewards, totalPoints } = await rewRes.json();

        totalPointsSpan.textContent = totalPoints || 0;

        // Render Reports
        reportsList.innerHTML = '';
        if (reports.length === 0) {
            reportsList.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 20px; color: #7f8c8d;">Vous n\'avez pas encore envoyé de signalement. Commencez dès maintenant !</p>';
        }

        reports.forEach(report => {
            const statusClass = report.status === 'en attente' ? 'status-pending' : 
                                report.status === 'en cours' ? 'status-in-progress' : 'status-completed';
            
            reportsList.innerHTML += `
                <div class="report-card glass-panel">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span class="badge-status ${statusClass}">${report.status}</span>
                        <small style="color: #7f8c8d;">${new Date(report.created_at).toLocaleDateString()}</small>
                    </div>
                    <h4 style="margin-bottom: 10px; color: var(--primary-color);">${report.type}</h4>
                    <p style="font-size: 0.9rem; margin-bottom: 15px;">${report.description || 'Sans description'}</p>
                    ${report.agent_feedback ? `
                        <div style="background: #f0f7f0; padding: 10px; border-radius: 8px; font-size: 0.85rem; border-left: 3px solid var(--secondary-color);">
                            <b>Retour de l'agent :</b> ${report.agent_feedback}
                        </div>
                    ` : ''}
                </div>
            `;
        });

        // Render Badges
        badgesList.innerHTML = '';
        if (rewards.length === 0) {
            badgesList.innerHTML = '<p style="color: #7f8c8d; font-size: 0.9rem;">Vos badges apparaîtront ici dès qu\'une mission sera validée.</p>';
        }

        rewards.forEach(reward => {
            badgesList.innerHTML += `
                <div class="badge-item">
                    <span class="badge-icon">🏅</span>
                    <div>
                        <div style="font-weight: 700; color: var(--secondary-color);">${reward.badge_name}</div>
                        <small>+${reward.points} pts</small>
                    </div>
                </div>
            `;
        });

    } catch(err) {
        console.error("Error loading activities", err);
    }
}

async function loadArticles() {
    const list = document.getElementById('articles-container');
    list.innerHTML = '<p>Chargement des articles...</p>';
    try {
        const res = await fetch(`${API_URL}/articles`);
        const { data } = await res.json();
        list.innerHTML = '';
        data.forEach(art => {
            list.innerHTML += `
                <div class="article-card glass-panel" style="padding: 20px;">
                    <span class="badge-status status-in-progress" style="background: var(--secondary-color); color: white; display: inline-block; margin-bottom: 10px;">${art.category}</span>
                    <h4 style="margin-bottom: 10px;">${art.title}</h4>
                    <p style="font-size: 0.9rem; color: #555;">${art.content.substring(0, 100)}...</p>
                </div>
            `;
        });
    } catch(e) {}
}

// --- QUIZ LOGIC ---
let currentQuizData = null;
let currentQuestionIndex = 0;
let userScore = 0;

async function loadQuizzes() {
    const container = document.getElementById('quizzes-container');
    container.innerHTML = '<p>Chargement des défis...</p>';
    try {
        const res = await fetch(`${API_URL}/quizzes`);
        const { data } = await res.json();
        container.innerHTML = '';
        data.forEach(q => {
            container.innerHTML += `
                <div class="article-card glass-panel" style="padding: 20px; border-top: 4px solid var(--primary-color);">
                    <h4 style="margin-bottom: 10px;">${q.title}</h4>
                    <p style="font-size: 0.9rem; color: #666; margin-bottom: 15px;">Catégorie: ${q.category}</p>
                    <button class="btn-primary" onclick="startQuiz(${q.id}, '${q.title}')" style="width: auto; padding: 8px 20px;">Participer (+${q.points_reward} pts)</button>
                </div>
            `;
        });
    } catch(e) {}
}

window.startQuiz = async (quizId, title) => {
    try {
        const token = localStorage.getItem('eco_token');
        const res = await fetch(`${API_URL}/quizzes/${quizId}/questions`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const { data } = await res.json();
        
        currentQuizData = { id: quizId, questions: data };
        currentQuestionIndex = 0;
        userScore = 0;
        
        document.getElementById('quiz-title').textContent = title;
        document.getElementById('quiz-modal').classList.remove('hidden');
        document.getElementById('quiz-question-container').classList.remove('hidden');
        document.getElementById('quiz-results').classList.add('hidden');
        
        showQuestion();
    } catch(e) { alert("Erreur lors du chargement du quiz"); }
};

function showQuestion() {
    const q = currentQuizData.questions[currentQuestionIndex];
    document.getElementById('question-text').textContent = `Question ${currentQuestionIndex + 1}/${currentQuizData.questions.length} : ${q.question}`;
    
    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';
    
    q.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'btn-secondary';
        btn.style.textAlign = 'left';
        btn.textContent = opt;
        btn.onclick = () => handleAnswer(idx);
        optionsContainer.appendChild(btn);
    });
}

function handleAnswer(choiceIdx) {
    const q = currentQuizData.questions[currentQuestionIndex];
    if (choiceIdx === q.correct_index) {
        userScore++;
        showToast("✅ Bonne réponse !");
    } else {
        showToast("❌ Mauvaise réponse", true);
    }
    
    currentQuestionIndex++;
    if (currentQuestionIndex < currentQuizData.questions.length) {
        showQuestion();
    } else {
        finishQuiz();
    }
}

async function finishQuiz() {
    const finalScore = Math.round((userScore / currentQuizData.questions.length) * 100);
    document.getElementById('quiz-question-container').classList.add('hidden');
    document.getElementById('quiz-results').classList.remove('hidden');
    document.getElementById('result-score').textContent = `Score: ${finalScore}%`;
    
    if (finalScore >= 80) {
        document.getElementById('result-message').innerHTML = "Bravo ! Vous êtes un véritable <b>Expert Écolo</b>. 50 points bonus ont été ajoutés à votre compte.";
    } else {
        document.getElementById('result-message').textContent = "Pas mal ! Continuez à apprendre pour protéger nos ressources.";
    }

    try {
        const token = localStorage.getItem('eco_token');
        await fetch(`${API_URL}/quizzes/${currentQuizData.id}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ score: finalScore })
        });
    } catch(e) {}
}

async function loadCommunityStats() {
    const container = document.getElementById('community-stats-container');
    if (!container) return;
    
    try {
        const res = await fetch(`${API_URL}/public/community-resources`);
        const { data } = await res.json();
        
        container.innerHTML = `
            <div class="report-card glass-panel" style="text-align: center; padding: 20px;">
                <div style="font-size: 2rem; margin-bottom: 10px;">💧</div>
                <h4 style="color: var(--secondary-color);">Gestion de l'Eau</h4>
                <p style="font-size: 1.5rem; font-weight: 800; color: #3498db;">${data.smartWaterPercentage}%</p>
                <small style="color: #666;">des réseaux équipés de Smart Meters</small>
            </div>
            <div class="report-card glass-panel" style="text-align: center; padding: 20px;">
                <div style="font-size: 2rem; margin-bottom: 10px;">⚡</div>
                <h4 style="color: var(--secondary-color);">Énergie Locale</h4>
                <p style="font-size: 1.5rem; font-weight: 800; color: #f39c12;">${data.averageBatteryLevel}%</p>
                <small style="color: #666;">Niveau moyen des batteries (Micro-réseaux)</small>
            </div>
            <div class="report-card glass-panel" style="text-align: center; padding: 20px;">
                <div style="font-size: 2rem; margin-bottom: 10px;">⛏️</div>
                <h4 style="color: var(--secondary-color);">Mines Vertes</h4>
                <p style="font-size: 1.5rem; font-weight: 800; color: #27ae60;">${data.averageCompliance}/100</p>
                <small style="color: #666;">Score moyen de conformité des sites</small>
            </div>
        `;
    } catch(e) {
        container.innerHTML = '<p>Impossible de charger les statistiques communautaires.</p>';
    }
}

async function loadImpactGallery() {
    const gallery = document.getElementById('impact-gallery');
    gallery.innerHTML = '<p>Chargement des victoires...</p>';
    
    try {
        const res = await fetch(`${API_URL}/reports`);
        const { data } = await res.json();
        
        // On ne montre que les signalements traités AVEC une photo "après"
        const successes = data.filter(r => r.status === 'Traité' && r.after_image_url);
        
        gallery.innerHTML = '';
        if (successes.length === 0) {
            gallery.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 40px; color: #7f8c8d;">Bientôt de nouvelles victoires ! Les agents sont sur le terrain.</p>';
            return;
        }

        successes.forEach(s => {
            gallery.innerHTML += `
                <div class="report-card glass-panel" style="padding: 15px;">
                    <h4 style="margin-bottom: 15px; color: var(--secondary-color); text-align: center;">${s.type}</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                        <div>
                            <p style="font-size: 0.7rem; font-weight: 800; text-align: center; margin-bottom: 5px; color: #e74c3c;">AVANT</p>
                            <img src="${s.image_url}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 6px; border: 1px solid #ddd;" />
                        </div>
                        <div>
                            <p style="font-size: 0.7rem; font-weight: 800; text-align: center; margin-bottom: 5px; color: #27ae60;">APRÈS</p>
                            <img src="${s.after_image_url}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 6px; border: 2px solid #27ae60;" />
                        </div>
                    </div>
                    <p style="font-size: 0.85rem; font-style: italic; color: #555;">"${s.agent_feedback || 'Restauration terminée !'}"</p>
                </div>
            `;
        });
    } catch(e) { gallery.innerHTML = 'Erreur de chargement'; }
}

window.closeQuiz = () => {
    document.getElementById('quiz-modal').classList.add('hidden');
    switchView('activities'); // Refresh activities to see points
};
