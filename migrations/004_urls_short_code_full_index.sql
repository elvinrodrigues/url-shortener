-- 004: add full index on urls(short_code).
--
-- idx_urls_short_code is partial (WHERE is_active = true), so queries that
-- must also see inactive rows cannot use it.
--
-- Do NOT drop or alter idx_urls_short_code — it is the covering index for the
-- redirect hot path.

CREATE INDEX IF NOT EXISTS idx_urls_short_code_all ON urls (short_code);
