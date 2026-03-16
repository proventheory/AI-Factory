-- Seed initial failure signatures (boot migration, env, runtime healthcheck).

INSERT INTO public.failure_signatures (signature_key, phase, class, subclass, pattern, description) VALUES
  (
    'boot_failed.migration.duplicate_policy',
    'migrate',
    'migration',
    'duplicate_policy',
    '{"regex": ["policy .* already exists", "duplicate_object", "42710"]}'::jsonb,
    'Migration tries to create a policy that already exists; non-idempotent DDL.'
  ),
  (
    'boot_failed.migration.missing_relation',
    'migrate',
    'migration',
    'missing_relation',
    '{"regex": ["relation .* does not exist", "42P01"]}'::jsonb,
    'Migration references a table/relation that does not exist yet; ordering or dependency issue.'
  ),
  (
    'boot_failed.env.missing_secret',
    'boot',
    'config',
    'missing_secret',
    '{"regex": ["missing env", "undefined secret", "auth startup config null"]}'::jsonb,
    'Required env/secret missing at startup.'
  ),
  (
    'runtime_failed.healthcheck_timeout',
    'healthcheck',
    'runtime',
    'healthcheck_timeout',
    '{"regex": ["healthcheck", "timeout", "unhealthy"]}'::jsonb,
    'Service failed health check or timed out.'
  )
ON CONFLICT (signature_key) DO NOTHING;
