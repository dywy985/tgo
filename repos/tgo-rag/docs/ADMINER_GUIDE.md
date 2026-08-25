# Adminer Database Administration Guide

This guide explains how to use Adminer, the web-based database administration tool included with the TGO RAG Service development environment.

## 🌐 Accessing Adminer

Adminer is automatically available when you run the RAG service with Docker Compose:

```bash
# Start all services including Adminer
docker-compose up -d

# Or start just Adminer (requires PostgreSQL to be running)
docker-compose up -d adminer
```

**Access URL**: [http://localhost:8080](http://localhost:8080)

## 🔐 Database Connection

When you open Adminer, use these connection details:

| Field    | Value        | Description                    |
|----------|--------------|--------------------------------|
| System   | PostgreSQL   | Database type                  |
| Server   | postgres     | Docker service name            |
| Username | rag_user     | Database username              |
| Password | rag_password | Database password              |
| Database | rag_service  | Database name                  |

## 📊 Database Schema Overview

The RAG service uses the following main tables:

### Core Tables

- **`rag_projects`** - Project information and API keys
- **`rag_collections`** - Document collections for organizing content
- **`rag_files`** - Uploaded files metadata
- **`rag_file_documents`** - Processed document chunks with embeddings

### System Tables

- **`alembic_version`** - Database migration version tracking

## 🔍 Useful SQL Queries

### Project Management

```sql
-- View all projects
SELECT id, name, api_key, created_at, updated_at 
FROM rag_projects 
ORDER BY created_at DESC;

-- Find development project
SELECT * FROM rag_projects WHERE api_key = 'dev';

-- Count projects by status
SELECT 
    CASE WHEN deleted_at IS NULL THEN 'Active' ELSE 'Deleted' END as status,
    COUNT(*) as count
FROM rag_projects 
GROUP BY (deleted_at IS NULL);
```

### Collections Analysis

```sql
-- View all collections with file counts
SELECT 
    c.id,
    c.display_name,
    c.description,
    COUNT(f.id) as file_count,
    c.created_at
FROM rag_collections c
LEFT JOIN rag_files f ON c.id = f.collection_id
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.display_name, c.description, c.created_at
ORDER BY c.created_at DESC;

-- Collections by project
SELECT 
    p.name as project_name,
    COUNT(c.id) as collection_count
FROM rag_projects p
LEFT JOIN rag_collections c ON p.id = c.project_id AND c.deleted_at IS NULL
GROUP BY p.id, p.name;
```

### File and Document Analysis

```sql
-- File upload statistics
SELECT 
    content_type,
    COUNT(*) as file_count,
    AVG(file_size) as avg_size,
    SUM(file_size) as total_size
FROM rag_files 
WHERE deleted_at IS NULL
GROUP BY content_type
ORDER BY file_count DESC;

-- Document processing status
SELECT 
    status,
    COUNT(*) as count
FROM rag_files
GROUP BY status;

-- Document chunks by content type
SELECT 
    content_type,
    COUNT(*) as chunk_count,
    AVG(content_length) as avg_length,
    SUM(token_count) as total_tokens
FROM rag_file_documents
GROUP BY content_type
ORDER BY chunk_count DESC;
```

### Recent Activity

```sql
-- Recent file uploads
SELECT 
    original_filename,
    content_type,
    file_size,
    status,
    created_at
FROM rag_files
ORDER BY created_at DESC
LIMIT 10;

-- Recent document processing
SELECT 
    fd.document_title,
    fd.content_type,
    fd.chunk_index,
    fd.token_count,
    fd.created_at
FROM rag_file_documents fd
ORDER BY fd.created_at DESC
LIMIT 10;
```

## ⚙️ Adminer Features

### Data Browsing
- **Table View**: Click on any table name to browse its data
- **Pagination**: Navigate through large datasets with built-in pagination
- **Sorting**: Click column headers to sort data
- **Filtering**: Use the search functionality to filter results

### Query Execution
- **SQL Command**: Use the "SQL command" tab to execute custom queries
- **Query History**: Adminer remembers your recent queries
- **Export Results**: Export query results in various formats

### Data Export
- **Full Tables**: Export entire tables in CSV, SQL, or other formats
- **Custom Queries**: Export results of custom queries
- **Structure Only**: Export just the table structure without data

### Schema Management
- **Table Structure**: View column definitions, indexes, and constraints
- **Relationships**: Visualize foreign key relationships
- **Indexes**: View and analyze database indexes

## 🛠️ Development Tips

### Debugging API Issues
1. Check `rag_projects` table to verify API keys
2. Look at `rag_files` table to see upload status
3. Examine `rag_file_documents` for processing results

### Performance Analysis
1. Use `EXPLAIN ANALYZE` with your queries to check performance
2. Monitor token counts in `rag_file_documents`
3. Check file sizes and processing times

### Data Cleanup
1. Find orphaned records with LEFT JOIN queries
2. Check for soft-deleted records (`deleted_at IS NOT NULL`)
3. Monitor disk usage with file size aggregations

## 🔒 Security Notes

- Adminer is configured for **development use only**
- The interface is accessible without additional authentication
- **Never expose Adminer in production environments**
- Database credentials are visible in the connection form

## 🐳 Docker Configuration

The Adminer service is configured in `docker-compose.yml`:

```yaml
adminer:
  image: adminer:latest
  container_name: rag-adminer
  ports:
    - "8080:8080"
  environment:
    - ADMINER_DEFAULT_SERVER=postgres
    - ADMINER_DESIGN=pepa-linha-dark
    - ADMINER_PLUGINS=tables-filter tinymce
  depends_on:
    postgres:
      condition: service_healthy
  networks:
    - rag-network
```

### Configuration Options
- **Dark Theme**: `pepa-linha-dark` for better visibility
- **Default Server**: Pre-configured to connect to PostgreSQL
- **Plugins**: Enhanced filtering and editing capabilities

## 🚀 Quick Start

1. **Start Services**:
   ```bash
   docker-compose up -d
   ```

2. **Open Adminer**: Navigate to [http://localhost:8080](http://localhost:8080)

3. **Login**: Use the connection details provided above

4. **Explore**: Start with the `rag_projects` table to see your development project

5. **Query**: Try the sample queries provided in this guide

## 📞 Troubleshooting

### Adminer Won't Load
- Check if the container is running: `docker-compose ps`
- Verify port 8080 is not in use by another service
- Check Docker logs: `docker-compose logs adminer`

### Can't Connect to Database
- Ensure PostgreSQL service is healthy: `docker-compose ps`
- Verify connection details match the configuration
- Check network connectivity between containers

### Performance Issues
- Large result sets may load slowly
- Use LIMIT clauses for better performance
- Consider using the export feature for large datasets

---

**Happy Database Administration!** 🗄️✨
