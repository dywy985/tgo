# TGO-Tech RAG Service API Workflows

## Overview

This document describes the complete API workflows and user journeys for the TGO-Tech RAG Service. It demonstrates how the various endpoints work together to provide a comprehensive document management and search experience.

## Complete RAG Workflow

### End-to-End Document Processing and Search

```mermaid
sequenceDiagram
    participant User
    participant API_Gateway
    participant RAG_Service
    participant Vector_DB
    participant Storage
    participant AI_Service
    
    Note over User,AI_Service: 1. Collection Setup
    User->>API_Gateway: POST /collections
    API_Gateway->>RAG_Service: Create Collection Request
    RAG_Service->>RAG_Service: Validate & Create Collection
    RAG_Service-->>User: Collection Created (201)
    
    Note over User,AI_Service: 2. File Upload & Processing
    User->>API_Gateway: POST /files (multipart/form-data)
    API_Gateway->>RAG_Service: File Upload Request
    RAG_Service->>Storage: Store File
    RAG_Service->>RAG_Service: Create File Record
    RAG_Service-->>User: File Uploaded (202 - Processing)
    
    Note over User,AI_Service: 3. Async Document Processing
    RAG_Service->>RAG_Service: Extract Text & Chunk
    RAG_Service->>Vector_DB: Generate & Store Embeddings
    RAG_Service->>RAG_Service: Update File Status (completed)
    
    Note over User,AI_Service: 4. Document Search
    User->>API_Gateway: POST /collections/{id}/documents/search
    API_Gateway->>RAG_Service: Search Request
    RAG_Service->>Vector_DB: Vector Similarity Search
    Vector_DB-->>RAG_Service: Similar Documents
    RAG_Service-->>User: Search Results (200)
    
    Note over User,AI_Service: 5. AI-Powered Response Generation
    User->>API_Gateway: POST /ai/generate (with search context)
    API_Gateway->>AI_Service: Generate Response
    AI_Service->>AI_Service: Combine Query + Context
    AI_Service-->>User: AI-Generated Response (200)
```

## Collection Management Workflows

### Collection Lifecycle Management

```mermaid
flowchart TD
    START([User Starts]) --> LIST_COLLECTIONS[GET /collections<br/>List existing collections]
    
    LIST_COLLECTIONS --> DECISION{Collection Exists?}
    DECISION -->|No| CREATE_COLLECTION[POST /collections<br/>Create new collection]
    DECISION -->|Yes| SELECT_COLLECTION[Select existing collection]
    
    CREATE_COLLECTION --> COLLECTION_CREATED[Collection Created<br/>Status: 201]
    SELECT_COLLECTION --> COLLECTION_SELECTED[Collection Selected]
    COLLECTION_CREATED --> COLLECTION_SELECTED
    
    COLLECTION_SELECTED --> GET_DETAILS[GET /collections/{id}<br/>Get collection details]
    GET_DETAILS --> MANAGE_DOCS[Manage Documents<br/>in Collection]
    
    MANAGE_DOCS --> UPLOAD_FILES[POST /files<br/>Upload files to collection]
    MANAGE_DOCS --> CREATE_DOCS[POST /collections/{id}/documents<br/>Create documents directly]
    MANAGE_DOCS --> SEARCH_DOCS[POST /collections/{id}/documents/search<br/>Search within collection]
    MANAGE_DOCS --> LIST_DOCS[GET /collections/{id}/documents<br/>List collection documents]
    
    UPLOAD_FILES --> PROCESSING[Async Processing<br/>File → Documents]
    CREATE_DOCS --> PROCESSING
    PROCESSING --> READY[Documents Ready<br/>for Search]
    
    SEARCH_DOCS --> RESULTS[Search Results<br/>with Relevance Scores]
    LIST_DOCS --> DOC_LIST[Paginated Document List]
    
    RESULTS --> AI_INTEGRATION[Optional: AI Service<br/>Response Generation]
    DOC_LIST --> DOCUMENT_MGMT[Document Management<br/>Operations]
    
    DOCUMENT_MGMT --> DELETE_DOC[DELETE /collections/{id}/documents/{doc_id}<br/>Remove specific document]
    
    AI_INTEGRATION --> END([Workflow Complete])
    DELETE_DOC --> END
```

### Collection Organization Strategy

```mermaid
graph TB
    subgraph "Project Level"
        PROJECT[Project: Customer Support]
    end
    
    subgraph "Collection Organization"
        COLL1[Collection: Product Manuals<br/>Metadata: {type: 'manual', version: '2.1'}]
        COLL2[Collection: FAQ Documents<br/>Metadata: {type: 'faq', language: 'en'}]
        COLL3[Collection: Technical Specs<br/>Metadata: {type: 'technical', audience: 'developers'}]
    end
    
    subgraph "Document Distribution"
        COLL1 --> FILES1[Files: PDF Manuals<br/>Documents: 150 chunks]
        COLL2 --> FILES2[Files: FAQ Text<br/>Documents: 75 chunks]
        COLL3 --> FILES3[Files: API Docs<br/>Documents: 200 chunks]
    end
    
    subgraph "Search Strategies"
        FILES1 --> SEARCH1[Search: User Guides<br/>Filter: content_type=paragraph]
        FILES2 --> SEARCH2[Search: Quick Answers<br/>Filter: confidence>0.8]
        FILES3 --> SEARCH3[Search: Code Examples<br/>Filter: content_type=code]
    end
    
    PROJECT --> COLL1
    PROJECT --> COLL2
    PROJECT --> COLL3
```

## File Processing Workflows

### Multi-Format File Processing

```mermaid
flowchart LR
    subgraph "File Upload"
        UPLOAD[POST /files<br/>multipart/form-data]
        METADATA[File Metadata<br/>collection_id, tags, description]
    end
    
    subgraph "File Type Detection"
        PDF_DETECT[PDF Detection<br/>application/pdf]
        DOC_DETECT[Word Detection<br/>application/msword]
        TXT_DETECT[Text Detection<br/>text/plain]
        IMG_DETECT[Image Detection<br/>image/jpeg, image/png]
    end
    
    subgraph "Processing Pipeline"
        PDF_PROCESS[PDF Processing<br/>PDF.js extraction]
        DOC_PROCESS[Document Processing<br/>Pandoc conversion]
        TXT_PROCESS[Text Processing<br/>Direct ingestion]
        OCR_PROCESS[OCR Processing<br/>Tesseract OCR]
    end
    
    subgraph "Document Generation"
        CHUNK_GEN[Document Chunking<br/>Semantic boundaries]
        EMBED_GEN[Embedding Generation<br/>OpenAI API]
        VECTOR_STORE[Vector Storage<br/>Pinecone/Weaviate]
    end
    
    UPLOAD --> PDF_DETECT
    UPLOAD --> DOC_DETECT
    UPLOAD --> TXT_DETECT
    UPLOAD --> IMG_DETECT
    
    PDF_DETECT --> PDF_PROCESS
    DOC_DETECT --> DOC_PROCESS
    TXT_DETECT --> TXT_PROCESS
    IMG_DETECT --> OCR_PROCESS
    
    PDF_PROCESS --> CHUNK_GEN
    DOC_PROCESS --> CHUNK_GEN
    TXT_PROCESS --> CHUNK_GEN
    OCR_PROCESS --> CHUNK_GEN
    
    CHUNK_GEN --> EMBED_GEN
    EMBED_GEN --> VECTOR_STORE
    
    METADATA --> CHUNK_GEN
```

### File Status Monitoring

```mermaid
stateDiagram-v2
    [*] --> pending: File Uploaded
    pending --> processing: Processing Started
    processing --> completed: Processing Success
    processing --> failed: Processing Error
    failed --> processing: Retry Processing
    completed --> archived: Archive File
    archived --> [*]: Cleanup Complete
    
    note right of pending
        File stored in storage
        Database record created
        Queued for processing
    end note
    
    note right of processing
        Text extraction in progress
        Chunking and embedding
        Vector storage operations
    end note
    
    note right of completed
        All documents created
        Embeddings stored
        Ready for search
    end note
    
    note right of failed
        Processing error occurred
        Error details logged
        Available for retry
    end note
```

## Search and Retrieval Workflows

### Advanced Search Patterns

```mermaid
sequenceDiagram
    participant User
    participant RAG_Service
    participant Cache
    participant Vector_DB
    participant Database
    
    Note over User,Database: Cached Search Flow
    User->>RAG_Service: POST /collections/{id}/documents/search
    RAG_Service->>Cache: Check Search Cache
    Cache-->>RAG_Service: Cache Hit
    RAG_Service-->>User: Cached Results (200)
    
    Note over User,Database: Fresh Search Flow
    User->>RAG_Service: POST /collections/{id}/documents/search
    RAG_Service->>Cache: Check Search Cache
    Cache-->>RAG_Service: Cache Miss
    
    RAG_Service->>RAG_Service: Generate Query Embedding
    RAG_Service->>Vector_DB: Vector Similarity Search
    Vector_DB-->>RAG_Service: Vector IDs + Scores
    
    RAG_Service->>Database: Fetch Document Metadata
    Database-->>RAG_Service: Document Details
    
    RAG_Service->>RAG_Service: Apply Filters & Ranking
    RAG_Service->>Cache: Store Results in Cache
    RAG_Service-->>User: Search Results (200)
```

### Search Result Optimization

```mermaid
graph TB
    subgraph "Query Processing"
        QUERY[User Query<br/>How to install software?]
        PREPROCESS[Query Preprocessing<br/>Tokenization, Normalization]
        EMBEDDING[Query Embedding<br/>Vector Generation]
    end
    
    subgraph "Search Execution"
        VECTOR_SEARCH[Vector Similarity Search<br/>Top-K Retrieval]
        FILTER_APPLY[Apply Filters<br/>Collection, Language, Type]
        SCORE_CALC[Score Calculation<br/>Relevance + Confidence]
    end
    
    subgraph "Result Enhancement"
        SNIPPET_GEN[Content Snippet Generation<br/>Highlight Relevant Parts]
        METADATA_ENRICH[Metadata Enrichment<br/>Add Context Information]
        RANKING[Final Ranking<br/>Relevance + Recency + Quality]
    end
    
    subgraph "Response Format"
        PAGINATION[Pagination<br/>Limit + Offset]
        RESPONSE[JSON Response<br/>Results + Metadata]
    end
    
    QUERY --> PREPROCESS
    PREPROCESS --> EMBEDDING
    EMBEDDING --> VECTOR_SEARCH
    
    VECTOR_SEARCH --> FILTER_APPLY
    FILTER_APPLY --> SCORE_CALC
    
    SCORE_CALC --> SNIPPET_GEN
    SNIPPET_GEN --> METADATA_ENRICH
    METADATA_ENRICH --> RANKING
    
    RANKING --> PAGINATION
    PAGINATION --> RESPONSE
```

## Error Handling Workflows

### Comprehensive Error Management

```mermaid
flowchart TD
    API_CALL[API Request] --> VALIDATION{Request Valid?}
    
    VALIDATION -->|No| VALIDATION_ERROR[400 Bad Request<br/>Validation Details]
    VALIDATION -->|Yes| AUTH_CHECK{Authenticated?}
    
    AUTH_CHECK -->|No| AUTH_ERROR[401 Unauthorized<br/>Authentication Required]
    AUTH_CHECK -->|Yes| AUTHZ_CHECK{Authorized?}
    
    AUTHZ_CHECK -->|No| AUTHZ_ERROR[403 Forbidden<br/>Access Denied]
    AUTHZ_CHECK -->|Yes| RESOURCE_CHECK{Resource Exists?}
    
    RESOURCE_CHECK -->|No| NOT_FOUND[404 Not Found<br/>Resource Details]
    RESOURCE_CHECK -->|Yes| RATE_LIMIT{Rate Limit OK?}
    
    RATE_LIMIT -->|No| RATE_ERROR[429 Too Many Requests<br/>Retry After Header]
    RATE_LIMIT -->|Yes| PROCESS[Process Request]
    
    PROCESS --> SUCCESS{Success?}
    SUCCESS -->|Yes| SUCCESS_RESPONSE[200/201/204 Success<br/>Response Data]
    SUCCESS -->|No| SERVER_ERROR[500 Internal Error<br/>Error ID for Support]
    
    VALIDATION_ERROR --> ERROR_LOG[Log Error Details]
    AUTH_ERROR --> ERROR_LOG
    AUTHZ_ERROR --> ERROR_LOG
    NOT_FOUND --> ERROR_LOG
    RATE_ERROR --> ERROR_LOG
    SERVER_ERROR --> ERROR_LOG
    
    ERROR_LOG --> METRICS[Update Error Metrics]
    METRICS --> ALERT{Alert Threshold?}
    ALERT -->|Yes| NOTIFICATION[Send Alert Notification]
    ALERT -->|No| END([End])
    NOTIFICATION --> END
    SUCCESS_RESPONSE --> END
```

### Retry and Circuit Breaker Patterns

```mermaid
sequenceDiagram
    participant Client
    participant RAG_Service
    participant Circuit_Breaker
    participant External_Service
    
    Note over Client,External_Service: Normal Operation
    Client->>RAG_Service: API Request
    RAG_Service->>Circuit_Breaker: Check Circuit State
    Circuit_Breaker-->>RAG_Service: CLOSED (Allow)
    RAG_Service->>External_Service: External Call
    External_Service-->>RAG_Service: Success Response
    RAG_Service-->>Client: Success (200)
    
    Note over Client,External_Service: Failure Scenario
    Client->>RAG_Service: API Request
    RAG_Service->>Circuit_Breaker: Check Circuit State
    Circuit_Breaker-->>RAG_Service: CLOSED (Allow)
    RAG_Service->>External_Service: External Call
    External_Service-->>RAG_Service: Error Response
    RAG_Service->>RAG_Service: Increment Failure Count
    RAG_Service->>Circuit_Breaker: Report Failure
    Circuit_Breaker->>Circuit_Breaker: Check Threshold
    
    Note over Client,External_Service: Circuit Open
    Client->>RAG_Service: API Request
    RAG_Service->>Circuit_Breaker: Check Circuit State
    Circuit_Breaker-->>RAG_Service: OPEN (Reject)
    RAG_Service-->>Client: Service Unavailable (503)
```

This comprehensive API workflow documentation provides clear guidance on how to effectively use the RAG service endpoints to build powerful document processing and search applications.
