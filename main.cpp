#include "Graph.h"
#include <iostream>
#include <string>
#include <vector>

std::string escapeJSON(const std::string& str) {
    std::string result = "";
    for (char c : str) {
        if (c == '"') result += "\\\"";
        else result += c;
    }
    return result;
}

void printJSON(const RouteResult& result, Graph& g) {
    if (result.totalCost < 0) {
        std::cout << "{\"error\": \"No route found\"}\n";
        return;
    }

    std::cout << "{\n";
    std::cout << "  \"totalCost\": " << result.totalCost << ",\n";
    std::cout << "  \"totalTime\": " << result.totalTime << ",\n";
    std::cout << "  \"totalCarbon\": " << result.totalCarbon << ",\n";
    std::cout << "  \"path\": [\n";

    for (size_t i = 0; i < result.path.size(); ++i) {
        std::string location = g.getLocationName(result.path[i].node);
        std::string mode = (i == 0) ? "START" : modeToString(result.path[i].mode);
        
        std::cout << "    {\n";
        std::cout << "      \"location\": \"" << escapeJSON(location) << "\",\n";
        std::cout << "      \"mode\": \"" << escapeJSON(mode) << "\"\n";
        std::cout << "    }";
        if (i < result.path.size() - 1) std::cout << ",";
        std::cout << "\n";
    }
    std::cout << "  ]\n";
    std::cout << "}\n";
}

int main(int argc, char* argv[]) {
    Graph g;
    
    if (!g.loadLocationsCSV("locations.csv")) {
        std::cout << "{\"error\": \"Failed to load locations.csv\"}\n";
        return 1;
    }
    if (!g.loadEdgesCSV("pune_map.csv")) {
        std::cout << "{\"error\": \"Failed to load pune_map.csv\"}\n";
        return 1;
    }
    
    g.buildKDTree();

    if (argc >= 2) {
        std::string command = argv[1];
        
        if (command == "route" && argc >= 5) {
            std::string src = argv[2];
            std::string dest = argv[3];
            std::string prefStr = argv[4];
            double weatherPenalty = 1.0;
            
            if (argc >= 6) {
                weatherPenalty = std::stod(argv[5]);
            }
            
            int preference = 0;
            if (prefStr == "time") preference = 1;
            else if (prefStr == "eco") preference = 2;
            
            RouteResult result = g.findShortestPath(src, dest, preference, weatherPenalty);
            printJSON(result, g);
            return 0;
        }
        else if (command == "nearest" && argc >= 4) {
            double lat = std::stod(argv[2]);
            double lon = std::stod(argv[3]);
            std::string nearest = g.findNearestLocation(lat, lon);
            
            std::cout << "{\n";
            std::cout << "  \"nearest\": \"" << escapeJSON(nearest) << "\"\n";
            std::cout << "}\n";
            return 0;
        }
    }

    std::cout << "{\"error\": \"Usage: RouteOptimizer_Web.exe route <src> <dest> <cost|time|eco> [penalty] OR nearest <lat> <lon>\"}\n";
    return 1;
}
