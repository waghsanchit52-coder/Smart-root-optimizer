#!/bin/bash
echo "Compiling C++ Engine for Linux..."
g++ main.cpp Graph.cpp -o RouteOptimizer_Web -O3
echo "Compilation complete!"
