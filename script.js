// Configuration
const CONFIG = {
    mapCenter: [-39.0, -71.5],
    zoom: 5,
    darkLayer: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    satelliteLayer: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    reliefLayer: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    labelsLayer: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap, &copy; CARTO, &copy; Esri, &copy; OpenTopoMap',
    updateInterval: 5 * 60 * 1000 // 5 minutos
};

// State
let map, markers, evacuationLayer, parksLayer, cuencasLayer, firmsLayer;
const NASA_FIRMS_KEY = '7ee5dc2f69cd07492f239b439314eeb9';
let volcanoesData = [];
let userPrefs = {
    theme: localStorage.getItem('theme') || 'dark',
    soundEnabled: localStorage.getItem('soundEnabled') !== 'false'
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    updateSoundIcon();
    initMap();
    loadData();
    setupEventListeners();
    startPeriodicUpdates();
});

function applyTheme() {
    if (userPrefs.theme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }
}

function initMap() {
    const dark = L.tileLayer(CONFIG.darkLayer, { attribution: CONFIG.attribution });
    const satellite = L.tileLayer(CONFIG.satelliteLayer, { attribution: CONFIG.attribution });
    const relief = L.tileLayer(CONFIG.reliefLayer, { attribution: CONFIG.attribution });
    const labels = L.tileLayer(CONFIG.labelsLayer, { attribution: CONFIG.attribution });

    const hybrid = L.layerGroup([satellite, labels]);

    map = L.map('map', {
        zoomControl: false,
        layers: [userPrefs.theme === 'light' ? relief : dark]
    }).setView(CONFIG.mapCenter, CONFIG.zoom);

    const baseMaps = {
        "Relieve": relief,
        "Satelital": satellite,
        "Híbrido": hybrid,
        "Mapa Oscuro": dark
    };

    L.control.layers(baseMaps, null, { position: 'bottomleft' }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    markers = L.markerClusterGroup({
        showCoverageOnHover: false,
        iconCreateFunction: (cluster) => {
            return L.divIcon({
                html: `<div class="glass" style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; border: 1px solid rgba(255,255,255,0.2)">${cluster.getChildCount()}</div>`,
                className: 'cluster-icon',
                iconSize: [40, 40]
            });
        }
    });
    map.addLayer(markers);

    // Inicializar capa NASA FIRMS (Anomalías térmicas de 24 horas - VIIRS Suomi-NPP)
    firmsLayer = L.tileLayer.wms(`https://firms.modaps.eosdis.nasa.gov/mapserver/wms/fires/${NASA_FIRMS_KEY}/`, {
        layers: 'fires_viirs_snpp_24',
        format: 'image/png',
        transparent: true,
        attribution: 'NASA FIRMS'
    }).addTo(map);

    // Agregar control satelital GOES-19
    addSatelliteControl();
}

// Función para agregar control satelital GOES-19
function addSatelliteControl() {
    const SatelliteControl = L.Control.extend({
        onAdd: function(map) {
            const div = L.DomUtil.create('div', 'satellite-control');
            div.innerHTML = `
                <div style="background:rgba(26, 37, 47, 0.9); backdrop-filter: blur(5px); color:white; padding:12px; border-radius:10px; text-align:center; min-width:220px; box-shadow:0 2px 10px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);">
                    <strong style="font-size:14px;">🛰️ GOES-19 (NOAA)</strong>
                    <div style="margin-top:10px;">
                        <button onclick="window.open('https://www.star.nesdis.noaa.gov/GOES/sector.php?sat=G19&sector=southam', '_blank')" 
                                style="background:#0066cc; border:none; color:white; padding:6px 12px; margin:3px; border-radius:5px; cursor:pointer; font-size:11px; transition: 0.3s;">
                            🌎 Sudamérica
                        </button>
                        <button onclick="window.open('https://www.star.nesdis.noaa.gov/GOES/sector_band.php?sat=G19&sector=CONUS&band=GeoColor&length=24', '_blank')" 
                                style="background:#2e7d32; border:none; color:white; padding:6px 12px; margin:3px; border-radius:5px; cursor:pointer; font-size:11px; transition: 0.3s;">
                            🎨 Color Real
                        </button>
                        <button onclick="window.open('https://www.star.nesdis.noaa.gov/GOES/sector_band.php?sat=G19&sector=southam&band=Band13&length=24', '_blank')" 
                                style="background:#e74c3c; border:none; color:white; padding:6px 12px; margin:3px; border-radius:5px; cursor:pointer; font-size:11px; transition: 0.3s;">
                            🔥 Infrarrojo
                        </button>
                    </div>
                    <p style="font-size:10px; margin:8px 0 0 0; color:#aaa;">Actualizado cada 10-15 min | GOES-19</p>
                </div>
            `;
            return div;
        }
    });
    
    new SatelliteControl({ position: 'bottomright' }).addTo(map);
}

async function loadData() {
    try {
        document.getElementById('systemStatus').innerHTML = '<span class="status-dot"></span> <span class="status-text">Cargando...</span>';
        
        const [vResponse, eResponse, pResponse, cResponse] = await Promise.all([
            fetch('data/volcanoes.json'),
            fetch('data/evacuation_zones.json'),
            fetch('data/national_parks.json'),
            fetch('data/cuencas.json')
        ]);

        volcanoesData = await vResponse.json();
        // Ordenar por ranking de riesgo
        volcanoesData.sort((a, b) => a.risk_rank - b.risk_rank);
        
        const evacuationGeoJSON = await eResponse.json();
        const parksGeoJSON = await pResponse.json();
        const cuencasGeoJSON = await cResponse.json();

        renderVolcanoes(volcanoesData);
        renderVolcanoList(volcanoesData);
        initEvacuationLayer(evacuationGeoJSON);
        initParksLayer(parksGeoJSON);
        initCuencasLayer(cuencasGeoJSON);
        updateStats();

        document.getElementById('systemStatus').innerHTML = '<span class="status-dot"></span> <span class="status-text">Conectado</span>';
        updateTimestamp();

        // Check URL params for sharing
        const urlParams = new URLSearchParams(window.location.search);
        const sharedVolcanoId = urlParams.get('volcano');
        if (sharedVolcanoId) {
            const v = volcanoesData.find(x => x.id === sharedVolcanoId);
            if (v) {
                setTimeout(() => showVolcanoDetails(v), 1000);
            }
        }

    } catch (error) {
        console.error('Error cargando datos:', error);
        document.getElementById('systemStatus').innerHTML = '<span class="status-dot offline"></span> <span class="status-text">Error</span>';
    }
}

function renderVolcanoes(data) {
    markers.clearLayers();
    
    data.forEach(volcano => {
        const color = getStatusColor(volcano.status);
        const isDangerous = volcano.status.toLowerCase() === 'roja' || volcano.status.toLowerCase() === 'naranja';
        const markerClass = isDangerous ? `marker-${volcano.status.toLowerCase()}` : '';

        const markerIcon = L.divIcon({
            html: `<div class="custom-marker ${markerClass}" style="width: 20px; height: 20px; background: white; border-radius: 50%; padding: 2px;">
                    <div class="marker-inner" style="background: ${color};"></div>
                   </div>`,
            className: '',
            iconSize: [20, 20]
        });

        const marker = L.marker(volcano.coordinates, { icon: markerIcon });

        marker.on('click', () => {
            showVolcanoDetails(volcano);
            updateUrlParams(volcano.id);
        });
        marker.bindTooltip(volcano.name, { direction: 'top', offset: [0, -10] });
        
        markers.addLayer(marker);
    });
}

function renderVolcanoList(data) {
    const listContainer = document.getElementById('volcanoList');
    listContainer.innerHTML = '';

    data.forEach(volcano => {
        const li = document.createElement('li');
        li.className = `volcano-item ${volcano.status.toLowerCase()}`;
        li.innerHTML = `
            <div class="v-item-header">
                <span class="v-item-name">${volcano.name}</span>
                <span class="v-item-rank">#${volcano.risk_rank}</span>
            </div>
            <div class="v-item-region">${volcano.region}</div>
            <div class="v-item-footer">
                <span class="v-item-alert ${volcano.status.toLowerCase()}">Alerta ${volcano.status}</span>
                <button class="center-btn" title="Centrar mapa" onclick="event.stopPropagation(); flyToVolcano([${volcano.coordinates}], 11)">🎯</button>
            </div>
        `;
        li.onclick = () => {
            showVolcanoDetails(volcano);
            updateUrlParams(volcano.id);
        };
        listContainer.appendChild(li);
    });
}

function initEvacuationLayer(geojsonData) {
    evacuationLayer = L.geoJSON(geojsonData, {
        style: (feature) => {
            const risk = feature.properties.danger_level;
            return {
                color: risk === 'Alto' ? '#ff3333' : '#ffcc00',
                weight: 2,
                fillColor: risk === 'Alto' ? '#ff3333' : '#ffcc00',
                fillOpacity: 0.3,
                dashArray: risk === 'Alto' ? '0' : '5, 5'
            };
        },
        onEachFeature: (feature, layer) => {
            layer.bindPopup(`<strong>${feature.properties.type}</strong><br>${feature.properties.name || feature.properties.volcano}`);
        }
    }).addTo(map);
}

function initParksLayer(geojsonData) {
    parksLayer = L.geoJSON(geojsonData, {
        style: { color: '#2e7d32', weight: 2, fillColor: '#2e7d32', fillOpacity: 0.2, dashArray: '10, 10' }
    });
}

function initCuencasLayer(geojsonData) {
    cuencasLayer = L.geoJSON(geojsonData, {
        style: {
            color: '#00bcd4',
            weight: 2,
            fillColor: '#00bcd4',
            fillOpacity: 0.15,
            dashArray: '4, 4'
        },
        onEachFeature: (feature, layer) => {
            layer.bindPopup(`<strong>💧 ${feature.properties.name}</strong><br><small>${feature.properties.description}</small>`);
        }
    }).addTo(map);
}

function showVolcanoDetails(volcano) {
    const sidebar = document.getElementById('sidebar');
    const content = document.getElementById('sidebarContent');
    
    sidebar.classList.remove('hidden');
    
    content.innerHTML = `
        <div class="volcano-details">
            <div class="volcano-image-container">
                <img src="${volcano.image}" alt="${volcano.name}" onerror="this.src='https://via.placeholder.com/400x200?text=Imagen+no+disponible'">
            </div>
            <span class="status-badge ${volcano.status.toLowerCase()}">ALERTA ${volcano.status.toUpperCase()}</span>
            <h2>${volcano.name}</h2>
            <span class="volcano-region">Región de ${volcano.region}</span>
            <p class="description">${volcano.description}</p>
            
            <div class="section-title">Información Técnica</div>
            <div class="info-grid">
                <div class="info-card">
                    <span class="label">Ranking Riesgo</span>
                    <span class="value">#${volcano.risk_rank}</span>
                </div>
                <div class="info-card">
                    <span class="label">Elevación</span>
                    <span class="value">${volcano.elevation} m</span>
                </div>
            </div>

            <div class="section-title">Satélite GOES-16 (S3 NOAA)</div>
            <div class="webcam-preview" style="position: relative; overflow: hidden; background: #000; border: 1px solid rgba(255,255,255,0.1); height: 220px;">
                <img src="https://mesonet.agron.iastate.edu/cgi-bin/wms/goes/global_ir.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=goes_global_ir&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=false&HEIGHT=300&WIDTH=400&SRS=EPSG%3A4326&BBOX=${volcano.coordinates[1] - 1.5},${volcano.coordinates[0] - 1.0},${volcano.coordinates[1] + 1.5},${volcano.coordinates[0] + 1.0}" 
                     alt="Satélite GOES-16" 
                     style="width: 100%; height: 100%; object-fit: cover; opacity: 0.9;">
                <div class="live-tag" style="background: #e91e63;">📡 AWS S3 LIVE</div>
                <div id="satelliteMeta" style="position: absolute; bottom: 5px; left: 10px; font-size: 9px; color: rgba(255,255,255,0.7); background: rgba(0,0,0,0.5); padding: 2px 5px; border-radius: 3px;">
                    Sincronizando con noaa-goes16...
                </div>
            </div>

            <div class="sidebar-actions" style="display: flex; gap: 10px; margin-top: 20px;">
                <button class="routing-btn" style="flex: 1;" onclick="routeToSafeZone([${volcano.coordinates}])">
                    🚑 Protocolo de Evacuación
                </button>
            </div>
        </div>
    `;

    flyToVolcano(volcano.coordinates, 12);
}

function flyToVolcano(coords, zoom = 12) {
    map.flyTo(coords, zoom, { duration: 1.5 });
}

function updateUrlParams(volcanoId) {
    const url = new URL(window.location);
    url.searchParams.set('volcano', volcanoId);
    window.history.pushState({}, '', url);
}

function getStatusColor(status) {
    switch (status.toLowerCase()) {
        case 'verde': return 'var(--accent-verde)';
        case 'amarilla': return 'var(--accent-amarilla)';
        case 'naranja': return 'var(--accent-naranja)';
        case 'roja': return 'var(--accent-roja)';
        default: return '#a0a0a0';
    }
}

// Interactivity & Events
function setupEventListeners() {
    // Search
    document.getElementById('volcanoSearch').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = volcanoesData.filter(v => v.name.toLowerCase().includes(term));
        renderVolcanoes(filtered);
        renderVolcanoList(filtered);
    });

    // Sidebar Close
    document.getElementById('closeSidebar').addEventListener('click', () => {
        document.getElementById('sidebar').classList.add('hidden');
        // Quitar de URL
        const url = new URL(window.location);
        url.searchParams.delete('volcano');
        window.history.pushState({}, '', url);
    });

    // Theme Toggle
    document.getElementById('btnTheme').addEventListener('click', () => {
        userPrefs.theme = userPrefs.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', userPrefs.theme);
        applyTheme();
    });

    // Sound Toggle
    document.getElementById('btnSound').addEventListener('click', () => {
        userPrefs.soundEnabled = !userPrefs.soundEnabled;
        localStorage.setItem('soundEnabled', userPrefs.soundEnabled);
        updateSoundIcon();
        if(userPrefs.soundEnabled) playSound(); // test sound
    });

    // Panel Toggle
    document.getElementById('btnTogglePanel').addEventListener('click', () => {
        const panel = document.getElementById('priorityPanel');
        panel.classList.toggle('hidden');
    });

    // View All
    document.getElementById('btnViewAll').addEventListener('click', () => {
        map.setView(CONFIG.mapCenter, CONFIG.zoom);
    });

    // Toggle Cuencas Layer
    const toggleCuencas = document.getElementById('toggleCuencas');
    if(toggleCuencas) {
        toggleCuencas.addEventListener('change', (e) => {
            if (e.target.checked) {
                map.addLayer(cuencasLayer);
            } else {
                map.removeLayer(cuencasLayer);
            }
        });
    }

    // Toggle NASA FIRMS Layer
    const toggleFirms = document.getElementById('toggleFirms');
    if(toggleFirms) {
        toggleFirms.addEventListener('change', (e) => {
            if (e.target.checked) {
                map.addLayer(firmsLayer);
            } else {
                map.removeLayer(firmsLayer);
            }
        });
    }

    // Toggle Evacuation Layer
    const toggleEvacuation = document.getElementById('toggleEvacuation');
    if(toggleEvacuation) {
        toggleEvacuation.addEventListener('change', (e) => {
            if (e.target.checked) {
                map.addLayer(evacuationLayer);
            } else {
                map.removeLayer(evacuationLayer);
            }
        });
    }
    document.getElementById('btnGeolocation').addEventListener('click', geolocateUser);

    // PDF Export
    document.getElementById('btnPdf').addEventListener('click', generatePDF);
    
    // Toast Close
    document.getElementById('toastClose').addEventListener('click', () => {
        document.getElementById('toastNotification').classList.add('hidden');
    });
}

function updateSoundIcon() {
    document.getElementById('btnSound').textContent = userPrefs.soundEnabled ? '🔊' : '🔇';
}

function updateStats() {
    const activeAlerts = volcanoesData.filter(v => v.status.toLowerCase() !== 'verde').length;
    document.querySelector('#alertCounter .value').textContent = `${activeAlerts} de ${volcanoesData.length}`;
}

function updateTimestamp() {
    const now = new Date();
    document.getElementById('lastUpdate').textContent = `Última act: ${now.toLocaleTimeString()}`;
}

// Periodic Updates & Notifications
function startPeriodicUpdates() {
    setInterval(async () => {
        try {
            // Aquí iría la llamada a api/getAlerts.js
            // Por ahora simulamos volviendo a cargar el JSON y mockeando un cambio aleatorio para demostrar
            const response = await fetch('data/volcanoes.json');
            let newData = await response.json();
            
            checkAlertChanges(newData);
            volcanoesData = newData.sort((a, b) => a.risk_rank - b.risk_rank);
            
            renderVolcanoes(volcanoesData);
            renderVolcanoList(volcanoesData);
            updateStats();
            updateTimestamp();
        } catch(e) {
            console.error("Update failed", e);
        }
    }, CONFIG.updateInterval);
}

function checkAlertChanges(newData) {
    newData.forEach(newV => {
        const oldV = volcanoesData.find(v => v.id === newV.id);
        if (oldV && oldV.status !== newV.status) {
            // Hubo un cambio de alerta!
            showToast(`¡Cambio en ${newV.name}!`, `El nivel de alerta pasó de ${oldV.status} a ${newV.status}.`);
            playSound();
            // Lo ideal sería moverlo visualmente al tope, pero como ordenamos por risk_rank,
            // podemos simplemente hacerle un destello visual si el panel está abierto
        }
    });
}

function showToast(title, message) {
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastMessage').textContent = message;
    const toast = document.getElementById('toastNotification');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 5000);
}

function playSound() {
    if (!userPrefs.soundEnabled) return;
    const audio = document.getElementById('alertSound');
    audio.currentTime = 0;
    audio.play().catch(e => console.log("Auto-play prevented"));
}

// Geolocation & Distance
function geolocateUser() {
    if (!navigator.geolocation) {
        alert("Geolocalización no soportada por el navegador.");
        return;
    }
    
    document.getElementById('btnGeolocation').classList.add('active');
    
    navigator.geolocation.getCurrentPosition(pos => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        
        L.marker([userLat, userLng], {
            icon: L.divIcon({ html: '🔵', className: 'user-location', iconSize: [20,20] })
        }).addTo(map).bindPopup("Tu ubicación").openPopup();
        
        map.flyTo([userLat, userLng], 8);
        
        // Comprobar distancias a volcanes peligrosos
        checkProximity(userLat, userLng);
        
        setTimeout(() => document.getElementById('btnGeolocation').classList.remove('active'), 2000);
    }, err => {
        alert("Error obteniendo ubicación.");
        document.getElementById('btnGeolocation').classList.remove('active');
    });
}

function checkProximity(lat, lng) {
    volcanoesData.forEach(v => {
        if (v.status.toLowerCase() === 'naranja' || v.status.toLowerCase() === 'roja') {
            const dist = getDistanceFromLatLonInKm(lat, lng, v.coordinates[0], v.coordinates[1]);
            if (dist < 50) {
                showToast("¡Peligro de Proximidad!", `Estás a ${dist.toFixed(1)} km del volcán ${v.name} (Alerta ${v.status}).`);
                playSound();
            }
        }
    });
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2-lat1);
  const dLon = deg2rad(lon2-lon1); 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; 
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

// PDF Generation
function generatePDF() {
    const element = document.getElementById('priorityPanel');
    const opt = {
      margin:       1,
      filename:     'Reporte_Volcanes_Chile.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    // Cambiamos temporalmente los estilos para que se vea bien en PDF
    element.style.background = '#fff';
    element.style.color = '#000';
    
    html2pdf().set(opt).from(element).save().then(() => {
        // Restaurar estilos
        element.style.background = '';
        element.style.color = '';
    });
}

function routeToSafeZone(coords) {
    alert("Calculando ruta de evacuación hacia el punto seguro más cercano...");
}
