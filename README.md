# 🚀 Pune Smart Route Optimizer

An enterprise-grade, high-performance multimodal transit route optimization and navigation engine for the Pune Metropolitan Area. Built from the ground up using **pure custom C++ Data Structures** (zero external STL container dependencies for core logic), paired with a **Python Flask microservice** and an interactive **Leaflet.js geospatial dashboard**.

---

## 🌟 Key Highlights & Engineering Features

1. **Custom Data Structures (No STL Container Overhead)**:
   - `CustomVector<T>`: Dynamically resizing array with custom allocation, copy semantics, and element manipulation.
   - `CustomHashMap<K, V>`: Hash table implementing linked-list collision chaining and custom polynomial rolling hash.
   - `CustomMinHeap`: Binary min-heap priority queue specifically engineered for A* heuristic evaluation.

2. **Multimodal Graph Engine (63 Pune & PCMC Transit Nodes)**:
   - Full connectivity across **Metro (Purple & Aqua lines)**, **PMPML Bus corridors**, **Cabs**, **Auto Rickshaws**, and **Pedestrian Walkways**.
   - Dynamically loaded from runtime CSVs (`locations.csv` and `pune_map.csv`) without recompilation.

3. **Multi-Objective Optimization**:
   - 💰 **Cheapest Route**: Minimizes financial expenditure across multimodal fares.
   - ⚡ **Fastest Route**: Minimizes transit delay and transfer overhead.
   - 🍃 **Eco-Friendly Route**: Minimizes total carbon footprint emissions.
   - 🌧️ **Dynamic Weather Penalty**: Integrates live Open-Meteo API to penalize open-air transport (Autos/Buses) during rain.

4. **Doorstep / First-Mile Spatial Connector**:
   - If the traveler's GPS location is not an exact transit station, the spatial engine automatically computes a first-mile connector:
     - Distances <= 800 m: Walking leg (Rs 0 cost, 0 carbon).
     - Distances > 800 m: Feeder Auto connector.

5. **Multi-Stop Itinerary Optimization (Traveling Salesperson Problem)**:
   - Allows users to add up to 4 intermediate stops.
   - Uses the **Held-Karp Dynamic Programming algorithm with Bitmasking** (O(k^2 * 2^k)) to calculate the globally optimal order of visits.

6. **2D Spatial KD-Tree (O(log N) Snapping)**:
   - Custom KD-Tree built on latitude/longitude coordinates to snap any map click or device GPS coordinate to the nearest transit hub in microseconds.

7. **Live Navigation HUD & Simulation**:
   - Turn-by-turn simulation loop with directional compass orientation.
   - Real GPS tracking mode with computational geometry off-route deviation detection.
   - Non-intrusive **In-Place Arrival Signal Card** on the dashboard upon reaching the final destination.

---

## 📁 Project Structure

```text
Smart_Route_Optimizer_Final/
├── CustomDS.h              # Custom Vector, HashMap, and MinHeap data structures
├── Graph.h                 # Graph interface, KD-Tree node, Edge & RouteResult structs
├── Graph.cpp               # A* search, KD-Tree spatial lookup, Held-Karp TSP DP
├── main.cpp                # Native C++ headless CLI & JSON serialization engine
├── CMakeLists.txt          # CMake build configuration
├── build.sh                # Linux build script (g++ -O3)
├── Dockerfile              # Containerized deployment specification
├── RouteOptimizer_Web.exe  # Pre-compiled high-performance Windows binary (-O3)
├── RouteOptimizer.exe      # Mirror binary
├── server.py               # Flask REST microservice & live weather adapter
├── requirements.txt        # Python dependencies (Flask, gunicorn)
├── run.bat                 # One-click Windows launch script
├── locations.csv           # 63 Pune/PCMC transit nodes with GPS coordinates
├── pune_map.csv            # Fully connected multimodal graph edges
├── static/
│   ├── app.js              # Leaflet mapping, Live Navigation, TSP HUD, First-Mile UI
│   └── style.css           # Clean modern dashboard UI styles
├── templates/
│   └── index.html          # Frontend web layout & navigation controls
├── docs/
│   ├── PATENT_SPECIFICATION.md  # Formal provisional patent disclosure draft
│   ├── PRESENTATION_SCRIPT.md   # Viva & evaluation presentation walkthrough
│   ├── FUTURE_ADVANCEMENTS.md   # Technical roadmap & future expansion scope
│   └── PROJECT_CONTEXT.md       # Architectural notes & implementation context
└── scripts/
    ├── expand_network.py   # Dataset expansion & station verification utility
    └── add_bus_stations.py # Edge generation & connectivity verification script
```

---

## 🚀 How to Run the Project

### Option 1: One-Click Launch (Windows)
Double-click `run.bat` in the root folder. It will:
1. Verify the C++ executable.
2. Start the Flask backend server on `http://127.0.0.1:5000`.
3. Automatically launch your default web browser to the dashboard.

### Option 2: Manual Terminal Launch
Ensure Python 3.8+ and GCC (g++) are installed.

1. **Install Python Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **(Optional) Recompile the C++ Engine**:
   ```bash
   # Windows (MinGW / GCC)
   g++ -O3 -std=c++17 main.cpp Graph.cpp -o RouteOptimizer_Web.exe

   # Linux / macOS
   g++ -O3 -std=c++17 main.cpp Graph.cpp -o RouteOptimizer_Web
   ```

3. **Start the Web Server**:
   ```bash
   python server.py
   ```
4. Open http://127.0.0.1:5000 in your browser.

---

## 📊 Algorithmic Complexity

| Component | Algorithm / Mechanism | Time Complexity | Space Complexity |
| :--- | :--- | :--- | :--- |
| **Pathfinding Engine** | A* with Haversine Admissible Heuristic | O((V + E) log V) | O(V) |
| **Spatial Snap** | 2D KD-Tree Partitioning | O(log V) average | O(V) |
| **Itinerary Optimizer** | Held-Karp DP with Bitmasking | O(k^2 * 2^k) | O(k * 2^k) |
| **Collision Handling** | Custom Hash Map (Separate Chaining) | O(1) average | O(V + E) |
| **Deviation Detection** | Point-to-Segment Minimum Euclidean Distance | O(P) | O(1) |

---

## 📜 Intellectual Property & Patent Draft
A complete formal patent disclosure has been documented under `docs/PATENT_SPECIFICATION.md`, detailing the technical novelty of combining real-time spatial first-mile feeder discovery with weather-penalized multimodal routing and microsecond Held-Karp TSP itinerary scheduling on bare-metal custom data structures.
