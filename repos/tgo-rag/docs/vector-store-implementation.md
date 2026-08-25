# Vector Store Implementation Update

## Overview

The vector store implementation has been updated to use the modern `langchain-postgres` API with `PGEngine` and `PGVectorStore` instead of the deprecated `PGVector` class.

## Changes Made

### 1. Updated Imports

**Before:**
```python
from langchain_postgres import PGVector
```

**After:**
```python
from langchain_postgres import PGEngine, PGVectorStore
from sqlalchemy import create_engine
```

### 2. Updated Vector Store Initialization

**Before:**
```python
self._vector_store = PGVector(
    embeddings=self.embedding_service.embeddings_client,
    connection_string=self.settings.database_url.replace("+asyncpg", ""),
    collection_name="rag_documents",
    distance_strategy="cosine",
)
```

**After:**
```python
# Create synchronous engine for langchain-postgres
sync_db_url = self.settings.database_url.replace("+asyncpg", "")
sync_engine = create_engine(sync_db_url)

# Create PGEngine instance
self._pg_engine = PGEngine.from_engine(sync_engine)

# Create PGVectorStore instance
self._vector_store = PGVectorStore(
    embeddings=self.embedding_service.embeddings_client,
    engine=self._pg_engine,
    collection_name="rag_documents",
    distance_strategy="cosine",
)
```

### 3. Updated Method Calls

Since the new `PGVectorStore` uses synchronous methods, all vector operations are now wrapped in `asyncio.run_in_executor()` to maintain async compatibility:

**Adding Documents:**
```python
# Run synchronous operation in thread pool
import asyncio
loop = asyncio.get_event_loop()
vector_ids = await loop.run_in_executor(
    None,
    lambda: vector_store.add_texts(
        texts=[content],
        metadatas=[doc_metadata],
        ids=[str(document_id)]
    )
)
```

**Similarity Search:**
```python
results = await loop.run_in_executor(
    None,
    lambda: vector_store.similarity_search_with_score(
        query=query,
        k=k,
        filter=filter_dict
    )
)
```

**Deleting Documents:**
```python
await loop.run_in_executor(
    None,
    lambda: vector_store.delete(ids=[str(document_id)])
)
```

## Key Benefits

1. **Modern API**: Uses the latest `langchain-postgres` API that is actively maintained
2. **Better Performance**: The new `PGVectorStore` is optimized for PostgreSQL operations
3. **Improved Reliability**: More stable connection handling with `PGEngine`
4. **Future-Proof**: Ensures compatibility with future `langchain-postgres` updates

## Compatibility

The updated implementation maintains the same external interface, so no changes are required in:
- Search service
- Document processing tasks
- API endpoints
- Test suites

## Testing

The implementation includes comprehensive tests:
- Unit tests for vector store operations (`tests/test_vector_store.py`)
- Integration tests with search service (`tests/test_search_integration.py`)
- Mock-based testing to avoid external dependencies during testing

## Configuration

No configuration changes are required. The service automatically:
- Converts async database URLs to sync format for `langchain-postgres`
- Creates appropriate engine instances
- Handles connection pooling through SQLAlchemy

## Error Handling

The implementation includes proper error handling for:
- Connection failures
- Embedding generation errors
- Vector store operation failures
- Database update failures

All errors are logged with appropriate context for debugging.

## Performance Considerations

1. **Thread Pool Usage**: Synchronous vector operations run in thread pools to avoid blocking the async event loop
2. **Batch Operations**: Support for batch embedding generation and storage for better performance
3. **Connection Reuse**: Engine instances are cached and reused across operations
4. **Memory Management**: Proper cleanup of resources and connections

## Migration Notes

If upgrading from the old implementation:

1. Ensure `langchain-postgres` is updated to the latest version
2. No data migration is required - existing vectors remain compatible
3. The vector store collection name remains "rag_documents"
4. All existing embeddings and metadata are preserved

## Future Enhancements

The new implementation provides a foundation for:
- Advanced filtering capabilities
- Custom distance strategies
- Improved metadata handling
- Better integration with PostgreSQL features
