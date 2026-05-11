# InClass AI Face Service

FastAPI microservice for face registration, recognition, and verification.

## Run locally

```bash
cd backend/ai-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set DATABASE_URL=postgresql://...
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Environment

- `DATABASE_URL`
- `AI_FACE_SERVICE_URL` on the Node backend, usually `http://127.0.0.1:8000`
- `AI_FACE_TIMEOUT_MS`

## Deployment notes

Keep this service inside the backend repository so your AWS deployment can ship one codebase. In Linux/AWS containers, the backend now auto-starts it with `python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000` when `AI_FACE_SERVICE_URL` points to localhost.
