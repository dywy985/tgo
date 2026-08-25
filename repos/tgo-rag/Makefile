.PHONY: help dev build test lint format clean install migrate seed logs

# Default target
help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Development commands
dev: ## Start development environment with Docker Compose
	@echo "Starting development environment..."
	@docker-compose up --build -d
	@echo "Waiting for services to be ready..."
	@sleep 15
	@echo "Running database migrations..."
	@docker-compose exec rag-service poetry run alembic upgrade head || true
	@echo "Development environment is ready!"
	@echo "API: http://localhost:8082"
	@echo "API Docs: http://localhost:8082/docs"
	@echo "Flower (Celery): http://localhost:5555"
	@echo "Adminer (Database): http://localhost:8080"

dev-logs: ## Show logs from development environment
	@docker-compose logs -f

dev-stop: ## Stop development environment
	@docker-compose down

dev-clean: ## Stop and remove all containers, networks, and volumes
	@docker-compose down -v --remove-orphans
	@docker system prune -f

dev-rebuild: ## Rebuild and restart development environment
	@docker-compose down
	@docker-compose build --no-cache
	@docker-compose up -d
	@echo "Waiting for services to be ready..."
	@sleep 15
	@echo "Development environment rebuilt!"

dev-status: ## Show status of all services
	@docker-compose ps

# Installation and setup
install: ## Install dependencies with Poetry
	@poetry install --with dev

install-pre-commit: ## Install pre-commit hooks
	@poetry run pre-commit install

# Database commands
migrate: ## Run database migrations
	@poetry run alembic upgrade head

migrate-create: ## Create a new migration (usage: make migrate-create MESSAGE="description")
	@poetry run alembic revision --autogenerate -m "$(MESSAGE)"

migrate-rollback: ## Rollback last migration
	@poetry run alembic downgrade -1

migrate-reset: ## Reset database (WARNING: destroys all data)
	@poetry run alembic downgrade base
	@poetry run alembic upgrade head

# Testing commands
test: ## Run all tests
	@poetry run pytest

test-unit: ## Run unit tests only
	@poetry run python tests/test_runner.py --type unit

test-integration: ## Run integration tests only
	@poetry run python tests/test_runner.py --type integration

test-all: ## Run all tests with coverage
	@poetry run python tests/test_runner.py --type all

test-cov: ## Run tests with coverage report
	@poetry run pytest --cov=src/rag_service --cov-report=html --cov-report=term --cov-fail-under=80

test-services: ## Run service layer tests only
	@poetry run pytest tests/test_*_service_unit.py tests/test_vector_store_unit.py -v --cov=src/rag_service/services

test-tasks: ## Run task tests only
	@poetry run pytest tests/test_document_processing_unit.py -v --cov=src/rag_service/tasks

test-workflow: ## Run RAG workflow integration tests
	@poetry run pytest tests/test_rag_workflow_integration.py -v

test-watch: ## Run tests in watch mode
	@poetry run pytest-watch

# Code quality commands
lint: ## Run all linting tools
	@poetry run flake8 src tests
	@poetry run mypy src
	@poetry run black --check src tests
	@poetry run isort --check-only src tests

format: ## Format code with black and isort
	@poetry run black src tests
	@poetry run isort src tests

format-check: ## Check if code is properly formatted
	@poetry run black --check src tests
	@poetry run isort --check-only src tests

# Build commands
build: ## Build Docker image for production
	@docker build --target production -t tgo-rag-service:latest .

build-dev: ## Build Docker image for development
	@docker build --target development -t tgo-rag-service:dev .

# Utility commands
shell: ## Open shell in running container
	@docker-compose exec rag-service bash

db-shell: ## Open PostgreSQL shell
	@docker-compose exec postgres psql -U rag_user -d rag_service

redis-shell: ## Open Redis CLI
	@docker-compose exec redis redis-cli -a redis_password

logs: ## Show logs from all services
	@docker-compose logs -f

logs-api: ## Show logs from API service only
	@docker-compose logs -f rag-service

logs-worker: ## Show logs from Celery worker only
	@docker-compose logs -f celery-worker

# Monitoring commands
health: ## Check health of all services
	@echo "Checking service health..."
	@curl -s http://localhost:8082/health | jq . || echo "API service not responding"
	@docker-compose ps

metrics: ## Show metrics endpoint
	@curl -s http://localhost:8082/metrics

# Data management
seed: ## Seed database with sample data
	@poetry run python scripts/seed_data.py

backup-db: ## Backup database
	@docker-compose exec postgres pg_dump -U rag_user rag_service > backup_$(shell date +%Y%m%d_%H%M%S).sql

restore-db: ## Restore database from backup (usage: make restore-db FILE=backup.sql)
	@docker-compose exec -T postgres psql -U rag_user -d rag_service < $(FILE)

# Cleanup commands
clean: ## Clean up temporary files and caches
	@find . -type f -name "*.pyc" -delete
	@find . -type d -name "__pycache__" -delete
	@find . -type d -name "*.egg-info" -exec rm -rf {} +
	@find . -type d -name ".pytest_cache" -exec rm -rf {} +
	@find . -type d -name ".mypy_cache" -exec rm -rf {} +
	@rm -rf htmlcov/
	@rm -rf .coverage
	@rm -rf dist/
	@rm -rf build/

clean-docker: ## Clean up Docker resources
	@docker system prune -f
	@docker volume prune -f
