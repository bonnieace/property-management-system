#!/bin/sh
set -eu

echo "Running guarded database migrations..."
npm run deploy:migrate

echo "Starting application..."
exec npm start
