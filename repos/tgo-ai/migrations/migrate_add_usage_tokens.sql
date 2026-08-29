-- 幂等迁移: ai_agent_usage_records 增加 token 消耗字段 + 聚合唯一约束
-- 用法: psql -U tgo -d tgo -f migrate_add_usage_tokens.sql
-- 幂等: 列/约束已存在则跳过, 可重复执行

DO $$
BEGIN
    -- 1) token 列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='ai_agent_usage_records' AND column_name='prompt_tokens') THEN
        ALTER TABLE ai_agent_usage_records ADD COLUMN prompt_tokens INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE ai_agent_usage_records ADD COLUMN completion_tokens INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE ai_agent_usage_records ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0;
        RAISE NOTICE 'Added token columns';
    ELSE
        RAISE NOTICE 'Token columns already exist, skip';
    END IF;

    -- 2) 唯一约束: (project_id, agent_id, period_start, aggregation_type) 支持 upsert 聚合
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname='ai_agent_usage_records_project_agent_period_key') THEN
        ALTER TABLE ai_agent_usage_records
            ADD CONSTRAINT ai_agent_usage_records_project_agent_period_key
            UNIQUE (project_id, agent_id, period_start, aggregation_type);
        RAISE NOTICE 'Added unique constraint';
    ELSE
        RAISE NOTICE 'Unique constraint already exists, skip';
    END IF;
END $$;
