# Full-Stack Production Deployment Guide

This guide describes how to run the entire backend and frontend stack in a unified, production-ready Docker environment.

## Prerequisites
- Docker
- Docker Compose v2
- Port `3000` (Backend internals), `3001` (Frontend public), and `5432` (Postgres public access) available.

## Repository Structure

Because this setup unifies both the backend and frontend into a single compose file, you **must clone both repositories into the same parent folder**:

```text
parent_folder/
├── peek-school-system-backend/        # (You are running docker-compose from here)
└── peek-school-system-frontend/       # (Fetched automatically by docker-compose)
```

## Configuration

Before starting, ensure you have a valid `.env` file at the root of the backend repository. 

```bash
cp .env.example .env
```

Ensure the following minimal environment variables are populated:
- `NODE_ENV=production`
- `PORT=3000`
- `DATABASE_URL=postgresql://postgres:postgres@db:5432/school_db?schema=public`
- `JWT_SECRET=your_secret_here`

*Note: The frontend will automatically be injected with `NEXT_PUBLIC_API_BASE_URL=http://backend:3000` by Docker Compose to resolve the internal network correctly without localhost loopholes.*

## Running the Stack

To build and start the entire stack (PostgreSQL + Node.js Backend + Next.js Frontend) as a background process, run the following from within the `peek-school-system-backend` directory:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

### Accessing the Applications
- **Frontend App**: Browse to [http://localhost:3001](http://localhost:3001)
- **Backend API**: Exposed locally at `http://localhost:3000` (but the frontend communicates directly via the Docker boundary).
- **Database**: Exposed on port `5432` locally for administrative access via PgAdmin or DBeaver.

### Initial Database Seeding
By default, the backend container runs `npx prisma migrate deploy` prior to starting to ensure schemas are properly applied.

If you need to seed the database upon startup (e.g. for a fresh demo environment), prepend the `SEED_ON_START` flag:
```bash
SEED_ON_START=true docker compose -f docker-compose.prod.yml up --build -d
```

## Useful Commands

**View live logs across all services:**
```bash
docker compose -f docker-compose.prod.yml logs -f
```

**View logs for a specific service (db, backend, frontend):**
```bash
docker compose -f docker-compose.prod.yml logs -f frontend
```

**Shutting down and removing containers/volumes:**
```bash
docker compose -f docker-compose.prod.yml down -v
```

## Healthchecks & Boot Order
Docker is configured to monitor the health cascades internally. 
1. `db` boots and waits until `pg_isready` succeeds.
2. `backend` runs migrations, boots, and `frontend` waits until `/api/health` succeeds.
3. `frontend` boots and becomes visible to the web.
