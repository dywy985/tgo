# TGO-Tech RAG Service Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying and operating the TGO-Tech RAG Service in various environments, from local development to production-scale deployments.

## Environment Setup

### Local Development Environment

```mermaid
graph TB
    subgraph "Development Setup"
        DEV_ENV[Development Environment]
        DOCKER_COMPOSE[Docker Compose<br/>docker-compose.dev.yml]
        LOCAL_DB[PostgreSQL Container<br/>Port: 5432]
        LOCAL_REDIS[Redis Container<br/>Port: 6379]
        LOCAL_VECTOR[Weaviate Container<br/>Port: 8080]
    end
    
    subgraph "Services"
        RAG_DEV[RAG Service<br/>Port: 8082<br/>Hot Reload]
        API_DEV[API Service<br/>Port: 8081<br/>Hot Reload]
        AI_DEV[AI Service<br/>Port: 8083<br/>Hot Reload]
    end
    
    subgraph "Development Tools"
        DEBUGGER[VS Code Debugger]
        LOGS[Centralized Logging]
        METRICS[Development Metrics]
    end
    
    DOCKER_COMPOSE --> LOCAL_DB
    DOCKER_COMPOSE --> LOCAL_REDIS
    DOCKER_COMPOSE --> LOCAL_VECTOR
    
    DEV_ENV --> RAG_DEV
    DEV_ENV --> API_DEV
    DEV_ENV --> AI_DEV
    
    RAG_DEV --> DEBUGGER
    API_DEV --> LOGS
    AI_DEV --> METRICS
```

#### Docker Compose Configuration

```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: rag_service_dev
      POSTGRES_USER: rag_user
      POSTGRES_PASSWORD: dev_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docs/rag_service_schema.sql:/docker-entrypoint-initdb.d/init.sql

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes

  weaviate:
    image: semitechnologies/weaviate:latest
    ports:
      - "8080:8080"
    environment:
      QUERY_DEFAULTS_LIMIT: 25
      AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED: 'true'
      PERSISTENCE_DATA_PATH: '/var/lib/weaviate'
    volumes:
      - weaviate_data:/var/lib/weaviate

volumes:
  postgres_data:
  weaviate_data:
```

### Staging Environment

```mermaid
graph TB
    subgraph "Staging Infrastructure"
        STAGING_LB[Load Balancer<br/>HAProxy/NGINX]
        STAGING_CLUSTER[Kubernetes Cluster<br/>3 Nodes]
    end
    
    subgraph "Application Tier"
        RAG_STAGING[RAG Service<br/>2 Replicas]
        API_STAGING[API Service<br/>2 Replicas]
        AI_STAGING[AI Service<br/>2 Replicas]
    end
    
    subgraph "Data Tier"
        POSTGRES_STAGING[PostgreSQL<br/>Primary + Replica]
        REDIS_STAGING[Redis Cluster<br/>3 Nodes]
        VECTOR_STAGING[Vector DB<br/>Managed Service]
    end
    
    subgraph "Monitoring"
        PROMETHEUS[Prometheus]
        GRAFANA[Grafana]
        ALERTMANAGER[AlertManager]
    end
    
    STAGING_LB --> STAGING_CLUSTER
    STAGING_CLUSTER --> RAG_STAGING
    STAGING_CLUSTER --> API_STAGING
    STAGING_CLUSTER --> AI_STAGING
    
    RAG_STAGING --> POSTGRES_STAGING
    RAG_STAGING --> REDIS_STAGING
    RAG_STAGING --> VECTOR_STAGING
    
    STAGING_CLUSTER --> PROMETHEUS
    PROMETHEUS --> GRAFANA
    PROMETHEUS --> ALERTMANAGER
```

### Production Environment

```mermaid
graph TB
    subgraph "Production Infrastructure"
        CDN[CloudFlare CDN]
        WAF[Web Application Firewall]
        PROD_LB[Production Load Balancer<br/>Multi-AZ]
    end
    
    subgraph "Kubernetes Production"
        MASTER_NODES[Master Nodes<br/>3 Replicas]
        WORKER_NODES[Worker Nodes<br/>6+ Replicas]
        INGRESS[Ingress Controller<br/>NGINX/Istio]
    end
    
    subgraph "Application Services"
        RAG_PROD[RAG Service<br/>5+ Replicas<br/>HPA Enabled]
        API_PROD[API Service<br/>3+ Replicas<br/>HPA Enabled]
        AI_PROD[AI Service<br/>3+ Replicas<br/>HPA Enabled]
    end
    
    subgraph "Data Layer"
        RDS[Amazon RDS<br/>Multi-AZ PostgreSQL]
        ELASTICACHE[ElastiCache<br/>Redis Cluster]
        PINECONE[Pinecone<br/>Managed Vector DB]
    end
    
    subgraph "Storage"
        S3[Amazon S3<br/>Multi-Region]
        EFS[Amazon EFS<br/>Shared Storage]
    end
    
    CDN --> WAF
    WAF --> PROD_LB
    PROD_LB --> INGRESS
    
    INGRESS --> RAG_PROD
    INGRESS --> API_PROD
    INGRESS --> AI_PROD
    
    RAG_PROD --> RDS
    RAG_PROD --> ELASTICACHE
    RAG_PROD --> PINECONE
    RAG_PROD --> S3
```

## Kubernetes Deployment

### Namespace Configuration

```yaml
# k8s/namespaces.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: rag-service
  labels:
    name: rag-service
    environment: production
---
apiVersion: v1
kind: Namespace
metadata:
  name: rag-monitoring
  labels:
    name: rag-monitoring
    environment: production
```

### RAG Service Deployment

```yaml
# k8s/rag-service-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rag-service
  namespace: rag-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: rag-service
  template:
    metadata:
      labels:
        app: rag-service
    spec:
      containers:
      - name: rag-service
        image: tgo-tech/rag-service:latest
        ports:
        - containerPort: 8082
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: rag-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: rag-secrets
              key: redis-url
        - name: VECTOR_DB_URL
          valueFrom:
            secretKeyRef:
              name: rag-secrets
              key: vector-db-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8082
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8082
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Service and Ingress Configuration

```yaml
# k8s/rag-service-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: rag-service
  namespace: rag-service
spec:
  selector:
    app: rag-service
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8082
  type: ClusterIP
---
# k8s/rag-service-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: rag-service-ingress
  namespace: rag-service
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - rag.tgo-tech.com
    secretName: rag-tls-secret
  rules:
  - host: rag.tgo-tech.com
    http:
      paths:
      - path: /v1
        pathType: Prefix
        backend:
          service:
            name: rag-service
            port:
              number: 80
```

## Configuration Management

### Environment Variables

```bash
# Production Environment Variables
DATABASE_URL=postgresql://user:pass@rds-endpoint:5432/rag_prod
REDIS_URL=redis://elasticache-endpoint:6379
VECTOR_DB_URL=https://pinecone-index.pinecone.io
OPENAI_API_KEY=sk-...
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
S3_BUCKET=tgo-rag-documents-prod

# Service Configuration
PORT=8082
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGIN=https://app.tgo-tech.com

# Processing Configuration
MAX_FILE_SIZE=100MB
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
EMBEDDING_MODEL=text-embedding-ada-002
BATCH_SIZE=50

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX_REQUESTS=100

# Monitoring
METRICS_ENABLED=true
TRACING_ENABLED=true
JAEGER_ENDPOINT=http://jaeger-collector:14268/api/traces
```

### ConfigMap Configuration

```yaml
# k8s/rag-configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: rag-config
  namespace: rag-service
data:
  app.yaml: |
    server:
      port: 8082
      cors:
        origin: "https://app.tgo-tech.com"
        credentials: true
    
    processing:
      maxFileSize: "100MB"
      chunkSize: 1000
      chunkOverlap: 200
      batchSize: 50
      supportedFormats:
        - "application/pdf"
        - "application/msword"
        - "text/plain"
        - "text/markdown"
    
    embedding:
      model: "text-embedding-ada-002"
      dimensions: 1536
      batchSize: 100
    
    search:
      defaultLimit: 20
      maxLimit: 100
      minScore: 0.0
    
    monitoring:
      metrics: true
      tracing: true
      healthCheck:
        interval: 30
        timeout: 5
```

## Monitoring and Observability

### Prometheus Configuration

```yaml
# monitoring/prometheus-config.yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "rag-service-rules.yml"

scrape_configs:
  - job_name: 'rag-service'
    static_configs:
      - targets: ['rag-service:8082']
    metrics_path: '/metrics'
    scrape_interval: 10s

  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
        namespaces:
          names:
            - rag-service
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
```

### Grafana Dashboard Configuration

```json
{
  "dashboard": {
    "title": "RAG Service Metrics",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{service=\"rag-service\"}[5m])",
            "legendFormat": "{{method}} {{endpoint}}"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{service=\"rag-service\"}[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      },
      {
        "title": "Document Processing Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(documents_processed_total[5m])",
            "legendFormat": "Documents/sec"
          }
        ]
      },
      {
        "title": "Vector Database Operations",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(vector_db_operations_total[5m])",
            "legendFormat": "{{operation}}"
          }
        ]
      }
    ]
  }
}
```

## Scaling and Performance

### Horizontal Pod Autoscaler

```yaml
# k8s/rag-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: rag-service-hpa
  namespace: rag-service
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: rag-service
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "100"
```

### Performance Optimization

```mermaid
graph TB
    subgraph "Application Optimization"
        CONNECTION_POOL[Database Connection Pooling<br/>Max: 20 connections]
        CACHING[Multi-Level Caching<br/>L1: Memory, L2: Redis]
        BATCH_PROCESSING[Batch Processing<br/>Embeddings & DB Operations]
    end
    
    subgraph "Infrastructure Optimization"
        CDN_CACHE[CDN Caching<br/>Static Assets]
        LOAD_BALANCING[Load Balancing<br/>Round Robin + Health Checks]
        AUTO_SCALING[Auto Scaling<br/>CPU/Memory/Custom Metrics]
    end
    
    subgraph "Database Optimization"
        READ_REPLICAS[Read Replicas<br/>Query Distribution]
        INDEXING[Optimized Indexing<br/>Query Performance]
        PARTITIONING[Table Partitioning<br/>Large Datasets]
    end
    
    CONNECTION_POOL --> CACHING
    CACHING --> BATCH_PROCESSING
    
    CDN_CACHE --> LOAD_BALANCING
    LOAD_BALANCING --> AUTO_SCALING
    
    READ_REPLICAS --> INDEXING
    INDEXING --> PARTITIONING
```

This deployment guide provides a comprehensive foundation for running the RAG service reliably at scale, with proper monitoring, security, and performance optimization.
