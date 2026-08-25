# TGO-Tech RAG Service Architecture

## Overview

The TGO-Tech RAG (Retrieval-Augmented Generation) Service is a microservice-based system designed to handle document processing, vector embedding generation, and semantic search capabilities for AI-powered customer service operations. The architecture follows a distributed design pattern with clear separation of concerns across multiple services.

## System Architecture

### High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[Web Application]
        API_CLIENT[API Clients]
        AI_AGENT[AI Agents]
    end
    
    subgraph "API Gateway"
        GATEWAY[API Gateway/Load Balancer]
    end
    
    subgraph "Microservices"
        API_SVC[API Service<br/>Port: 8081]
        RAG_SVC[RAG Service<br/>Port: 8082]
        AI_SVC[AI Service<br/>Port: 8083]
    end
    
    subgraph "Data Layer"
        API_DB[(API Database<br/>PostgreSQL)]
        RAG_DB[(RAG Database<br/>PostgreSQL)]
        VECTOR_DB[(Vector Database<br/>Pinecone/Weaviate)]
    end
    
    subgraph "Storage Layer"
        LOCAL_STORAGE[Local Storage]
        S3[AWS S3]
        GCS[Google Cloud Storage]
        AZURE[Azure Blob Storage]
    end
    
    subgraph "External Services"
        OPENAI[OpenAI API<br/>Embeddings & LLM]
        WEBHOOK[Webhook Endpoints]
    end
    
    WEB --> GATEWAY
    API_CLIENT --> GATEWAY
    AI_AGENT --> GATEWAY
    
    GATEWAY --> API_SVC
    GATEWAY --> RAG_SVC
    GATEWAY --> AI_SVC
    
    API_SVC --> API_DB
    RAG_SVC --> RAG_DB
    RAG_SVC --> VECTOR_DB
    AI_SVC --> OPENAI
    
    RAG_SVC --> LOCAL_STORAGE
    RAG_SVC --> S3
    RAG_SVC --> GCS
    RAG_SVC --> AZURE
    
    API_SVC -.->|Events| RAG_SVC
    RAG_SVC -.->|Document Data| AI_SVC
    AI_SVC -.->|Webhooks| WEBHOOK
```

### Service Component Diagram

```mermaid
graph LR
    subgraph "API Service"
        API_CTRL[API Controllers]
        API_AUTH[Authentication]
        API_PROJ[Project Management]
        API_USER[User Management]
    end
    
    subgraph "RAG Service"
        RAG_CTRL[RAG Controllers]
        RAG_AUTH[Auth Middleware]
        RAG_COLL[Collection Management]
        RAG_FILE[File Processing]
        RAG_DOC[Document Processing]
        RAG_EMBED[Embedding Generation]
        RAG_SEARCH[Search Engine]
    end
    
    subgraph "AI Service"
        AI_CTRL[AI Controllers]
        AI_RAG[RAG Integration]
        AI_LLM[LLM Interface]
        AI_CONTEXT[Context Management]
    end
    
    API_CTRL --> RAG_CTRL
    RAG_SEARCH --> AI_RAG
    AI_RAG --> AI_LLM
```

## Database Schema Architecture

### Entity Relationship Diagram

```mermaid
erDiagram
    rag_projects {
        uuid id PK
        varchar name
        varchar api_key UK
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }
    
    rag_collections {
        uuid id PK
        uuid project_id FK
        varchar display_name
        text description
        jsonb metadata
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }
    
    rag_files {
        uuid id PK
        uuid project_id FK
        uuid collection_id FK
        varchar original_filename
        bigint file_size
        varchar content_type
        varchar storage_provider
        varchar storage_path
        jsonb storage_metadata
        varchar status
        integer document_count
        integer total_tokens
        varchar language
        text description
        jsonb tags
        varchar uploaded_by
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at
    }
    
    rag_file_documents {
        uuid id PK
        uuid file_id FK
        uuid collection_id FK
        varchar document_id
        varchar collection_name
        varchar document_title
        text content
        integer content_length
        integer token_count
        integer chunk_index
        varchar section_title
        integer page_number
        varchar content_type
        varchar language
        decimal confidence_score
        jsonb tags
        varchar embedding_model
        integer embedding_dimensions
        varchar vector_id
        timestamp created_at
        timestamp updated_at
    }
    
    rag_projects ||--o{ rag_collections : "has many"
    rag_projects ||--o{ rag_files : "has many"
    rag_collections ||--o{ rag_files : "contains"
    rag_collections ||--o{ rag_file_documents : "contains"
    rag_files ||--o{ rag_file_documents : "generates"
```

### Data Relationships

- **Projects**: Top-level tenant isolation with synchronized data from API service
- **Collections**: Logical grouping of documents within projects for better organization
- **Files**: Physical file storage with metadata and processing status
- **Documents**: Processed document chunks with vector embeddings for RAG operations

## Authentication & Authorization Flow

```mermaid
sequenceDiagram
    participant Client
    participant Gateway
    participant RAG_Service
    participant API_Service
    participant Database
    
    Note over Client,Database: JWT Authentication Flow
    Client->>Gateway: Request with JWT Token
    Gateway->>RAG_Service: Forward with JWT
    RAG_Service->>RAG_Service: Validate JWT & Extract Claims
    RAG_Service->>Database: Query with Project Context
    Database-->>RAG_Service: Return Project-Scoped Data
    RAG_Service-->>Client: Response
    
    Note over Client,Database: API Key Authentication Flow
    Client->>Gateway: Request with X-API-Key
    Gateway->>RAG_Service: Forward with API Key
    RAG_Service->>Database: Validate API Key
    Database-->>RAG_Service: Return Project ID
    RAG_Service->>Database: Query with Project Filter
    Database-->>RAG_Service: Return Project-Scoped Data
    RAG_Service-->>Client: Response
```

## Technology Stack

### Core Technologies
- **Runtime**: Node.js / Python (depending on service)
- **Framework**: Express.js / FastAPI
- **Database**: PostgreSQL 14+
- **Vector Database**: Pinecone / Weaviate / Chroma
- **Message Queue**: Redis / RabbitMQ
- **Caching**: Redis

### Storage & Processing
- **File Storage**: Local, AWS S3, Google Cloud Storage, Azure Blob
- **Document Processing**: PDF.js, Tesseract OCR, Pandoc
- **Embedding Models**: OpenAI text-embedding-ada-002, Sentence Transformers
- **Search**: Vector similarity search with hybrid keyword matching

### Infrastructure
- **Containerization**: Docker
- **Orchestration**: Kubernetes / Docker Compose
- **Monitoring**: Prometheus, Grafana
- **Logging**: ELK Stack (Elasticsearch, Logstash, Kibana)

## External Integrations

### Vector Database Integration

```mermaid
graph LR
    subgraph "RAG Service"
        EMBED[Embedding Generator]
        SEARCH[Search Engine]
    end
    
    subgraph "Vector Databases"
        PINECONE[Pinecone]
        WEAVIATE[Weaviate]
        CHROMA[Chroma]
    end
    
    subgraph "Embedding Providers"
        OPENAI_EMBED[OpenAI Embeddings]
        HUGGINGFACE[HuggingFace Models]
        COHERE[Cohere Embeddings]
    end
    
    EMBED --> OPENAI_EMBED
    EMBED --> HUGGINGFACE
    EMBED --> COHERE
    
    EMBED --> PINECONE
    EMBED --> WEAVIATE
    EMBED --> CHROMA
    
    SEARCH --> PINECONE
    SEARCH --> WEAVIATE
    SEARCH --> CHROMA
```

### Storage Provider Architecture

```mermaid
graph TB
    subgraph "Storage Abstraction Layer"
        STORAGE_MGR[Storage Manager]
        STORAGE_FACTORY[Storage Factory]
    end
    
    subgraph "Storage Providers"
        LOCAL[Local File System]
        S3[AWS S3]
        GCS[Google Cloud Storage]
        AZURE[Azure Blob Storage]
    end
    
    STORAGE_MGR --> STORAGE_FACTORY
    STORAGE_FACTORY --> LOCAL
    STORAGE_FACTORY --> S3
    STORAGE_FACTORY --> GCS
    STORAGE_FACTORY --> AZURE
```

## Performance & Scalability Considerations

### Horizontal Scaling
- **Stateless Services**: All services are designed to be stateless for easy horizontal scaling
- **Database Sharding**: Project-based sharding strategy for large-scale deployments
- **Vector Database Partitioning**: Collection-based partitioning for vector storage
- **CDN Integration**: Static file serving through CDN for global distribution

### Caching Strategy
- **Application Cache**: Redis for frequently accessed metadata
- **Vector Cache**: In-memory caching of recent embedding results
- **Database Query Cache**: PostgreSQL query result caching
- **File Cache**: Local caching of frequently accessed files

### Performance Metrics
- **Document Processing**: Target 100ms per page for text extraction
- **Embedding Generation**: Batch processing for optimal throughput
- **Search Latency**: Sub-200ms response time for semantic search
- **File Upload**: Streaming upload for large files with progress tracking

## Security Architecture

### Data Protection
- **Encryption at Rest**: AES-256 encryption for stored files and database
- **Encryption in Transit**: TLS 1.3 for all service communications
- **API Security**: Rate limiting, request validation, and CORS protection
- **Access Control**: Role-based access control (RBAC) with project isolation

### Compliance
- **Data Privacy**: GDPR and CCPA compliance for document handling
- **Audit Logging**: Comprehensive audit trails for all operations
- **Data Retention**: Configurable retention policies for documents and embeddings
- **Backup & Recovery**: Automated backup with point-in-time recovery

## Deployment Architecture

### Container Strategy
```mermaid
graph TB
    subgraph "Kubernetes Cluster"
        subgraph "API Namespace"
            API_POD[API Service Pods]
            API_SVC_K8S[API Service]
        end
        
        subgraph "RAG Namespace"
            RAG_POD[RAG Service Pods]
            RAG_SVC_K8S[RAG Service]
        end
        
        subgraph "AI Namespace"
            AI_POD[AI Service Pods]
            AI_SVC_K8S[AI Service]
        end
        
        subgraph "Data Namespace"
            POSTGRES[PostgreSQL StatefulSet]
            REDIS[Redis Cluster]
        end
    end
    
    INGRESS[Ingress Controller] --> API_SVC_K8S
    INGRESS --> RAG_SVC_K8S
    INGRESS --> AI_SVC_K8S
    
    API_POD --> POSTGRES
    RAG_POD --> POSTGRES
    RAG_POD --> REDIS
```

## Monitoring & Observability

### Application Monitoring Stack

```mermaid
graph TB
    subgraph "Application Layer"
        API_SVC[API Service]
        RAG_SVC[RAG Service]
        AI_SVC[AI Service]
    end

    subgraph "Metrics Collection"
        PROMETHEUS[Prometheus<br/>Metrics Server]
        GRAFANA[Grafana<br/>Visualization]
        ALERTMANAGER[Alert Manager<br/>Notifications]
    end

    subgraph "Logging Stack"
        FILEBEAT[Filebeat<br/>Log Shipper]
        LOGSTASH[Logstash<br/>Log Processing]
        ELASTICSEARCH[Elasticsearch<br/>Log Storage]
        KIBANA[Kibana<br/>Log Analysis]
    end

    subgraph "Tracing"
        JAEGER[Jaeger<br/>Distributed Tracing]
        ZIPKIN[Zipkin<br/>Alternative Tracer]
    end

    API_SVC --> PROMETHEUS
    RAG_SVC --> PROMETHEUS
    AI_SVC --> PROMETHEUS

    PROMETHEUS --> GRAFANA
    PROMETHEUS --> ALERTMANAGER

    API_SVC --> FILEBEAT
    RAG_SVC --> FILEBEAT
    AI_SVC --> FILEBEAT

    FILEBEAT --> LOGSTASH
    LOGSTASH --> ELASTICSEARCH
    ELASTICSEARCH --> KIBANA

    API_SVC --> JAEGER
    RAG_SVC --> JAEGER
    AI_SVC --> JAEGER
```

### Key Performance Indicators (KPIs)

#### Service-Level Metrics
- **Request Latency**: P50, P95, P99 response times
- **Throughput**: Requests per second (RPS)
- **Error Rate**: 4xx and 5xx error percentages
- **Availability**: Service uptime percentage

#### RAG-Specific Metrics
- **Document Processing Time**: Average time per document/page
- **Embedding Generation Rate**: Embeddings per second
- **Search Latency**: Vector search response time
- **Index Size**: Number of vectors and storage usage
- **Chunk Quality**: Average confidence scores

#### Resource Utilization
- **CPU Usage**: Per service and container
- **Memory Usage**: Heap and non-heap memory
- **Disk I/O**: Read/write operations and latency
- **Network I/O**: Bandwidth utilization

### Health Check Implementation

```mermaid
sequenceDiagram
    participant LB as Load Balancer
    participant Service
    participant DB as Database
    participant Vector as Vector DB
    participant Storage

    LB->>Service: GET /health
    Service->>DB: Check Connection
    DB-->>Service: Connection OK
    Service->>Vector: Check Connection
    Vector-->>Service: Connection OK
    Service->>Storage: Check Access
    Storage-->>Service: Access OK
    Service-->>LB: 200 OK + Health Status

    Note over LB,Storage: Readiness Check
    LB->>Service: GET /ready
    Service->>Service: Check Service State
    Service-->>LB: 200 OK (Ready) or 503 (Not Ready)
```

## Disaster Recovery & Business Continuity

### Backup Strategy

```mermaid
graph TB
    subgraph "Data Sources"
        POSTGRES[PostgreSQL<br/>Metadata]
        VECTOR_DB[Vector Database<br/>Embeddings]
        FILE_STORAGE[File Storage<br/>Documents]
    end

    subgraph "Backup Systems"
        PG_BACKUP[PostgreSQL Backup<br/>WAL-E/pgBackRest]
        VECTOR_BACKUP[Vector DB Backup<br/>Snapshots]
        STORAGE_BACKUP[Storage Backup<br/>Cross-Region Replication]
    end

    subgraph "Backup Storage"
        S3_BACKUP[AWS S3<br/>Backup Bucket]
        GCS_BACKUP[Google Cloud Storage<br/>Backup Bucket]
        TAPE_BACKUP[Tape Storage<br/>Long-term Archive]
    end

    POSTGRES --> PG_BACKUP
    VECTOR_DB --> VECTOR_BACKUP
    FILE_STORAGE --> STORAGE_BACKUP

    PG_BACKUP --> S3_BACKUP
    VECTOR_BACKUP --> GCS_BACKUP
    STORAGE_BACKUP --> TAPE_BACKUP
```

### Multi-Region Deployment

```mermaid
graph TB
    subgraph "Primary Region (US-East)"
        PRIMARY_LB[Load Balancer]
        PRIMARY_SERVICES[Service Cluster]
        PRIMARY_DB[Primary Database]
        PRIMARY_VECTOR[Primary Vector DB]
    end

    subgraph "Secondary Region (EU-West)"
        SECONDARY_LB[Load Balancer]
        SECONDARY_SERVICES[Service Cluster]
        SECONDARY_DB[Read Replica]
        SECONDARY_VECTOR[Vector DB Replica]
    end

    subgraph "Global DNS"
        ROUTE53[Route 53<br/>Health-based Routing]
    end

    ROUTE53 --> PRIMARY_LB
    ROUTE53 --> SECONDARY_LB

    PRIMARY_DB -.->|Replication| SECONDARY_DB
    PRIMARY_VECTOR -.->|Sync| SECONDARY_VECTOR
```

This architecture provides a robust, scalable foundation for RAG operations with comprehensive monitoring, disaster recovery capabilities, and flexible deployment options across multiple regions.
