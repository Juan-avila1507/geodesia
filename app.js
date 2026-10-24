import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Constantes Físicas
const EARTH_RADIUS_KM = 6371.0088;
const GLOBE_RADIUS_3D = 5;

// Variables de Estado
let activeTargetMode = null;
let currentLat1 = 10.9685;
let currentLon1 = -74.7813;
let currentLat2 = 4.7110;
let currentLon2 = -74.0721;

let selectedFormula = 'haversine';

// Timer de Inactividad para Auto-rotación
let idleTimer = null;
let isAutoRotating = false;

// Elementos Three.js
let scene, camera, renderer, controls;
let earthGroup, earthMesh, markerA, markerB, arcMesh;
let raycaster, mousePointer;

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

// --- 1. LÓGICA DE CÁLCULO Y DESGLOSE ---
function calculateDistances(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const haversineLatitudeTerm = Math.sin(Δφ / 2) ** 2;
  const haversineLongitudeTerm = Math.cos(φ1) * Math.cos(φ2) * (Math.sin(Δλ / 2) ** 2);

  // 1. Haversine
  const haversineA = haversineLatitudeTerm + haversineLongitudeTerm;
  const a = Math.max(0, Math.min(1, haversineA));
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const haversineKm = EARTH_RADIUS_KM * c;

  // 2. Ley de Cosenos
  const cosineLatitudeTerm = Math.sin(φ1) * Math.sin(φ2);
  const cosineLongitudeTerm = Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  let cosTerm = cosineLatitudeTerm + cosineLongitudeTerm;
  cosTerm = Math.max(-1, Math.min(1, cosTerm));
  const cosinesKm = EARTH_RADIUS_KM * Math.acos(cosTerm);

  return {
    lat1, lon1, lat2, lon2, φ1, φ2, Δφ, Δλ, a, c, cosTerm,
    haversineLatitudeTerm, haversineLongitudeTerm,
    cosineLatitudeTerm, cosineLongitudeTerm,
    haversineKm,
    haversineMi: haversineKm * 0.621371,
    cosinesKm,
    cosinesMi: cosinesKm * 0.621371
  };
}

function updateUI() {
  const res = calculateDistances(currentLat1, currentLon1, currentLat2, currentLon2);

  const elHav = document.getElementById('dist-haversine');
  const elHavMi = document.getElementById('dist-haversine-miles');
  const elCos = document.getElementById('dist-cosines');
  const elCosMi = document.getElementById('dist-cosines-miles');
  const routeDistance = document.getElementById('route-distance');
  const routeDistanceMiles = document.getElementById('route-distance-miles');

  if (elHav) elHav.innerText = `${res.haversineKm.toFixed(2)} km`;
  if (elHavMi) elHavMi.innerText = `${res.haversineMi.toFixed(2)} mi`;
  if (elCos) elCos.innerText = `${res.cosinesKm.toFixed(2)} km`;
  if (elCosMi) elCosMi.innerText = `${res.cosinesMi.toFixed(2)} mi`;
  if (routeDistance) routeDistance.innerText = `${res.haversineKm.toFixed(2)} km`;
  if (routeDistanceMiles) routeDistanceMiles.innerText = `${res.haversineMi.toFixed(2)} mi`;

  renderStepByStep(res);
  update3DVisuals();
  resetIdleTimer();
}

function renderStepByStep(res) {
  const titleElem = document.getElementById('step-title');
  const contentElem = document.getElementById('step-content');
  if (!titleElem || !contentElem) return;

  if (selectedFormula === 'haversine') {
    titleElem.innerText = 'Fórmula de Haversine';
    contentElem.innerHTML = `
      <div class="formula-definition">
        <b>¿Qué calcula?</b>
        <span>El ángulo central c entre los puntos. Luego se multiplica por el radio para obtener la distancia.</span>
        <span>φ representa la latitud, λ la longitud y R el radio medio de la Tierra.</span>
      </div>
      <div class="math-step">
        <span class="math-step-number">1</span>
        <div><b>Convertir coordenadas y hallar sus diferencias</b>
          <div class="math-expression">φ₁ = ${res.lat1.toFixed(4)}° × π/180 = ${res.φ1.toFixed(6)} rad</div>
          <div class="math-expression">φ₂ = ${res.lat2.toFixed(4)}° × π/180 = ${res.φ2.toFixed(6)} rad</div>
          <div class="math-expression">Δφ = φ₂ − φ₁ = ${res.Δφ.toFixed(6)} rad</div>
          <div class="math-expression">Δλ = (${res.lon2.toFixed(4)}°) − (${res.lon1.toFixed(4)}°) = ${(res.lon2 - res.lon1).toFixed(4)}°</div>
          <div class="math-expression">Δλ = ${(res.lon2 - res.lon1).toFixed(4)}° × π/180 = ${res.Δλ.toFixed(6)} rad</div>
        </div>
      </div>
      <div class="math-step">
        <span class="math-step-number">2</span>
        <div><b>Calcular el parámetro a</b>
          <div class="math-expression">a = sin²(Δφ/2) + cos(φ₁) cos(φ₂) sin²(Δλ/2)</div>
          <div class="math-expression">${res.haversineLatitudeTerm.toFixed(6)} + ${res.haversineLongitudeTerm.toFixed(6)} = <strong>${res.a.toFixed(6)}</strong></div>
          <span class="math-note">El valor a resume la separación angular de los puntos.</span>
        </div>
      </div>
      <div class="math-step">
        <span class="math-step-number">3</span>
        <div><b>Obtener el ángulo central c</b>
          <div class="math-expression">c = 2 atan2(√a, √(1 − a))</div>
          <div class="math-expression">c = <strong>${res.c.toFixed(6)} rad</strong></div>
        </div>
      </div>
      <div class="math-step">
        <span class="math-step-number">4</span>
        <div><b>Convertir el ángulo en distancia</b>
          <div class="math-expression">d = R · c = ${EARTH_RADIUS_KM} km × ${res.c.toFixed(6)}</div>
          <div class="math-result">${res.haversineKm.toFixed(2)} km <span>(${res.haversineMi.toFixed(2)} mi)</span></div>
        </div>
      </div>
    `;
  } else {
    titleElem.innerText = 'Ley de Cosenos Esféricos';
    const centralAngle = Math.acos(res.cosTerm);
    contentElem.innerHTML = `
      <div class="formula-definition">
        <b>¿Qué calcula?</b>
        <span>Primero encuentra el ángulo central Δσ entre los puntos. La distancia es ese ángulo multiplicado por el radio.</span>
        <span>φ representa la latitud, λ la longitud y R el radio medio de la Tierra.</span>
      </div>
      <div class="math-step">
        <span class="math-step-number">1</span>
        <div><b>Convertir coordenadas a radianes</b>
          <div class="math-expression">φ₁ = ${res.lat1.toFixed(4)}° × π/180 = ${res.φ1.toFixed(6)} rad</div>
          <div class="math-expression">φ₂ = ${res.lat2.toFixed(4)}° × π/180 = ${res.φ2.toFixed(6)} rad</div>
          <div class="math-expression">Δλ = ((${res.lon2.toFixed(4)}°) − (${res.lon1.toFixed(4)}°)) × π/180 = ${res.Δλ.toFixed(6)} rad</div>
        </div>
      </div>
      <div class="math-step">
        <span class="math-step-number">2</span>
        <div><b>Calcular el coseno del ángulo central</b>
          <div class="math-expression">cos(Δσ) = sin(φ₁) sin(φ₂) + cos(φ₁) cos(φ₂) cos(Δλ)</div>
          <div class="math-expression">${res.cosineLatitudeTerm.toFixed(6)} + ${res.cosineLongitudeTerm.toFixed(6)} = <strong>${res.cosTerm.toFixed(6)}</strong></div>
        </div>
      </div>
      <div class="math-step">
        <span class="math-step-number">3</span>
        <div><b>Despejar el ángulo central</b>
          <div class="math-expression">Δσ = arccos(${res.cosTerm.toFixed(6)})</div>
          <div class="math-expression">Δσ = <strong>${centralAngle.toFixed(6)} rad</strong></div>
        </div>
      </div>
      <div class="math-step">
        <span class="math-step-number">4</span>
        <div><b>Convertir el ángulo en distancia</b>
          <div class="math-expression">d = R · Δσ = ${EARTH_RADIUS_KM} km × ${centralAngle.toFixed(6)}</div>
          <div class="math-result">${res.cosinesKm.toFixed(2)} km <span>(${res.cosinesMi.toFixed(2)} mi)</span></div>
        </div>
      </div>
    `;
  }
}

// --- 2. CONTROL DE INACTIVIDAD ---
function resetIdleTimer() {
  isAutoRotating = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    isAutoRotating = true;
  }, 10000);
}

// --- 3. TEXTURA TÉCNICA (CON ECUADOR Y MERIDIANO COMPLETO ADELANTE Y ATRÁS) ---
function createTechnicalGridTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#060d1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
  ctx.lineWidth = 1;
  for (let y = 64; y < canvas.height; y += 64) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  for (let x = 64; x < canvas.width; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 2.5;

  ctx.beginPath(); 
  ctx.moveTo(0, canvas.height / 2); 
  ctx.lineTo(canvas.width, canvas.height / 2); 
  ctx.stroke();

  ctx.beginPath(); 
  ctx.moveTo(canvas.width / 2, 0); 
  ctx.lineTo(canvas.width / 2, canvas.height); 
  ctx.stroke();

  ctx.beginPath(); 
  ctx.moveTo(0, 0); 
  ctx.lineTo(0, canvas.height); 
  ctx.moveTo(canvas.width, 0); 
  ctx.lineTo(canvas.width, canvas.height); 
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

// --- 4. ESCENA THREE.JS ---
function init3D() {
  const container = document.getElementById('canvas-container');

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x030712, 0.02);

  const canvasBounds = container.getBoundingClientRect();
  camera = new THREE.PerspectiveCamera(45, canvasBounds.width / canvasBounds.height, 0.1, 1000);
  camera.position.set(0, 0, 15);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(canvasBounds.width, canvasBounds.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = false;
  controls.enableZoom = false;

  controls.addEventListener('start', () => resetIdleTimer());

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.8);
  dirLight.position.set(10, 10, 10);
  scene.add(dirLight);

  // Grupo Padre Rotacional
  earthGroup = new THREE.Group();
  scene.add(earthGroup);

  const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS_3D, 64, 64);
  const earthMat = new THREE.MeshStandardMaterial({ 
    map: createTechnicalGridTexture(), 
    roughness: 0.4,
    metalness: 0.1 
  });
  earthMesh = new THREE.Mesh(earthGeo, earthMat);
  earthGroup.add(earthMesh);

  const atmosGeo = new THREE.SphereGeometry(GLOBE_RADIUS_3D * 1.02, 64, 64);
  const atmosMat = new THREE.MeshBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.12, side: THREE.BackSide });
  earthGroup.add(new THREE.Mesh(atmosGeo, atmosMat));

  const markerGeo = new THREE.SphereGeometry(0.14, 16, 16);
  markerA = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
  markerB = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x34d399 }));
  earthGroup.add(markerA);
  earthGroup.add(markerB);

  raycaster = new THREE.Raycaster();
  mousePointer = new THREE.Vector2();

  window.addEventListener('resize', onWindowResize);
  renderer.domElement.addEventListener('pointerdown', onGlobeClick);

  animate();
}

// --- 5. CONVERSIÓN GPS A VECTOR 3D ---
function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function vector3ToLatLon(vector) {
  const norm = vector.clone().normalize();
  const lat = 90 - (Math.acos(norm.y) * (180 / Math.PI));
  let lon = ((Math.atan2(norm.z, -norm.x) * (180 / Math.PI)) - 180);
  if (lon < -180) lon += 360;
  if (lon > 180) lon -= 360;
  return { lat, lon };
}

// =========================================================================
// --- IMPLEMENTACIÓN DE LA FUNCIONALIDAD DEL ARCO GEODÉSICO ENTRE PUNTOS ---
// =========================================================================
function update3DVisuals() {
  if (!markerA || !markerB) return;

  // 1. Posicionar marcadores
  const markerRadius = GLOBE_RADIUS_3D * 1.008;
  const posA = latLonToVector3(currentLat1, currentLon1, markerRadius);
  const posB = latLonToVector3(currentLat2, currentLon2, markerRadius);

  markerA.position.copy(posA);
  markerB.position.copy(posB);

  // 2. Limpiar arco anterior
  if (arcMesh) {
    earthGroup.remove(arcMesh);
    arcMesh.geometry.dispose();
    arcMesh.material.dispose();
    arcMesh = null;
  }

  // 3. Construir el arco geodésico como un tubo 3D para que destaque sobre la esfera.
  const positions = [];
  const numSegments = 100;
  const arcRadius = GLOBE_RADIUS_3D + 0.08;
  const unitA = posA.clone().normalize();
  const unitB = posB.clone().normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(unitA, unitB);
  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments;
    const interpolated = unitA.clone().applyQuaternion(
      new THREE.Quaternion().identity().slerp(rotation, t)
    );
    const elevation = Math.sin(t * Math.PI) * 0.04;
    interpolated.normalize().multiplyScalar(arcRadius + elevation);
    positions.push(interpolated);
  }

  const curve = new THREE.CatmullRomCurve3(positions);
  const geometry = new THREE.TubeGeometry(curve, numSegments, 0.035, 8, false);
  const material = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    depthTest: true,
    toneMapped: false
  });

  arcMesh = new THREE.Mesh(geometry, material);
  earthGroup.add(arcMesh);
}
// =========================================================================

function onGlobeClick(event) {
  resetIdleTimer();
  if (!activeTargetMode) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mousePointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mousePointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mousePointer, camera);
  const intersects = raycaster.intersectObject(earthMesh);

  if (intersects.length > 0) {
    const localHitPoint = earthMesh.worldToLocal(intersects[0].point.clone());
    const { lat, lon } = vector3ToLatLon(localHitPoint);

    if (activeTargetMode === 'A') {
      currentLat1 = parseFloat(lat.toFixed(4));
      currentLon1 = parseFloat(lon.toFixed(4));
      document.getElementById('lat1').value = currentLat1;
      document.getElementById('lon1').value = currentLon1;
    } else {
      currentLat2 = parseFloat(lat.toFixed(4));
      currentLon2 = parseFloat(lon.toFixed(4));
      document.getElementById('lat2').value = currentLat2;
      document.getElementById('lon2').value = currentLon2;
    }

    activeTargetMode = null;
    updateTargetButtonsUI();
    updateUI();
  }
}

function updateTargetButtonsUI() {
  const btnA = document.getElementById('mode-a');
  const btnB = document.getElementById('mode-b');
  const statusElem = document.getElementById('pick-status');

  btnA.className = activeTargetMode === 'A' ? 'toggle-btn active-a' : 'toggle-btn';
  btnB.className = activeTargetMode === 'B' ? 'toggle-btn active-b' : 'toggle-btn';

  if (activeTargetMode) {
    statusElem.innerText = `Haz clic en el mapa 3D para posicionar el Punto ${activeTargetMode}.`;
    statusElem.style.color = activeTargetMode === 'A' ? '#38bdf8' : '#34d399';
  } else {
    statusElem.innerText = 'Modo marcado: Inactivo (Arrastra el globo para rotar)';
    statusElem.style.color = '#64748b';
  }
}

function setupEvents() {
  const btnA = document.getElementById('mode-a');
  const btnB = document.getElementById('mode-b');

  btnA.addEventListener('click', () => {
    activeTargetMode = activeTargetMode === 'A' ? null : 'A';
    updateTargetButtonsUI();
  });

  btnB.addEventListener('click', () => {
    activeTargetMode = activeTargetMode === 'B' ? null : 'B';
    updateTargetButtonsUI();
  });

  const onInput = () => {
    currentLat1 = parseFloat(document.getElementById('lat1').value) || 0;
    currentLon1 = parseFloat(document.getElementById('lon1').value) || 0;
    currentLat2 = parseFloat(document.getElementById('lat2').value) || 0;
    currentLon2 = parseFloat(document.getElementById('lon2').value) || 0;
    updateUI();
  };

  ['lat1', 'lon1', 'lat2', 'lon2'].forEach(id => {
    document.getElementById(id).addEventListener('input', onInput);
  });

  document.getElementById('preset-baq-bog').addEventListener('click', () => setPreset(10.9685, -74.7813, 4.7110, -74.0721));
  document.getElementById('preset-nyc-lon').addEventListener('click', () => setPreset(40.7128, -74.0060, 51.5074, -0.1278));
  document.getElementById('preset-tok-syd').addEventListener('click', () => setPreset(35.6762, 139.6503, -33.8688, 151.2093));

  const cardHav = document.getElementById('card-haversine');
  const cardCos = document.getElementById('card-cosines');

  cardHav.addEventListener('click', () => {
    selectedFormula = 'haversine';
    cardHav.classList.add('active-card');
    cardCos.classList.remove('active-card');
    updateUI();
  });
  cardHav.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      cardHav.click();
    }
  });

  cardCos.addEventListener('click', () => {
    selectedFormula = 'cosines';
    cardCos.classList.add('active-card');
    cardHav.classList.remove('active-card');
    updateUI();
  });
  cardCos.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      cardCos.click();
    }
  });
}

function setPreset(lat1, lon1, lat2, lon2) {
  currentLat1 = lat1; currentLon1 = lon1;
  currentLat2 = lat2; currentLon2 = lon2;

  document.getElementById('lat1').value = lat1;
  document.getElementById('lon1').value = lon1;
  document.getElementById('lat2').value = lat2;
  document.getElementById('lon2').value = lon2;

  updateUI();
}

function onWindowResize() {
  const canvasBounds = renderer.domElement.parentElement.getBoundingClientRect();
  camera.aspect = canvasBounds.width / canvasBounds.height;
  camera.updateProjectionMatrix();
  renderer.setSize(canvasBounds.width, canvasBounds.height);
}

function animate() {
  requestAnimationFrame(animate);

  if (isAutoRotating && earthGroup) {
    earthGroup.rotation.y += 0.001;
  }

  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener('DOMContentLoaded', () => {
  setupEvents();
  init3D();
  updateUI();
});