// ─── CONFIG ───────────────────────────────────────────────────────────────────
// Open FDA API    — no key, no registration
// Overpass API (via overpass.private.coffee mirror) — no key, no registration
const FDA_BASE      = 'https://api.fda.gov/drug/label.json';
const OVERPASS_BASE = 'https://overpass.private.coffee/api/interpreter';

// ─── STATE ────────────────────────────────────────────────────────────────────
let symptoms = [];
let userLat = null;
let userLon = null;
let map = null;

// ─── DOM REFS ─────────────────────────────────────────────────────────────────
const symptomTags      = document.getElementById('symptom-tags');
const diagnoseBtn      = document.getElementById('diagnose-btn');
const inputError       = document.getElementById('input-error');
const diagnosisSection = document.getElementById('diagnosis-section');
const diagnosisLoading = document.getElementById('diagnosis-loading');
const diagnosisResults = document.getElementById('diagnosis-results');
const findHospitalsBtn = document.getElementById('find-hospitals-btn');
const hospitalSection  = document.getElementById('hospital-section');
const locationStatus   = document.getElementById('location-status');
const hospitalLoading  = document.getElementById('hospital-loading');
const hospitalList     = document.getElementById('hospital-list');
const ageGroup         = document.getElementById('age-group');
const gender           = document.getElementById('gender');

// ─── SYMPTOM PILLS ───────────────────────────────────────────────────────────
const COMMON_SYMPTOMS = [
    'Fever', 'Chills', 'Headache', 'Fatigue', 'Cough', 'Sore throat',
    'Runny nose', 'Sneezing', 'Shortness of breath', 'Chest pain',
    'Nausea', 'Vomiting', 'Diarrhea', 'Stomach cramps', 'Loss of appetite',
    'Muscle aches', 'Joint pain', 'Dizziness', 'Blurred vision', 'Rash',
    'Itching', 'Swelling', 'Pale skin', 'Sleeping problems', 'Weakness', 'Weight loss',
    'Frequent urination', 'Numbness', 'Wheezing', 'Rapid heartbeat',
    'Chest tightness', 'Back pain', 'Pelvic pain', 'Loss of taste',
    'Loss of smell', 'Confusion', 'Cold sweat', 'Sweating'
];

const pillContainer = document.getElementById('symptom-pills');

COMMON_SYMPTOMS.forEach(sym => {
    const pill = document.createElement('button');
    pill.className = 'pill';
    pill.textContent = sym;
    pill.addEventListener('click', () => toggleSymptom(sym.toLowerCase(), pill));
    pillContainer.appendChild(pill);
});

function toggleSymptom(sym, pill) {
    inputError.textContent = '';
    if (pill.classList.contains('selected')) {
        symptoms = symptoms.filter(s => s !== sym);
        pill.classList.remove('selected');
    } else {
        if (symptoms.length >= 10) {
            inputError.textContent = 'Maximum 10 symptoms allowed.';
            return;
        }
        symptoms.push(sym);
        pill.classList.add('selected');
    }
    renderTags();
    diagnoseBtn.disabled = symptoms.length === 0;
}

function removeSymptom(sym) {
    symptoms = symptoms.filter(s => s !== sym);
    // deselect the pill too
    pillContainer.querySelectorAll('.pill').forEach(p => {
        if (p.textContent.toLowerCase() === sym) p.classList.remove('selected');
    });
    renderTags();
    if (symptoms.length === 0) diagnoseBtn.disabled = true;
}

function renderTags() {
    symptomTags.innerHTML = '';
    symptoms.forEach(sym => {
        const tag = document.createElement('div');
        tag.className = 'tag';
        const text = document.createTextNode(sym + ' ');
        const btn = document.createElement('button');
        btn.textContent = '×';
        btn.title = 'Remove';
        btn.addEventListener('click', () => removeSymptom(sym));
        tag.appendChild(text);
        tag.appendChild(btn);
        symptomTags.appendChild(tag);
    });
}

// ─── DIAGNOSIS ────────────────────────────────────────────────────────────────
diagnoseBtn.addEventListener('click', async () => {
    if (symptoms.length === 0) return;

    diagnosisSection.classList.remove('hidden');
    diagnosisLoading.classList.remove('hidden');
    diagnosisResults.innerHTML = '';
    findHospitalsBtn.classList.add('hidden');
    inputError.textContent = '';

    diagnosisSection.scrollIntoView({ behavior: 'smooth' });

    try {
        const results = await fetchDiagnosis(symptoms);
        diagnosisLoading.classList.add('hidden');
        renderDiagnosis(results);
        findHospitalsBtn.classList.remove('hidden');
    } catch (err) {
        diagnosisLoading.classList.add('hidden');
        diagnosisResults.innerHTML = `<p class="error-msg">Could not fetch diagnosis: ${err.message}. Please check your API key or try again later.</p>`;
    }
});

async function fetchDiagnosis(symptomList) {
    // Step 1: run local engine to get top matched conditions
    const localResults = await localDiagnosis(symptomList);

    // Step 2: enrich each condition with real FDA drug label data
    const enriched = await Promise.all(localResults.map(async c => {
        try {
            const query = encodeURIComponent(`"${c.name}"`);
            const res = await fetch(`${FDA_BASE}?search=indications_and_usage:${query}&limit=1`);
            if (!res.ok) return c;
            const data = await res.json();
            const label = data.results?.[0];
            if (!label) return c;
            // Pull the first sentence of indications_and_usage as extra context
            const raw = label.indications_and_usage?.[0] || '';
            const sentence = raw.replace(/\s+/g, ' ').split('.')[0].trim();
            return { ...c, fdaInfo: sentence ? sentence + '.' : null };
        } catch {
            return c;
        }
    }));

    return enriched;
}

// ─── LOCAL DIAGNOSIS ENGINE ───────────────────────────────────────────────────
// A curated symptom→condition map. Each condition lists matching symptoms,
// severity, description, and recommended action.
const CONDITIONS = [
    {
        name: 'Common Cold',
        symptoms: ['runny nose', 'sneezing', 'sore throat', 'cough', 'congestion', 'mild fever', 'fatigue'],
        severity: 'low',
        description: 'A viral infection of the upper respiratory tract. Usually resolves within 7–10 days.',
        action: 'Rest, stay hydrated, and use over-the-counter cold remedies. See a doctor if symptoms worsen.'
    },
    {
        name: 'Influenza (Flu)',
        symptoms: ['fever', 'chills', 'muscle aches', 'fatigue', 'headache', 'cough', 'sore throat', 'runny nose'],
        severity: 'medium',
        description: 'A contagious respiratory illness caused by influenza viruses. More severe than a cold.',
        action: 'Rest and fluids. Antiviral medication may help if taken early. Seek care if breathing is difficult.'
    },
    {
        name: 'COVID-19',
        symptoms: ['fever', 'cough', 'shortness of breath', 'loss of taste', 'loss of smell', 'fatigue', 'body aches', 'headache', 'sore throat'],
        severity: 'high',
        description: 'A respiratory illness caused by the SARS-CoV-2 virus with a wide range of symptoms.',
        action: 'Isolate immediately, get tested, and contact a healthcare provider. Seek emergency care for breathing difficulty.'
    },
    {
        name: 'Malaria',
        symptoms: ['fever', 'chills', 'sweating', 'headache', 'nausea', 'vomiting', 'muscle pain', 'fatigue'],
        severity: 'high',
        description: 'A life-threatening disease caused by parasites transmitted through mosquito bites.',
        action: 'Seek immediate medical attention. Antimalarial medication is required. Do not self-medicate.'
    },
    {
        name: 'Typhoid Fever',
        symptoms: ['high fever', 'weakness', 'stomach pain', 'headache', 'diarrhea', 'constipation', 'rash', 'loss of appetite'],
        severity: 'high',
        description: 'A bacterial infection caused by Salmonella typhi, spread through contaminated food or water.',
        action: 'Visit a hospital immediately for antibiotics. Avoid self-medication. Stay hydrated.'
    },
    {
        name: 'Hypertension (High Blood Pressure)',
        symptoms: ['headache', 'dizziness', 'blurred vision', 'chest pain', 'shortness of breath', 'nosebleed'],
        severity: 'high',
        description: 'A condition where blood pressure in the arteries is persistently elevated.',
        action: 'See a doctor for blood pressure measurement and medication. Reduce salt intake and stress.'
    },
    {
        name: 'Diabetes (Type 2)',
        symptoms: ['frequent urination', 'excessive thirst', 'fatigue', 'blurred vision', 'slow healing wounds', 'weight loss', 'numbness'],
        severity: 'high',
        description: 'A metabolic disease causing high blood sugar due to insulin resistance.',
        action: 'Consult a doctor for blood sugar testing. Lifestyle changes and medication are typically required.'
    },
    {
        name: 'Gastroenteritis (Stomach Flu)',
        symptoms: ['nausea', 'vomiting', 'diarrhea', 'stomach cramps', 'fever', 'headache', 'muscle aches'],
        severity: 'medium',
        description: 'Inflammation of the stomach and intestines, usually caused by a viral or bacterial infection.',
        action: 'Stay hydrated with oral rehydration salts. See a doctor if symptoms persist beyond 3 days or blood appears in stool.'
    },
    {
        name: 'Urinary Tract Infection (UTI)',
        symptoms: ['burning urination', 'frequent urination', 'cloudy urine', 'pelvic pain', 'strong urine odor', 'fever', 'back pain'],
        severity: 'medium',
        description: 'A bacterial infection affecting any part of the urinary system.',
        action: 'See a doctor for antibiotics. Drink plenty of water. Do not delay treatment as it can spread to kidneys.'
    },
    {
        name: 'Asthma',
        symptoms: ['shortness of breath', 'wheezing', 'chest tightness', 'cough', 'difficulty breathing'],
        severity: 'medium',
        description: 'A condition where airways narrow and swell, producing extra mucus and making breathing difficult.',
        action: 'Use prescribed inhalers. Avoid triggers. Seek emergency care if breathing becomes severely difficult.'
    },
    {
        name: 'Migraine',
        symptoms: ['severe headache', 'nausea', 'vomiting', 'sensitivity to light', 'sensitivity to sound', 'blurred vision', 'dizziness'],
        severity: 'medium',
        description: 'A neurological condition causing intense, debilitating headaches often with other symptoms.',
        action: 'Rest in a dark, quiet room. Over-the-counter pain relievers may help. See a neurologist for recurring migraines.'
    },
    {
        name: 'Anemia',
        symptoms: ['fatigue', 'weakness', 'pale skin', 'shortness of breath', 'dizziness', 'cold hands', 'headache', 'chest pain'],
        severity: 'medium',
        description: 'A condition where you lack enough healthy red blood cells to carry adequate oxygen to your body\'s tissues.',
        action: 'See a doctor for blood tests. Iron supplements or dietary changes may be recommended.'
    },
    {
        name: 'Appendicitis',
        symptoms: ['severe abdominal pain', 'nausea', 'vomiting', 'fever', 'loss of appetite', 'abdominal swelling'],
        severity: 'high',
        description: 'Inflammation of the appendix. A medical emergency if the appendix ruptures.',
        action: 'Go to the emergency room immediately. Surgery is usually required.'
    },
    {
        name: 'Pneumonia',
        symptoms: ['cough', 'fever', 'chills', 'shortness of breath', 'chest pain', 'fatigue', 'nausea', 'vomiting'],
        severity: 'high',
        description: 'An infection that inflames the air sacs in one or both lungs, which may fill with fluid.',
        action: 'Seek medical care promptly. Antibiotics or antivirals may be prescribed. Hospitalization may be needed.'
    },
    {
        name: 'Allergic Reaction',
        symptoms: ['rash', 'itching', 'hives', 'swelling', 'runny nose', 'sneezing', 'watery eyes', 'shortness of breath'],
        severity: 'medium',
        description: 'An immune system response to a foreign substance that is not typically harmful.',
        action: 'Antihistamines for mild reactions. Seek emergency care immediately for throat swelling or breathing difficulty (anaphylaxis).'
    },
    {
        name: 'Depression',
        symptoms: ['persistent sadness', 'fatigue', 'loss of interest', 'sleep problems', 'appetite changes', 'difficulty concentrating', 'hopelessness'],
        severity: 'high',
        description: 'A mood disorder causing persistent feelings of sadness and loss of interest.',
        action: 'Speak to a mental health professional. Therapy and/or medication can be very effective. You are not alone.'
    },
    {
        name: 'Anxiety Disorder',
        symptoms: ['excessive worry', 'restlessness', 'fatigue', 'difficulty concentrating', 'irritability', 'muscle tension', 'sleep problems', 'rapid heartbeat'],
        severity: 'medium',
        description: 'A mental health disorder characterized by feelings of worry, anxiety, or fear strong enough to interfere with daily activities.',
        action: 'Consult a mental health professional. Cognitive behavioral therapy (CBT) and medication are effective treatments.'
    },
    {
        name: 'Heart Attack',
        symptoms: ['chest pain', 'chest pressure', 'shortness of breath', 'pain in arm', 'nausea', 'cold sweat', 'dizziness', 'fatigue'],
        severity: 'high',
        description: 'Occurs when blood flow to the heart is blocked. A life-threatening emergency.',
        action: 'Call emergency services (911/999/112) IMMEDIATELY. Do not drive yourself to the hospital.'
    },
    {
        name: 'Stroke',
        symptoms: ['sudden numbness', 'confusion', 'trouble speaking', 'vision problems', 'severe headache', 'dizziness', 'loss of balance'],
        severity: 'high',
        description: 'Occurs when blood supply to part of the brain is cut off. Every minute counts.',
        action: 'Call emergency services IMMEDIATELY. Remember FAST: Face drooping, Arm weakness, Speech difficulty, Time to call.'
    },
    {
        name: 'Chickenpox',
        symptoms: ['itchy rash', 'blisters', 'fever', 'fatigue', 'headache', 'loss of appetite'],
        severity: 'low',
        description: 'A highly contagious viral infection causing an itchy, blister-like rash.',
        action: 'Rest and avoid scratching. Calamine lotion helps with itching. See a doctor if symptoms are severe.'
    }
];

function localDiagnosis(userSymptoms) {
    const scored = CONDITIONS.map(condition => {
        const matches = userSymptoms.filter(us =>
            condition.symptoms.some(cs => cs.includes(us) || us.includes(cs))
        );
        return { ...condition, matchCount: matches.length, matchedSymptoms: matches };
    })
    .filter(c => c.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 5);

    return Promise.resolve(scored);
}

function renderDiagnosis(results) {
    diagnosisResults.innerHTML = '';
    
    if (results.length === 0) {
        const p = document.createElement('p');
        p.style.cssText = 'color:var(--muted); text-align:center; padding:1rem;';
        p.textContent = 'No matching conditions found for the entered symptoms. Please consult a healthcare professional for a proper evaluation.';
        diagnosisResults.appendChild(p);
        return;
    }

    const age = ageGroup.value;
    const gen = gender.value;
    if (age || gen) {
        const contextP = document.createElement('p');
        contextP.className = 'hint';
        contextP.style.marginBottom = '1rem';
        contextP.textContent = 'Profile: ' + [age, gen].filter(Boolean).join(', ');
        diagnosisResults.appendChild(contextP);
    }

    results.forEach(c => {
        const card = document.createElement('div');
        card.className = 'condition-card';
        
        const header = document.createElement('div');
        header.className = 'condition-header';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'condition-name';
        nameSpan.textContent = c.name;
        
        const severitySpan = document.createElement('span');
        severitySpan.className = `severity-badge severity-${c.severity}`;
        severitySpan.textContent = c.severity.toUpperCase() + ' SEVERITY';
        
        header.appendChild(nameSpan);
        header.appendChild(severitySpan);
        card.appendChild(header);
        
        const descP = document.createElement('p');
        descP.className = 'condition-desc';
        descP.textContent = c.description;
        card.appendChild(descP);
        
        if (c.fdaInfo) {
            const fdaP = document.createElement('p');
            fdaP.className = 'condition-desc';
            fdaP.style.cssText = 'margin-top:0.4rem; border-left:3px solid var(--accent); padding-left:0.6rem;';
            const strong = document.createElement('strong');
            strong.textContent = 'FDA Drug Info: ';
            fdaP.appendChild(strong);
            fdaP.appendChild(document.createTextNode(c.fdaInfo));
            card.appendChild(fdaP);
        }
        
        const symptomsP = document.createElement('p');
        symptomsP.className = 'condition-desc';
        symptomsP.style.marginTop = '0.4rem';
        const symptomsStrong = document.createElement('strong');
        symptomsStrong.textContent = 'Matched symptoms: ';
        symptomsP.appendChild(symptomsStrong);
        symptomsP.appendChild(document.createTextNode(c.matchedSymptoms.join(', ')));
        card.appendChild(symptomsP);
        
        const actionP = document.createElement('p');
        actionP.className = 'condition-action';
        actionP.textContent = '→ ' + c.action;
        card.appendChild(actionP);
        
        diagnosisResults.appendChild(card);
    });
}

// ─── HOSPITAL FINDER ──────────────────────────────────────────────────────────
findHospitalsBtn.addEventListener('click', () => {
    hospitalSection.classList.remove('hidden');
    hospitalSection.scrollIntoView({ behavior: 'smooth' });
    getUserLocation();
});

function getUserLocation() {
    if (!navigator.geolocation) {
        locationStatus.textContent = 'Geolocation is not supported by your browser.';
        return;
    }
    locationStatus.textContent = 'Detecting your location...';
    navigator.geolocation.getCurrentPosition(onLocationSuccess, onLocationError, { timeout: 10000 });
}

function onLocationSuccess(pos) {
    userLat = pos.coords.latitude;
    userLon = pos.coords.longitude;
    locationStatus.textContent = `Location found. Searching for hospitals nearby...`;
    initMap(userLat, userLon);
    fetchNearbyHospitals(userLat, userLon);
}

function onLocationError(err) {
    locationStatus.textContent = `Could not get location: ${err.message}. Showing hospitals in Nairobi as default.`;
    // Default fallback: Nairobi, Kenya
    userLat = -1.2921;
    userLon = 36.8219;
    initMap(userLat, userLon);
    fetchNearbyHospitals(userLat, userLon);
}

function initMap(lat, lon) {
    if (map) { map.remove(); map = null; }
    map = L.map('map').setView([lat, lon], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // User marker
    L.marker([lat, lon], {
        icon: L.divIcon({ className: '', html: '<div style="font-size:1.6rem; color:#0077b6; font-weight:bold;">+</div>', iconAnchor: [12, 24] })
    }).addTo(map).bindPopup('<strong>Your Location</strong>').openPopup();
}

async function fetchNearbyHospitals(lat, lon) {
    hospitalLoading.classList.remove('hidden');
    hospitalList.innerHTML = '';

    const radius = 5000;
    const query = `[out:json][timeout:30];
(
  node["amenity"="hospital"](around:${radius},${lat},${lon});
  way["amenity"="hospital"](around:${radius},${lat},${lon});
  node["amenity"="clinic"](around:${radius},${lat},${lon});
  node["healthcare"="hospital"](around:${radius},${lat},${lon});
);
out center 20;`;

    try {
        const res = await fetch(OVERPASS_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(query)}`
        });

        if (!res.ok) throw new Error(`Server responded with ${res.status}`);

        const data = await res.json();
        hospitalLoading.classList.add('hidden');

        if (!data.elements || !data.elements.length) {
            hospitalList.innerHTML = '<p class="hint" style="text-align:center;">No hospitals found within 5km of your location.</p>';
            return;
        }

        const hospitals = data.elements
            .map(el => {
                const hLat = el.lat ?? el.center?.lat;
                const hLon = el.lon ?? el.center?.lon;
                if (!hLat || !hLon) return null;
                return {
                    name:    el.tags?.name || 'Unnamed Hospital',
                    address: [el.tags?.['addr:street'], el.tags?.['addr:city']].filter(Boolean).join(', '),
                    phone:   el.tags?.phone || el.tags?.['contact:phone'] || null,
                    lat: hLat, lon: hLon,
                    dist: haversine(lat, lon, hLat, hLon)
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.dist - b.dist);

        renderHospitals(hospitals);
    } catch (err) {
        hospitalLoading.classList.add('hidden');
        hospitalList.innerHTML = `<p class="error-msg">Could not load hospitals: ${err.message}. Please try again.</p>`;
    }
}

function renderHospitals(hospitals) {
    const colors = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#6d6875'];

    hospitals.forEach((h, i) => {
        if (!h.lat || !h.lon) return;

        const marker = L.circleMarker([h.lat, h.lon], {
            radius: 9, fillColor: colors[i % colors.length],
            color: '#fff', weight: 2, fillOpacity: 0.9
        }).addTo(map);
        
        const popupDiv = document.createElement('div');
        const popupStrong = document.createElement('strong');
        popupStrong.textContent = h.name;
        popupDiv.appendChild(popupStrong);
        popupDiv.appendChild(document.createElement('br'));
        popupDiv.appendChild(document.createTextNode(h.dist.toFixed(2) + ' km away'));
        marker.bindPopup(popupDiv);

        const item = document.createElement('div');
        item.className = 'hospital-item';
        
        const leftDiv = document.createElement('div');
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'hospital-name';
        nameDiv.textContent = h.name;
        
        const metaDiv = document.createElement('div');
        metaDiv.className = 'hospital-meta';
        metaDiv.textContent = h.address + (h.phone ? ' · ' + h.phone : '');
        
        const directionsLink = document.createElement('a');
        directionsLink.className = 'directions-btn';
        directionsLink.href = `https://www.openstreetmap.org/directions?from=${userLat},${userLon}&to=${h.lat},${h.lon}`;
        directionsLink.target = '_blank';
        directionsLink.rel = 'noopener noreferrer';
        directionsLink.textContent = 'Get Directions';
        
        leftDiv.appendChild(nameDiv);
        leftDiv.appendChild(metaDiv);
        leftDiv.appendChild(directionsLink);
        
        const distDiv = document.createElement('div');
        distDiv.className = 'hospital-dist';
        distDiv.textContent = h.dist.toFixed(2) + ' km';
        
        item.appendChild(leftDiv);
        item.appendChild(distDiv);
        item.addEventListener('click', () => { map.setView([h.lat, h.lon], 16); marker.openPopup(); });
        hospitalList.appendChild(item);
    });
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function deg2rad(deg) { return deg * (Math.PI / 180); }
