CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
  email text NOT NULL UNIQUE, name text NOT NULL, password_salt text NOT NULL, password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('employee','hr','admin')), is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
  title text NOT NULL, document_type text NOT NULL, audience_scope text NOT NULL DEFAULT 'all',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','processing','published','archived','failed')),
  version_label text NOT NULL DEFAULT '1.0', effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date, source_filename text NOT NULL, sha256 text NOT NULL, mime_type text NOT NULL,
  byte_size integer NOT NULL, content text NOT NULL, created_by uuid REFERENCES users(id), published_by uuid REFERENCES users(id),
  published_at timestamptz, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, sha256)
);
CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id), chunk_index integer NOT NULL, content text NOT NULL,
  token_count integer NOT NULL, embedding vector(1536), embedding_model text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, chunk_index)
);
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding_model text;
CREATE INDEX IF NOT EXISTS chunks_document_idx ON document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id), title text NOT NULL DEFAULT 'New conversation',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')), content text NOT NULL,
  answer_status text CHECK (answer_status IN ('grounded','abstained','demo')), model text,
  input_tokens integer, output_tokens integer, cost_estimate_usd numeric(12,8), latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS message_citations (
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  chunk_id uuid NOT NULL REFERENCES document_chunks(id), display_order integer NOT NULL,
  PRIMARY KEY(message_id, chunk_id)
);
CREATE TABLE IF NOT EXISTS checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id), title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','complete')),
  items jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hr_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  organization_id uuid NOT NULL REFERENCES organizations(id), category text NOT NULL,
  subject text NOT NULL, description text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','in_review','waiting_on_employee','resolved','closed')),
  submitted_at timestamptz, resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS requests_org_status_idx ON hr_requests(organization_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS requests_user_idx ON hr_requests(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES hr_requests(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES users(id), from_status text, to_status text NOT NULL,
  note text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id uuid REFERENCES users(id),
  organization_id uuid REFERENCES organizations(id), action text NOT NULL, entity_type text NOT NULL,
  entity_id uuid, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id), rating text NOT NULL CHECK(rating IN ('helpful','not_helpful')),
  category text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(message_id,user_id)
);
