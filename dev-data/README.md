# Dev Data

This directory is for development database exports that are safe to commit to your private Git repository.

Files:

- `llm_delegate.sql`: PostgreSQL development data dump
- `export-info.json`: export metadata

Export:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export-dev-data.ps1
```

Import on another development machine:

```powershell
docker compose -f docker-compose.dev.yml up -d
powershell -ExecutionPolicy Bypass -File .\scripts\import-dev-data.ps1
```

Notes:

- Redis session data is not included.
- After import, log in again if needed.
