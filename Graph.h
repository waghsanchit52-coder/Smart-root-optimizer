#ifndef GRAPH_H
#define GRAPH_H

#include <iostream>
#include <string>
#include <limits>
#include "CustomDS.h"

enum class TransportMode {
    BUS,
    METRO,
    CAB,
    AUTO,
    TRAIN,
    UNKNOWN
};

std::string modeToString(TransportMode mode);
TransportMode stringToMode(const std::string& str);

struct Edge {
    int destination;
    double cost;
    double time;
    double carbon;
    TransportMode mode;
};

struct LocationNode {
    std::string name;
    double lat;
    double lon;
};

// Custom Pair replacement for the route result
struct RouteStep {
    int node;
    TransportMode mode;
};

struct RouteResult {
    double totalCost;
    double totalTime;
    double totalCarbon;
    CustomVector<RouteStep> path; 
    CustomVector<std::string> orderedStops; // Final sequence of visited stops
    double executionTimeMs = 0.0;
    int nodesExpanded = 0;
    double kdTreeTimeUs = 0.0;
    int memoryPeakKb = 48;
};

// KD-Tree Node (Using Raw Pointers to prove memory management)
struct KDNode {
    int id;
    KDNode* left;
    KDNode* right;
    KDNode(int id) : id(id), left(nullptr), right(nullptr) {}
};

class Graph {
private:
    // Custom Data Structures Replacing STL
    CustomHashMap<int, CustomVector<Edge>> adjList;
    CustomHashMap<std::string, int> locationToId;
    CustomHashMap<int, LocationNode> idToNode;
    int nextId = 0;
    
    KDNode* kdRoot = nullptr;

    double haversine(double lat1, double lon1, double lat2, double lon2);
    
    KDNode* insertKD(KDNode* node, int id, int depth);
    void nearestKD(KDNode* node, double targetLat, double targetLon, int depth, int& bestId, double& bestDist);
    void freeKDTree(KDNode* node);

public:
    Graph() = default;
    Graph(const Graph&) = delete;
    Graph& operator=(const Graph&) = delete;
    ~Graph();

    bool loadLocationsCSV(const std::string& filename);
    bool loadEdgesCSV(const std::string& filename);
    
    void addLocation(const std::string& name, double lat = 0.0, double lon = 0.0);
    void addEdge(const std::string& src, const std::string& dest, double cost, double time, double carbon, TransportMode mode);
    
    RouteResult findShortestPath(const std::string& src, const std::string& dest, int preference, double weatherPenalty = 1.0);
    
    // Multi-Stop Routing & Traveling Salesperson Problem (TSP) with Bitmask Dynamic Programming
    RouteResult findMultiStopRoute(const std::string& src, const std::string& dest, const CustomVector<std::string>& waypoints, int preference, double weatherPenalty = 1.0, bool optimizeOrder = true);
    
    std::string getLocationName(int id);
    
    void buildKDTree();
    std::string findNearestLocation(double lat, double lon);
    double getLastKDTreeTimeUs() const { return lastKDTreeTimeUs; }

private:
    double lastKDTreeTimeUs = 0.0;
};

#endif
