#!/bin/sh
set -e

echo "Starting backend entrypoint..."

# Ensure the database is ready if we are running with docker-compose
if [ -n "$DATABASE_URL" ]; then
  # Very basic delay or reliance on docker-compose depends_on healthcheck
  echo "Applying database migrations..."
  npx prisma migrate deploy
  
  if [ "$SEED_ON_START" = "true" ]; then
    echo "Running default database seed..."
    npx prisma db seed
  fi
fi

echo "Starting node application..."
exec node server.js
