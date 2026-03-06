-- runs.llm_source: 'gateway' = use LLM_GATEWAY_URL; 'openai_direct' = use OPENAI_API_KEY on runner (no gateway).
-- Lets Console user choose per run (Start run dialog) or default to gateway when available.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS llm_source text DEFAULT 'gateway'
  CHECK (llm_source IS NULL OR llm_source IN ('gateway', 'openai_direct'));

COMMENT ON COLUMN runs.llm_source IS 'gateway = call LLM via LLM_GATEWAY_URL; openai_direct = call OpenAI directly with OPENAI_API_KEY';
