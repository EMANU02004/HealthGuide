# HealthGuide – Symptom Checker & Hospital Finder

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

A web application that allows users to check their symptoms, get possible diagnoses, and find nearby hospitals on an interactive map.

**Live Demo:** 

- **Lb01** ([44.210.131.42](http://44.210.131.42))
- **Web01** ([18.233.158.107](http://18.233.158.107))
- **Web02** ([44.201.84.254](http://44.201.84.254))

---

## Overview

HealthGuide helps users:
- Select symptoms from 38 common options using clickable pills
- Get matched with possible medical conditions (20+ conditions in database)
- View severity ratings and recommendations for each condition
- Find nearby hospitals within 5km using GPS location
- See hospitals on an interactive map with directions

---

## Features

- **Symptom Input** - Click to select from 38 common symptoms
- **Smart Diagnosis** - Matches symptoms to 20+ conditions with severity levels
- **FDA Data** - Enriches results with real drug information from FDA API
- **Hospital Finder** - Locates nearby hospitals using OpenStreetMap
- **Interactive Map** - Shows hospitals with distance and directions
- **Responsive Design** - Works on desktop, tablet, and mobile
- **No Login Required** - Fully client-side, no registration needed

---

## Technologies Used

### Frontend
- HTML5, CSS3, JavaScript (ES6+)
- Leaflet.js 1.9.4 (for maps)

### Backend/Infrastructure
- Nginx (web server + load balancer)
- Ubuntu 20.04 LTS
- AWS EC2 (3 servers)
- Git/GitHub

---

## APIs Used

| API | Purpose | Authentication | Documentation |
|-----|---------|----------------|---------------|
| **Open FDA API** | Drug label data for diagnoses | None required | [FDA Docs](https://open.fda.gov/apis/) |
| **Overpass API** | Hospital locations by GPS | None required | [Overpass Docs](https://wiki.openstreetmap.org/wiki/Overpass_API) |
| **Leaflet.js** | Interactive map rendering | None required | [Leaflet Docs](https://leafletjs.com) |
| **OpenStreetMap** | Map tiles | None required | [OSM Docs](https://www.openstreetmap.org) |

**API Endpoints:**
- FDA: `https://api.fda.gov/drug/label.json?search=indications_and_usage:"condition"&limit=1`
- Overpass (Primary): `https://overpass-api.de/api/interpreter` (POST request)
- Overpass (Backup): `https://overpass.kumi.systems/api/interpreter` (POST request)
- Overpass (Backup): `https://overpass.private.coffee/api/interpreter` (POST request)

---

## Architecture 

```
User Browser
     
Load Balancer (Lb01: 44.210.131.42)
     
Web01 (18.233.158.107) + Web02 (44.201.84.254)
     
FDA API + Overpass API
```

**Servers:**
- **Lb01** (44.210.131.42) - Nginx load balancer (round-robin)
- **Web01** (18.233.158.107) - Nginx web server
- **Web02** (44.201.84.254) - Nginx web server

---

## Local Setup

1. **Clone repository:**
   ```bash
   git clone https://github.com/EMANU02004/HealthGuide.git
   cd HealthGuide
   ```

2. **Open in browser:**
   - Open `index.html` directly, OR
   - Use a local server:
   ```bash
   python -m http.server 8080
   # Then visit http://localhost:8080
   ```

---

## Deployment

### Step 1 – Deploy to Web Servers (Web01 & Web02)

Run on both servers:

```bash
# Install dependencies
sudo apt update
sudo apt install -y nginx git

# Clone repository
sudo mkdir -p /var/www/healthguide
sudo chown -R ubuntu:ubuntu /var/www/healthguide
cd /var/www/healthguide
git clone https://github.com/EMANU02004/HealthGuide.git .

# Set permissions
sudo chown -R www-data:www-data /var/www/healthguide

# Create Nginx config
sudo tee /etc/nginx/sites-available/healthguide > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;
    root /var/www/healthguide;
    index index.html;
    location / {
        try_files $uri $uri/ =404;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/healthguide /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### Step 2 – Configure Load Balancer (Lb01)

```bash
# Install Nginx
sudo apt update
sudo apt install -y nginx

# Create load balancer config
sudo tee /etc/nginx/sites-available/healthguide-lb > /dev/null << 'EOF'
upstream healthguide_backend {
    server 18.233.158.107;
    server 44.201.84.254;
    keepalive 32;
}

server {
    listen 80;
    server_name _;
    location / {
        proxy_pass http://healthguide_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF

# Enable load balancer
sudo ln -s /etc/nginx/sites-available/healthguide-lb /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### Step 3 – Test

```bash
# Test load balancer
curl http://44.210.131.42

# Test failover (stop Web01, app should still work)
ssh ubuntu@18.233.158.107
sudo systemctl stop nginx
# Visit http://44.210.131.42 - should still work
sudo systemctl start nginx
```

---

## Updating the Application

**Update Web01:**
```bash
ssh ubuntu@18.233.158.107
cd /var/www/healthguide
sudo git config --global --add safe.directory /var/www/healthguide
sudo git pull origin main
sudo systemctl restart nginx
exit
```

**Update Web02:**
```bash
ssh ubuntu@44.201.84.254
cd /var/www/healthguide
sudo git config --global --add safe.directory /var/www/healthguide
sudo git pull origin main
sudo systemctl restart nginx
exit
```

## File Structure

```
HealthGuide/
├── index.html      # Main UI
├── style.css       # Styling
├── script.js       # Application logic + API calls
└── README.md       # Documentation
```

## Credits

- Drug data: [Open FDA](https://api.fda.gov)
- Hospital data: [OpenStreetMap](https://www.openstreetmap.org) contributors
- Maps: [Leaflet.js](https://leafletjs.com)

---

> [!IMPORTANT]
> **Medical Disclaimer**
>
> HealthGuide is an educational project and is **not a medical device**. The
> symptom results it produces are generated by a simple rule-based matcher and
> do **not** constitute a diagnosis, medical advice, or a treatment
> recommendation.
>
> Always consult a qualified healthcare professional about any medical concern.
> **If you are experiencing a medical emergency, contact your local emergency
> services or go to the nearest hospital immediately** — do not rely on this
> application.
>
> Hospital locations are sourced from OpenStreetMap and may be incomplete or
> out of date. Verify a facility's hours and services before travelling to it.

