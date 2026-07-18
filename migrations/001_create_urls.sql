CREATE TABLE IF NOT EXISTS urls(
    id BIGSERIAL PRIMARY KEY,
    short_code VARCHAR(30) NOT NULL,
    long_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    click_count BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    user_id BIGINT,
    CONSTRAINT urls_long_url_not_empty CHECK (long_url != '')
);

CREATE UNIQUE INDEX idx_urls_short_code
    ON urls(short_code)
    INCLUDE (long_url, expires_at, is_active)
    WHERE is_active = true;

CREATE INDEX idx_urls_user_created
    ON urls(user_id, created_at DESC)
    WHERE is_active = true;

CREATE INDEX idx_urls_expires_at
    ON urls(expires_at)
    WHERE expires_at IS NOT NULL AND is_active = true;