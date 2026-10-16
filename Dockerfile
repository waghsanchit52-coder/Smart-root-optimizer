# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Install g++ compiler for C++ engine
RUN apt-get update && apt-get install -y --no-install-recommends g++ && rm -rf /var/lib/apt/lists/*

# Set working directory inside the container
WORKDIR /app

# Copy all project files into container
COPY . /app

# Install Python dependencies (Flask and Gunicorn)
RUN pip install --no-cache-dir -r requirements.txt

# Compile C++ Engine natively for Linux (-O2 with C++17) and grant execution permissions
RUN g++ -O2 -std=c++17 main.cpp Graph.cpp -o RouteOptimizer_Web && chmod +x RouteOptimizer_Web

# Expose default port
EXPOSE 10000

# Start Gunicorn server binding to dynamic Render $PORT with fallback to 10000
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-10000} --workers 2 --timeout 120 server:app"]
