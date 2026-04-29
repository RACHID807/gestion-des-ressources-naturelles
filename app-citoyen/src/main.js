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
  }
}

navMap.addEventListener('click', () => switchView('map'));
navReport.addEventListener('click', () => switchView('report'));
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
        // Clear old markers if we had keep records of them
        const token = localStorage.getItem('eco_token');
        const headers = { 'Authorization': `Bearer ${token}` };

        // Fetch resources (Public or protected)
        const res1 = await fetch(`${API_URL}/resources`, { headers });
        const data1 = await res1.json();
        
        // Fetch reports to show on map too (Protected)
        const res2 = await fetch(`${API_URL}/reports`, { headers });
        const data2 = await res2.json();

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
    } catch(err) {
        console.error("Erreur chargement carte:", err);
    }
}

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
        };
        reader.readAsDataURL(file);
    } else {
        fileNameLabel.textContent = "Aucun fichier choisi";
        imagePreview.classList.add('hidden');
    }
});

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
