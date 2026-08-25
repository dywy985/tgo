# TGO-Tech AI Service

**TGO-Tech AI Service** - AI/ML Operations Microservice

This service handles AI agent management, knowledge base operations, and usage analytics for the TGO-Tech customer service platform.

## Features

- **Team Management**: Create and manage teams for organizing AI agents
- **Agent Management**: Full CRUD operations for AI agents with team-based organization
- **Tool Integration**: Manage tool bindings for AI agents
- **Knowledge Base**: Collection management for RAG functionality
- **Usage Analytics**: Comprehensive tracking and monitoring
- **Dual Authentication**: Support for both JWT tokens and API keys
- **Multi-tenant**: Project-based isolation and access control

## Architecture

- **Framework**: FastAPI with automatic OpenAPI documentation
- **Database**: PostgreSQL with SQLAlchemy ORM and async support
- **Authentication**: JWT and API key support
- **Dependency Injection**: FastAPI-native dependency injection for services
- **Configuration**: Pydantic Settings with environment variable support
- **Logging**: Structured logging with structlog
- **Testing**: Comprehensive test suite with pytest and dependency mocking

## Quick Start

### Prerequisites

- Python 3.11+
- PostgreSQL 12+
- Poetry (for dependency management)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd tgo-ai-service
```

2. Install dependencies:
```bash
poetry install
```

Activate the virtual environment:

```bash
eval $(poetry env activate)
```


3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Run database migrations:
```bash
poetry run alembic upgrade head
```

5. Start the development server:
```bash
poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8081
```

The API will be available at `http://localhost:8081` with interactive documentation at `http://localhost:8081/docs`.

## Configuration

The service uses environment variables for configuration. See `.env.example` for all available options.

### Key Configuration Options

- `DATABASE_URL`: PostgreSQL connection string
- `SECRET_KEY`: JWT signing secret
- `API_KEY_PREFIX`: Prefix for API keys (default: "ak_")
- `LOG_LEVEL`: Logging level (DEBUG, INFO, WARNING, ERROR)
- `CORS_ORIGINS`: Allowed CORS origins
- `AGENT_SERVICE_URL`: External agent runtime service base URL

## API Documentation

The service provides comprehensive OpenAPI documentation available at:
- Interactive docs: `http://localhost:8081/docs`
- ReDoc: `http://localhost:8081/redoc`
- OpenAPI JSON: `http://localhost:8081/openapi.json`

### Authentication

The API supports two authentication methods:

1. **JWT Authentication** (service-to-service):
```bash
Authorization: Bearer <jwt-token>
```

2. **API Key Authentication** (project-scoped):
```bash
X-API-Key: ak_live_1234567890abcdef
```

## Development

### Running Tests

```bash
# Run all tests
poetry run pytest

# Run with coverage
poetry run pytest --cov=app

# Run specific test file
poetry run pytest tests/test_teams.py

# Run integration tests only
poetry run pytest -m integration
```

### Code Quality

```bash
# Format code
poetry run black app tests
poetry run isort app tests

# Lint code
poetry run flake8 app tests
poetry run mypy app

# Run pre-commit hooks
poetry run pre-commit run --all-files
```

### Database Migrations

The project uses Alembic for database migrations with async PostgreSQL support:

```bash
# Create a new migration
poetry run alembic revision --autogenerate -m "Description"

# Apply migrations
poetry run alembic upgrade head

# Rollback migration
poetry run alembic downgrade -1

# Generate SQL without executing (offline mode)
poetry run alembic upgrade head --sql

# Check current migration status
poetry run alembic current

# Show migration history
poetry run alembic history
```

**Note**: The migration environment is configured to use the async `asyncpg` driver for online migrations and the sync driver for offline SQL generation.

### Dependency Injection

The application uses FastAPI's dependency injection system for services:

```python
# Services are injected as dependencies
@router.get("/teams")
async def list_teams(
    team_service: TeamService = Depends(get_team_service),
    project_id: uuid.UUID = Depends(get_current_project_id),
) -> dict:
    teams, total = await team_service.list_teams(project_id)
    return {"data": teams, "total": total}
```

**Benefits:**
- **Testability**: Easy to mock services in tests
- **Separation of Concerns**: Clear boundaries between layers
- **Flexibility**: Easy to swap implementations
- **FastAPI Integration**: Native support for dependency injection

### Development Environment

The application includes special features for development convenience:

#### Development API Key
- When `ENVIRONMENT=development`, a special API key `"dev"` is automatically created
- This key provides instant access without needing to configure real API keys
- The development project is auto-seeded on application startup
- In production, the `"dev"` key is rejected with a 401 error

```bash
# Start in development mode
ENVIRONMENT=development poetry run uvicorn app.main:app --reload

# Test with development API key
curl -H "X-API-Key: dev" http://localhost:8000/api/v1/teams
```

#### OpenAPI Documentation Security
- Both JWT Bearer tokens and API keys are supported in Swagger UI
- Use the "Authorize" button in `/docs` to set authentication
- For development: use `dev` as the API key
- For production: use your project's actual API key (format: `ak_...`)

**Security Schemas:**
- **Bearer Auth**: JWT tokens in `Authorization: Bearer <token>` header
- **API Key Auth**: API keys in `X-API-Key: <key>` header

## Project Structure

```
app/
├── __init__.py
├── main.py                 # FastAPI application entry point
├── config.py              # Configuration settings
├── database.py            # Database connection and session management
├── dependencies.py        # FastAPI dependencies
├── exceptions.py          # Custom exception classes
├── middleware.py          # Custom middleware
├── models/                # SQLAlchemy models
├── schemas/               # Pydantic models for API
├── api/                   # API route handlers
├── services/              # Business logic services
├── auth/                  # Authentication and authorization
└── utils/                 # Utility functions

tests/                     # Test suite
migrations/               # Alembic database migrations
```

## Deployment

### Docker

```bash
# Build image
docker build -t tgo-ai-service .

# Run container
docker run -p 8081:8081 --env-file .env tgo-ai-service
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

Proprietary - TGO-Tech
