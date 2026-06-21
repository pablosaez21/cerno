# Cerno Railway Deployment Guide

This guide prepares the full-stack Cerno MVP for a Railway-only deployment.

Target Railway project:

- Service 1: `api`
- Service 2: `frontend`
- Service 3: PostgreSQL
- Volume: ChromaDB mounted on the `api` service

Do not commit real secrets. Configure production values in Railway Variables.

## 1. Create The Railway Project

1. Open Railway.
2. Click `New Project`.
3. Choose `Deploy from GitHub repo`.
4. Select the Cerno repository.
5. Name the Railway project `Cerno`.

## 2. Create PostgreSQL

1. In the same Railway project, click `Add service`.
2. Choose `Database`.
3. Choose `PostgreSQL`.
4. After Railway creates the database, copy the generated `DATABASE_URL`.
5. Use that `DATABASE_URL` in the `api` service variables.

## 3. Create The API Service

Create a service from the same GitHub repository.

Recommended Railway settings:

```text
Service name: api
Root Directory: /
Dockerfile: Dockerfile
```

The backend Dockerfile:

- installs Linux Stockfish with `apt-get install stockfish`
- runs Alembic migrations before Uvicorn
- listens on `0.0.0.0`
- uses Railway `PORT` when available, with local fallback to `8000`

Expected production Stockfish path:

```env
STOCKFISH_PATH=/usr/games/stockfish
```

Configure API variables:

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
DATABASE_URL=...
CHROMA_PATH=/data/chromadb
STOCKFISH_PATH=/usr/games/stockfish
MAX_GAMES_PER_ANALYSIS=3
MAX_STOCKFISH_DEPTH=10
BACKEND_CORS_ORIGINS=http://localhost:3000
```

Railway manages `PORT`; do not hardcode it in Railway Variables unless Railway requires it for debugging.

Deploy the `api` service, then validate:

```text
GET https://API_RAILWAY_URL/health
GET https://API_RAILWAY_URL/docs
```

## 4. Add The ChromaDB Volume To The API

1. Open the `api` service.
2. Add a persistent volume.
3. Set the mount path to:

```text
/data
```

4. Keep:

```env
CHROMA_PATH=/data/chromadb
```

ChromaDB runs embedded in the FastAPI process. Do not create a separate ChromaDB service for the current architecture.

Do not index studies automatically on each startup.

## 5. Create The Frontend Service

Create a second Railway service from the same GitHub repository.

Recommended Railway settings:

```text
Service name: frontend
Root Directory: frontend
Dockerfile: Dockerfile inside the frontend directory
```

Configure frontend variables before deploying or redeploying:

```env
NEXT_PUBLIC_API_BASE_URL=https://API_RAILWAY_URL
```

The frontend uses `NEXT_PUBLIC_API_BASE_URL` through `frontend/src/lib/api.ts`. Local fallback is `http://localhost:8000`, but production should use the public Railway API URL.

Because `NEXT_PUBLIC_*` variables are baked into the Next.js client bundle at build time, set `NEXT_PUBLIC_API_BASE_URL` before deploying or trigger a redeploy after changing it. The frontend Dockerfile declares it as a build argument for this reason.

Railway provides `PORT` for the service. The Next.js standalone server reads `PORT` at runtime. Docker Compose sets `PORT=3000` only for local development.

Deploy the `frontend` service.

## 6. Update API CORS

After the frontend deploy finishes:

1. Copy the public Railway URL of the `frontend` service.
2. Open the `api` service variables.
3. Update `BACKEND_CORS_ORIGINS`:

```env
BACKEND_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,https://FRONTEND_RAILWAY_URL
```

4. Redeploy the `api` service.

Do not use wildcard CORS (`*`) in production.

## 7. RAG And ChromaDB In Production

If the `/data` volume starts empty, ChromaDB will not contain theory chunks yet. The app can still analyze games, but theory search and theory recommendations may be empty until ChromaDB is populated.

To populate the production volume, run:

```bash
python scripts/index_studies.py
```

Options:

- Use Railway shell if available for the `api` service.
- Use a temporary Railway command/start command to run the indexing script once.
- If neither is convenient, deploy first and leave RAG empty until a safer manual population flow is added.

Do not run `scripts/index_studies.py` automatically on every startup.

## 8. Production Validation Checklist

```text
GET https://API_RAILWAY_URL/health
GET https://API_RAILWAY_URL/docs
Open https://FRONTEND_RAILWAY_URL
Analyze a Lichess username
Analyze a PGN
Open player profile
Check saved analysis
```

## API Variables

| Variable | Required | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | No | OpenAI API key. Leave empty to use the fallback plan. Never commit a real key. |
| `OPENAI_MODEL` | No | Model used for coach advice and training-plan generation. Default: `gpt-4o-mini`. |
| `DATABASE_URL` | Yes | Railway PostgreSQL connection URL. |
| `CHROMA_PATH` | Yes | ChromaDB persistence path. Production recommendation: `/data/chromadb`. |
| `STOCKFISH_PATH` | Yes | Linux Stockfish executable path: `/usr/games/stockfish`. |
| `MAX_GAMES_PER_ANALYSIS` | No | Maximum Lichess games analyzed per request. Production recommendation: `3`. |
| `MAX_STOCKFISH_DEPTH` | No | Maximum Stockfish depth accepted by the backend. Production recommendation: `10`. |
| `BACKEND_CORS_ORIGINS` | Yes | Comma-separated allowed frontend origins. Add the Railway frontend URL after frontend deploy. |
| `PORT` | Provided by Railway | Runtime port. The API Dockerfile falls back to `8000` locally. |

## Frontend Variables

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Yes | Public Railway URL of the `api` service. |
| `PORT` | Provided by Railway | Runtime port for the Next.js standalone server. Local Docker Compose sets `3000`. |

## Secrets Policy

- `OPENAI_API_KEY` must only be configured in Railway Variables.
- Do not commit real `.env` files.
- `.env.example` and `frontend/.env.example` must contain local defaults or placeholders only.
