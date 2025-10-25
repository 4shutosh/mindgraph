# MindGraph Server

FastAPI + PostgreSQL backend for canvas synchronization.

## Setup

Coming soon...

## Structure

```
app/
├── __init__.py
├── main.py              # FastAPI app entry point
├── config.py            # Configuration management
├── database.py          # Database connection
├── models/              # SQLAlchemy models
├── schemas/             # Pydantic schemas
├── routers/             # API routes
│   ├── auth.py
│   ├── canvases.py
│   └── sync.py
├── services/            # Business logic
└── middleware/          # Custom middleware
```

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload
```
