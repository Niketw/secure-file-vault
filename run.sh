#!/usr/bin/env bash
set -euo pipefail

# Project root check
if [ ! -f "docker-compose.yml" ]; then
  echo "Run this script from the project root containing docker-compose.yml" >&2
  exit 1
fi

# Default actions
ACTION=${1:-up}

case "$ACTION" in
  up)
    echo "Building and starting containers..."
    docker compose up --build
    ;;
  up-detach|up-d)
    echo "Building and starting containers in detached mode..."
    docker compose up -d --build
    ;;
  down)
    echo "Stopping containers..."
    docker compose down
    ;;
  down-v)
    echo "Stopping containers and removing volumes (DATA LOSS)..."
    docker compose down -v
    ;;
  logs)
    docker compose logs -f
    ;;
  exec-server)
    docker compose exec server sh
    ;;
  exec-client)
    docker compose exec client sh
    ;;
  *)
    echo "Usage: $0 {up|up-detach|up-d|down|down-v|logs|exec-server|exec-client}" >&2
    exit 2
    ;;
esac


