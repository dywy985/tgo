# RAG Service Testing Guide

## Overview

This document provides comprehensive information about the testing strategy and implementation for the TGO RAG Service. The test suite is designed to achieve high code coverage while maintaining reliability and avoiding external dependencies.

## Test Structure

### Test Categories

1. **Unit Tests** - Test individual components in isolation
2. **Integration Tests** - Test component interactions
3. **Workflow Tests** - Test complete RAG workflows end-to-end

### Test Files

```
tests/
├── conftest.py                          # Shared fixtures and configuration
├── test_runner.py                       # Test runner script
├── test_vector_store_unit.py           # Vector store service tests
├── test_embedding_service_unit.py      # Embedding service tests
├── test_search_service_unit.py         # Search service tests
├── test_document_processing_unit.py    # Document processing task tests
├── test_rag_workflow_integration.py    # Complete workflow tests
├── test_search_integration.py          # Search integration tests
└── test_health.py                      # Health check tests
```

## Running Tests

### Quick Commands

```bash
# Run all unit tests with coverage
make test-unit

# Run integration tests
make test-integration

# Run all tests
make test-all

# Run specific test categories
make test-services    # Service layer tests only
make test-tasks      # Task tests only
make test-workflow   # RAG workflow tests
```

### Detailed Commands

```bash
# Run with custom pytest options
poetry run pytest tests/test_vector_store_unit.py -v --tb=short

# Run with coverage reporting
poetry run pytest --cov=src/rag_service --cov-report=html --cov-fail-under=80

# Run specific test methods
poetry run pytest tests/test_embedding_service_unit.py::TestEmbeddingService::test_generate_embedding_success -v
```

## Test Implementation Details

### Mocking Strategy

The test suite uses comprehensive mocking to avoid external dependencies:

1. **Database Operations**: Mocked using `AsyncMock` for database sessions
2. **OpenAI API**: Replaced with `DeterministicFakeEmbedding` for consistent results
3. **Vector Store**: Mocked `PGVectorStore` operations
4. **File System**: Mocked file operations and temporary files

### Fake Embedding Implementation

```python
class FakeEmbedding:
    """Deterministic fake embedding for testing."""
    
    def embed_query(self, text: str):
        """Generate deterministic embedding based on text hash."""
        import hashlib
        hash_val = int(hashlib.md5(text.encode()).hexdigest()[:8], 16)
        return [(hash_val % 1000) / 1000.0] * 1536
```

This approach ensures:
- Consistent test results across runs
- No external API dependencies
- Fast test execution
- Deterministic behavior for debugging

### Async Testing

All async functions are tested using `pytest-asyncio`:

```python
@pytest.mark.asyncio
async def test_async_function():
    result = await some_async_function()
    assert result is not None
```

## Test Coverage

### Current Coverage Targets

- **Overall Coverage**: >75%
- **Service Layer**: >80%
- **Core Functions**: >90%

### Coverage Areas

1. **Vector Store Service** (`src/rag_service/services/vector_store.py`)
   - Document embedding addition (single and batch)
   - Similarity search with various parameters
   - Document deletion from vector store
   - Error handling for vector operations

2. **Embedding Service** (`src/rag_service/services/embedding.py`)
   - Single embedding generation
   - Batch embedding generation
   - API error handling
   - Configuration validation

3. **Search Service** (`src/rag_service/services/search.py`)
   - Semantic search functionality
   - Keyword search with PostgreSQL full-text search
   - Hybrid search combining both approaches
   - Search result ranking and filtering

4. **Document Processing** (`src/rag_service/tasks/document_processing.py`)
   - File content extraction for multiple formats
   - Document chunking with configurable parameters
   - Embedding generation integration
   - Error handling and status updates

## Test Fixtures

### Common Fixtures

```python
@pytest.fixture
def fake_embeddings():
    """Deterministic fake embeddings for testing."""
    return FakeEmbedding(size=1536)

@pytest.fixture
def mock_db_session():
    """Mock database session with common setup."""
    mock_session = AsyncMock()
    # ... setup code
    return mock_session

@pytest.fixture
def sample_search_result():
    """Sample search result for testing."""
    return SearchResult(
        document_id=uuid4(),
        # ... other fields
    )
```

### Service-Specific Fixtures

Each test file includes fixtures specific to the component being tested:

- `mock_vector_store` - Mock PGVectorStore instance
- `mock_embedding_service` - Mock embedding service with fake embeddings
- `mock_file_record` - Mock file database record
- `sample_documents` - Sample document data for processing

## Error Testing

### Error Scenarios Covered

1. **Network Errors**: API timeouts, connection failures
2. **Validation Errors**: Empty inputs, invalid parameters
3. **Database Errors**: Connection failures, constraint violations
4. **File System Errors**: Missing files, permission issues
5. **Processing Errors**: Unsupported file formats, corrupted data

### Example Error Test

```python
@pytest.mark.asyncio
async def test_embedding_generation_api_error(self, mock_settings):
    """Test embedding generation with API error."""
    with patch('asyncio.get_event_loop') as mock_get_loop:
        mock_loop = MagicMock()
        mock_get_loop.return_value = mock_loop
        mock_loop.run_in_executor = AsyncMock(side_effect=Exception("API Error"))
        
        service = EmbeddingService()
        
        with pytest.raises(Exception, match="API Error"):
            await service.generate_embedding("test text")
```

## Integration Testing

### Workflow Tests

The `test_rag_workflow_integration.py` file tests complete workflows:

1. **Document Upload to Search**: Full pipeline from file upload to search results
2. **Batch Processing**: Multiple documents processed together
3. **Error Recovery**: Handling failures at different stages
4. **Result Ranking**: Proper scoring and ranking of search results

### Database Integration

Integration tests use test containers for real database testing:

```python
@pytest.fixture(scope="session")
def postgres_container():
    """Start a PostgreSQL container for testing."""
    with PostgresContainer("pgvector/pgvector:pg16") as postgres:
        yield postgres
```

## Performance Testing

### Load Testing

Tests include scenarios for:
- Batch processing of large document sets
- Concurrent search operations
- Memory usage during embedding generation
- Database connection pooling under load

### Benchmarking

Key performance metrics tracked:
- Embedding generation time per document
- Search response time
- Database query performance
- Memory usage patterns

## Continuous Integration

### GitHub Actions Integration

```yaml
- name: Run Tests
  run: |
    make test-all
    
- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage.xml
```

### Pre-commit Hooks

```yaml
repos:
  - repo: local
    hooks:
      - id: pytest
        name: pytest
        entry: poetry run pytest
        language: system
        pass_filenames: false
        always_run: true
```

## Debugging Tests

### Common Issues

1. **Async Test Failures**: Ensure proper `@pytest.mark.asyncio` decoration
2. **Mock Setup**: Verify all required mocks are properly configured
3. **Fixture Scope**: Check fixture scope matches test requirements
4. **Import Errors**: Ensure proper path setup in test files

### Debug Commands

```bash
# Run with verbose output and no capture
poetry run pytest tests/test_vector_store_unit.py -v -s

# Run with pdb on failure
poetry run pytest tests/test_embedding_service_unit.py --pdb

# Run with detailed traceback
poetry run pytest tests/test_search_service_unit.py --tb=long
```

## Best Practices

### Test Writing Guidelines

1. **Descriptive Names**: Test names should clearly describe what is being tested
2. **Single Responsibility**: Each test should focus on one specific behavior
3. **Arrange-Act-Assert**: Follow the AAA pattern for test structure
4. **Mock Minimally**: Only mock external dependencies, not internal logic
5. **Test Edge Cases**: Include tests for boundary conditions and error scenarios

### Maintenance

1. **Regular Updates**: Keep tests updated with code changes
2. **Coverage Monitoring**: Monitor coverage trends and address gaps
3. **Performance**: Ensure tests run quickly to support rapid development
4. **Documentation**: Keep test documentation current with implementation

## Future Enhancements

### Planned Improvements

1. **Property-Based Testing**: Add hypothesis-based tests for edge cases
2. **Load Testing**: Implement comprehensive performance testing
3. **Contract Testing**: Add API contract tests for external integrations
4. **Mutation Testing**: Implement mutation testing for test quality assessment
