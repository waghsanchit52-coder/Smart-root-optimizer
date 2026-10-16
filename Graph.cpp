#include "Graph.h"
#include <fstream>
#include <sstream>
#include <cmath>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

Graph::~Graph() {
    freeKDTree(kdRoot);
}

void Graph::freeKDTree(KDNode* node) {
    if (node != nullptr) {
        freeKDTree(node->left);
        freeKDTree(node->right);
        delete node;
    }
}

std::string modeToString(TransportMode mode) {
    switch (mode) {
        case TransportMode::BUS: return "Bus";
        case TransportMode::METRO: return "Metro";
        case TransportMode::CAB: return "Cab";
        case TransportMode::AUTO: return "Auto";
        case TransportMode::TRAIN: return "Train";
        default: return "Unknown";
    }
}

TransportMode stringToMode(const std::string& str) {
    if (str == "Bus") return TransportMode::BUS;
    if (str == "Metro") return TransportMode::METRO;
    if (str == "Cab") return TransportMode::CAB;
    if (str == "Auto") return TransportMode::AUTO;
    if (str == "Train") return TransportMode::TRAIN;
    return TransportMode::UNKNOWN;
}

void Graph::addLocation(const std::string& name, double lat, double lon) {
    if (!locationToId.contains(name)) {
        locationToId.insert(name, nextId);
        idToNode.insert(nextId, {name, lat, lon});
        nextId++;
    }
}

void Graph::addEdge(const std::string& src, const std::string& dest, double cost, double time, double carbon, TransportMode mode) {
    if (!locationToId.contains(src)) addLocation(src);
    if (!locationToId.contains(dest)) addLocation(dest);

    int u = locationToId[src];
    int v = locationToId[dest];
    
    adjList[u].push_back({v, cost, time, carbon, mode});
    adjList[v].push_back({u, cost, time, carbon, mode});
}

bool Graph::loadLocationsCSV(const std::string& filename) {
    std::ifstream file(filename);
    if (!file.is_open()) return false;

    std::string line;
    std::getline(file, line); // Skip header
    while (std::getline(file, line)) {
        std::stringstream ss(line);
        std::string name, latStr, lonStr;
        if (std::getline(ss, name, ',') && std::getline(ss, latStr, ',') && std::getline(ss, lonStr, ',')) {
            addLocation(name, std::stod(latStr), std::stod(lonStr));
        }
    }
    return true;
}

bool Graph::loadEdgesCSV(const std::string& filename) {
    std::ifstream file(filename);
    if (!file.is_open()) return false;

    std::string line;
    std::getline(file, line); // Skip header
    while (std::getline(file, line)) {
        std::stringstream ss(line);
        std::string src, dest, costStr, timeStr, modeStr, carbStr;
        if (std::getline(ss, src, ',') && std::getline(ss, dest, ',') &&
            std::getline(ss, costStr, ',') && std::getline(ss, timeStr, ',') &&
            std::getline(ss, modeStr, ',') && std::getline(ss, carbStr, ',')) {
            
            addEdge(src, dest, std::stod(costStr), std::stod(timeStr), std::stod(carbStr), stringToMode(modeStr));
        }
    }
    return true;
}

std::string Graph::getLocationName(int id) {
    if (idToNode.contains(id)) {
        return idToNode[id].name;
    }
    return "Unknown";
}

double Graph::haversine(double lat1, double lon1, double lat2, double lon2) {
    double R = 6371.0; 
    double dLat = (lat2 - lat1) * M_PI / 180.0;
    double dLon = (lon2 - lon1) * M_PI / 180.0;
    lat1 = lat1 * M_PI / 180.0;
    lat2 = lat2 * M_PI / 180.0;

    double a = std::sin(dLat/2) * std::sin(dLat/2) +
               std::sin(dLon/2) * std::sin(dLon/2) * std::cos(lat1) * std::cos(lat2);
    double c = 2 * std::atan2(std::sqrt(a), std::sqrt(1-a));
    return R * c;
}

// A* Algorithm with Custom Data Structures
RouteResult Graph::findShortestPath(const std::string& src, const std::string& dest, int preference, double weatherPenalty) {
    if (!locationToId.contains(src) || !locationToId.contains(dest)) {
        return {-1.0, -1.0, -1.0, {}};
    }

    int startNode = locationToId[src];
    int endNode = locationToId[dest];
    int n = nextId;

    CustomVector<double> gScore;
    gScore.resize(n, std::numeric_limits<double>::infinity());
    
    CustomVector<int> parent;
    parent.resize(n, -1);
    
    CustomVector<TransportMode> parentMode;
    parentMode.resize(n, TransportMode::BUS);
    
    CustomVector<double> actualCost;
    actualCost.resize(n, 0.0);
    
    CustomVector<double> actualTime;
    actualTime.resize(n, 0.0);
    
    CustomVector<double> actualCarbon;
    actualCarbon.resize(n, 0.0);

    gScore[startNode] = 0.0;

    // Custom Min Heap
    CustomMinHeap pq;
    pq.push(0.0, startNode);

    while (!pq.empty()) {
        HeapPair top = pq.pop();
        int u = top.data;

        if (u == endNode) break;

        CustomVector<Edge>& edges = adjList[u];
        for (int i = 0; i < edges.size(); ++i) {
            Edge edge = edges[i];
            int v = edge.destination;
            
            double weight = 0.0;
            if (preference == 0) weight = edge.cost;
            else if (preference == 1) weight = edge.time;
            else if (preference == 2) weight = edge.carbon;

            if (weatherPenalty > 1.0 && (edge.mode == TransportMode::AUTO || edge.mode == TransportMode::BUS)) {
                if (edge.mode == TransportMode::AUTO) weight *= weatherPenalty * 2.0;
                else weight *= weatherPenalty;
            }
            
            double tentativeG = gScore[u] + weight;
            
            if (tentativeG < gScore[v]) {
                parent[v] = u;
                parentMode[v] = edge.mode;
                gScore[v] = tentativeG;
                actualCost[v] = actualCost[u] + edge.cost;
                actualTime[v] = actualTime[u] + edge.time;
                actualCarbon[v] = actualCarbon[u] + edge.carbon;
                
                double h = 0.0;
                if (idToNode[u].lat != 0.0 && idToNode[v].lat != 0.0) {
                    double distKm = haversine(idToNode[v].lat, idToNode[v].lon, idToNode[endNode].lat, idToNode[endNode].lon);
                    if (preference == 0) h = distKm * 5.0; 
                    else if (preference == 1) h = distKm * 1.5; 
                    else h = distKm * 1.0; 
                }

                pq.push(gScore[v] + h, v);
            }
        }
    }

    if (gScore[endNode] == std::numeric_limits<double>::infinity()) {
        return {-1.0, -1.0, -1.0, {}};
    }

    RouteResult result;
    result.totalCost = actualCost[endNode];
    result.totalTime = actualTime[endNode];
    result.totalCarbon = actualCarbon[endNode];

    int curr = endNode;
    while (curr != startNode) {
        result.path.push_back({curr, parentMode[curr]});
        curr = parent[curr];
    }
    result.path.push_back({startNode, TransportMode::BUS});
    
    // Reverse the path
    result.path.reverse();

    return result;
}

// KD-Tree Implementation
KDNode* Graph::insertKD(KDNode* node, int id, int depth) {
    if (node == nullptr) return new KDNode(id);
    
    int axis = depth % 2; 
    
    double nodeVal = (axis == 0) ? idToNode[node->id].lat : idToNode[node->id].lon;
    double newVal = (axis == 0) ? idToNode[id].lat : idToNode[id].lon;
    
    if (newVal < nodeVal)
        node->left = insertKD(node->left, id, depth + 1);
    else
        node->right = insertKD(node->right, id, depth + 1);
        
    return node;
}

void Graph::buildKDTree() {
    for (int i = 0; i < nextId; ++i) {
        if (idToNode[i].lat != 0.0) { 
            kdRoot = insertKD(kdRoot, i, 0);
        }
    }
}

void Graph::nearestKD(KDNode* node, double targetLat, double targetLon, int depth, int& bestId, double& bestDist) {
    if (node == nullptr) return;
    
    double dist = haversine(targetLat, targetLon, idToNode[node->id].lat, idToNode[node->id].lon);
    if (dist < bestDist) {
        bestDist = dist;
        bestId = node->id;
    }
    
    int axis = depth % 2;
    double nodeVal = (axis == 0) ? idToNode[node->id].lat : idToNode[node->id].lon;
    double targetVal = (axis == 0) ? targetLat : targetLon;
    
    KDNode* first = (targetVal < nodeVal) ? node->left : node->right;
    KDNode* second = (targetVal < nodeVal) ? node->right : node->left;
    
    nearestKD(first, targetLat, targetLon, depth + 1, bestId, bestDist);
    
    double planeDist = std::abs(targetVal - nodeVal) * 111.0; 
    if (planeDist < bestDist) {
        nearestKD(second, targetLat, targetLon, depth + 1, bestId, bestDist);
    }
}

std::string Graph::findNearestLocation(double lat, double lon) {
    if (kdRoot == nullptr) return "Unknown";
    
    int bestId = -1;
    double bestDist = std::numeric_limits<double>::infinity();
    
    nearestKD(kdRoot, lat, lon, 0, bestId, bestDist);
    
    if (bestId != -1) return idToNode[bestId].name;
    return "Unknown";
}
