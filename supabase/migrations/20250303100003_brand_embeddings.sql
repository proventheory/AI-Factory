-- Brand embeddings table for DBs that have brand_profiles but not brand_embeddings
-- (e.g. only console_required_tables was run). Idempotent: safe if 20250303000007 already ran.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS brand_embeddings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_profile_id uuid NOT NULL REFERENCES brand_profiles(id) ON DELETE CASCADE,
  embedding_type   text NOT NULL CHECK (embedding_type IN (
    'brand_description', 'copy_example', 'visual_guidelines', 'sample_ad', 'sample_email',
    'tone_description', 'style_guide_excerpt', 'mission_statement', 'tagline_variant', 'competitor_diff'
  )),
  content          text NOT NULL,
  embedding        vector(1536),
  metadata         jsonb DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_embeddings_brand_profile_id ON brand_embeddings (brand_profile_id);
CREATE INDEX IF NOT EXISTS idx_brand_embeddings_embedding_type ON brand_embeddings (embedding_type);
CREATE INDEX IF NOT EXISTS idx_brand_embeddings_created_at ON brand_embeddings (created_at DESC);

-- IVFFlat index for similarity search (optional; requires rows for lists > 1 in some pgvector versions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_brand_embeddings_embedding_ivfflat'
  ) THEN
    CREATE INDEX idx_brand_embeddings_embedding_ivfflat ON brand_embeddings
      USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- skip if extension or vector type not available / index creation fails
END $$;

ALTER TABLE brand_embeddings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "brand_embeddings_select" ON brand_embeddings FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE POLICY "brand_embeddings_insert" ON brand_embeddings FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  CREATE POLICY "brand_embeddings_delete" ON brand_embeddings FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE brand_embeddings IS 'Vector embeddings of brand content for semantic similarity search';
COMMENT ON COLUMN brand_embeddings.brand_profile_id IS 'FK to brand_profiles owning this embedding';
COMMENT ON COLUMN brand_embeddings.embedding_type IS 'Classification of the embedded content';
COMMENT ON COLUMN brand_embeddings.content IS 'Original text content that was embedded';
COMMENT ON COLUMN brand_embeddings.embedding IS 'Vector(1536) embedding from text-embedding-3-small';

CREATE OR REPLACE FUNCTION match_brand_embeddings(
  query_embedding vector(1536),
  match_brand_id uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
) RETURNS TABLE (
  id uuid,
  content text,
  embedding_type text,
  similarity float
) AS $$
  SELECT
    be.id,
    be.content,
    be.embedding_type,
    1 - (be.embedding <=> query_embedding) AS similarity
  FROM brand_embeddings be
  WHERE be.brand_profile_id = match_brand_id
    AND be.embedding IS NOT NULL
    AND 1 - (be.embedding <=> query_embedding) > match_threshold
  ORDER BY be.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION match_brand_embeddings IS 'Returns brand embeddings for a given brand profile ordered by cosine similarity to the query embedding';

COMMIT;
