#!/bin/sh
set -e

# Wait briefly for Postgres when starting via Compose
if [ -n "$DATABASE_URL" ]; then
  python - <<'PY'
import os, time
import sqlalchemy as sa

url = os.environ.get("DATABASE_URL", "").strip()
if url.startswith("postgres://"):
    url = "postgresql+psycopg2://" + url[len("postgres://"):]
elif url.startswith("postgresql://") and "+psycopg" not in url.split("://", 1)[0]:
    url = "postgresql+psycopg2://" + url[len("postgresql://"):]

for i in range(30):
    try:
        sa.create_engine(url).connect().close()
        print("Database ready")
        break
    except Exception as exc:
        print(f"Waiting for database ({i + 1}/30): {exc}")
        time.sleep(1)
else:
    raise SystemExit("Database not reachable")
PY
fi

python seed.py
exec gunicorn -b 0.0.0.0:${PORT:-5000} --workers ${WEB_CONCURRENCY:-2} app:app
