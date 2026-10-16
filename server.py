from flask import Flask, render_template, request, jsonify
import subprocess
import json
import urllib.request
import random

app = Flask(__name__)

import csv

def get_locations_data():
    loc_list = []
    coords_dict = {}
    try:
        with open('locations.csv', mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row['LocationName']
                loc_list.append(name)
                coords_dict[name] = [float(row['Latitude']), float(row['Longitude'])]
        loc_list.sort()
    except Exception as e:
        print("Error reading CSV:", e)
    return loc_list, coords_dict

def get_pune_weather():
    try:
        # Open-Meteo API for Pune (Lat: 18.52, Lon: 73.85)
        url = "https://api.open-meteo.com/v1/forecast?latitude=18.52&longitude=73.85&current_weather=true"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=2) as response:
            data = json.loads(response.read().decode())
            weather_code = data['current_weather']['weathercode']
            # WMO Weather codes: 50+ means drizzle/rain/snow/thunderstorm
            is_raining = weather_code >= 50
            return {
                "temp": data['current_weather']['temperature'],
                "raining": is_raining,
                "description": "Raining 🌧️" if is_raining else "Clear ☀️"
            }
    except Exception as e:
        print("Weather API failed:", e)
        return {"temp": 25.0, "raining": False, "description": "Clear ☀️"}

@app.route('/')
def index():
    weather = get_pune_weather()
    loc_list, coords_dict = get_locations_data()
    return render_template('index.html', locations=loc_list, coordinates=coords_dict, weather=weather)

@app.route('/api/route', methods=['POST'])
def get_route():
    data = request.json
    src = data.get('source')
    dest = data.get('destination')
    pref = data.get('preference', 'cost')
    traffic = data.get('traffic', False)
    
    if not src or not dest:
        return jsonify({"error": "Missing source or destination"}), 400

    # Determine weather penalty
    weather = get_pune_weather()
    penalty = 1.0
    if weather['raining']:
        penalty += 1.5 # Heavy penalty for open transport if raining
        
    if traffic:
        penalty += 1.0 # Simulate heavy traffic adding delay/cost penalties

    try:
        import platform
        binary_name = "RouteOptimizer_Web.exe" if platform.system() == "Windows" else "./RouteOptimizer_Web"
        
        result = subprocess.run(
            [binary_name, 'route', src, dest, pref, str(penalty)],
            capture_output=True,
            text=True,
            check=True
        )
        route_data = json.loads(result.stdout)
        
        # If traffic is on, let's artificially bloat the reported time slightly to emphasize the effect
        # since the C++ engine penalty applies to cost/time uniformly depending on the mode.
        if traffic and 'totalTime' in route_data:
             route_data['totalTime'] = int(route_data['totalTime'] * random.uniform(1.2, 1.8))
             route_data['trafficAlert'] = True
             
        return jsonify(route_data)

    except subprocess.CalledProcessError as e:
        return jsonify({"error": "C++ Engine Failed", "details": e.stderr}), 500
    except json.JSONDecodeError:
        return jsonify({"error": "Failed to parse C++ output", "output": result.stdout}), 500

@app.route('/api/nearest', methods=['POST'])
def get_nearest():
    data = request.json
    lat = data.get('lat')
    lon = data.get('lon')
    
    if lat is None or lon is None:
        return jsonify({"error": "Missing coordinates"}), 400
        
    try:
        import platform
        binary_name = "RouteOptimizer_Web.exe" if platform.system() == "Windows" else "./RouteOptimizer_Web"
        
        result = subprocess.run(
            [binary_name, 'nearest', str(lat), str(lon)],
            capture_output=True,
            text=True,
            check=True
        )
        return jsonify(json.loads(result.stdout))
    except Exception as e:
        return jsonify({"error": "KD-Tree lookup failed"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
