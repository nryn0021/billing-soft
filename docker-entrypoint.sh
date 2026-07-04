#!/bin/sh
set -e

echo "Waiting for PostgreSQL to accept connections..."
until node -e "const{Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL});c.connect().then(()=>c.end()).then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; do
  echo "  ...database not ready, retrying in 2s"
  sleep 2
done

echo "Applying schema with drizzle-kit push..."
npm run db:push

echo "Seeding default tenant (idempotent)..."
node server/seed.js

echo "Starting JMD Mill server..."
exec node server/index.js
