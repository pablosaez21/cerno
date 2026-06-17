# Cerno frontend

Next.js interface for the Cerno chess coaching API. It supports:

- Lichess player analysis with a diagnosis and weekly training plan.
- Manual PGN analysis with Stockfish.
- Saved player profiles and analysis history.

## Local development

Start the backend from the repository root:

```bash
docker compose up -d
```

Then start the frontend:

```bash
cd frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The frontend expects the API URL in:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Docker

From the repository root, build and run the full stack:

```bash
docker compose up --build
```

The frontend container serves the production Next.js build on:

```text
http://localhost:3000
```

## Checks

```bash
npm run lint
npm run build
```
