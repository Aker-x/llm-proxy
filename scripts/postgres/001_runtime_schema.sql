CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    balance_usd NUMERIC(18, 6) NOT NULL DEFAULT 0,
    total_recharged_usd NUMERIC(18, 6) NOT NULL DEFAULT 0,
    total_spent_usd NUMERIC(18, 6) NOT NULL DEFAULT 0,
    last_recharged_at TIMESTAMPTZ,
    upstream_rate_limit_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    upstream_rate_limit_requests_per_minute INTEGER NOT NULL DEFAULT 60,
    upstream_rate_limit_interval_seconds INTEGER NOT NULL DEFAULT 60,
    upstream_rate_limit_last_request_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'subscription_status'
    ) THEN
        EXECUTE '
            ALTER TABLE users
            ADD COLUMN subscription_status TEXT NOT NULL DEFAULT ''inactive''
        ';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'upstream_rate_limit_requests_per_minute'
    ) THEN
        EXECUTE '
            ALTER TABLE users
            ADD COLUMN upstream_rate_limit_requests_per_minute INTEGER NOT NULL DEFAULT 60
        ';
    END IF;
END $$;

UPDATE users
SET upstream_rate_limit_requests_per_minute = GREATEST(
    1,
    CEIL(60.0 / GREATEST(upstream_rate_limit_interval_seconds, 1))
) 
WHERE upstream_rate_limit_requests_per_minute IS DISTINCT FROM GREATEST(
    1,
    CEIL(60.0 / GREATEST(upstream_rate_limit_interval_seconds, 1))
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'subscription_plan_id'
    ) THEN
        EXECUTE '
            ALTER TABLE users
            ADD COLUMN subscription_plan_id TEXT
        ';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'subscription_started_at'
    ) THEN
        EXECUTE '
            ALTER TABLE users
            ADD COLUMN subscription_started_at TIMESTAMPTZ
        ';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'subscription_expires_at'
    ) THEN
        EXECUTE '
            ALTER TABLE users
            ADD COLUMN subscription_expires_at TIMESTAMPTZ
        ';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'upstream_rate_limit_enabled'
    ) THEN
        EXECUTE '
            ALTER TABLE users
            ADD COLUMN upstream_rate_limit_enabled BOOLEAN NOT NULL DEFAULT FALSE
        ';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'upstream_rate_limit_interval_seconds'
    ) THEN
        EXECUTE '
            ALTER TABLE users
            ADD COLUMN upstream_rate_limit_interval_seconds INTEGER NOT NULL DEFAULT 60
        ';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'upstream_rate_limit_last_request_at'
    ) THEN
        EXECUTE '
            ALTER TABLE users
            ADD COLUMN upstream_rate_limit_last_request_at TIMESTAMPTZ
        ';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS upstream_rate_limit_settings (
    id TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    requests_per_minute INTEGER NOT NULL DEFAULT 60,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'upstream_rate_limit_settings'
          AND column_name = 'requests_per_minute'
    ) THEN
        EXECUTE 'ALTER TABLE upstream_rate_limit_settings ADD COLUMN requests_per_minute INTEGER NOT NULL DEFAULT 60';
    END IF;
END $$;

INSERT INTO upstream_rate_limit_settings (id, enabled, requests_per_minute, updated_at)
VALUES ('default', FALSE, 60, NOW())
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS subscription_settings (
    id TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    quota_consumption_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    monthly_price_cny NUMERIC(18, 2) NOT NULL DEFAULT 500,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subscription_settings'
          AND column_name = 'quota_consumption_enabled'
    ) THEN
        EXECUTE 'ALTER TABLE subscription_settings ADD COLUMN quota_consumption_enabled BOOLEAN NOT NULL DEFAULT TRUE';
    END IF;
END $$;

INSERT INTO subscription_settings (id, enabled, quota_consumption_enabled, monthly_price_cny, updated_at)
VALUES ('default', TRUE, TRUE, 500, NOW())
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    monthly_price_cny NUMERIC(18, 2) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_orders (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    plan_id TEXT REFERENCES subscription_plans(id) ON DELETE SET NULL,
    status TEXT NOT NULL,
    months INTEGER NOT NULL DEFAULT 1,
    amount_cny NUMERIC(18, 2) NOT NULL,
    snapshot_monthly_price_cny NUMERIC(18, 2) NOT NULL,
    snapshot_plan_name TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL,
    customer_note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    reviewed_by TEXT NOT NULL,
    reviewed_at TIMESTAMPTZ,
    review_note TEXT NOT NULL,
    failure_reason TEXT NOT NULL,
    approved_started_at TIMESTAMPTZ,
    approved_expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_subscription_orders_username
    ON subscription_orders(username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscription_orders_status
    ON subscription_orders(status, created_at DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subscription_orders'
          AND column_name = 'plan_id'
    ) THEN
        EXECUTE '
            ALTER TABLE subscription_orders
            ADD COLUMN plan_id TEXT
        ';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subscription_orders'
          AND column_name = 'snapshot_plan_name'
    ) THEN
        EXECUTE '
            ALTER TABLE subscription_orders
            ADD COLUMN snapshot_plan_name TEXT NOT NULL DEFAULT ''''
        ';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS admins (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_settings (
    id TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL,
    mode TEXT NOT NULL,
    qr_image_path TEXT NOT NULL,
    app_id TEXT NOT NULL,
    private_key TEXT NOT NULL,
    private_key_path TEXT NOT NULL,
    alipay_public_key TEXT NOT NULL,
    alipay_public_key_path TEXT NOT NULL,
    gateway TEXT NOT NULL,
    public_base_url TEXT NOT NULL,
    key_type TEXT NOT NULL,
    min_recharge_usd NUMERIC(18, 6) NOT NULL,
    min_recharge_cny NUMERIC(18, 6) NOT NULL DEFAULT 10,
    cny_per_usd NUMERIC(18, 6) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_settings'
          AND column_name = 'min_recharge_cny'
    ) THEN
        ALTER TABLE payment_settings
            ADD COLUMN min_recharge_cny NUMERIC(18, 6);

        UPDATE payment_settings
        SET min_recharge_cny = GREATEST(10, min_recharge_usd * cny_per_usd);

        ALTER TABLE payment_settings
            ALTER COLUMN min_recharge_cny SET DEFAULT 10,
            ALTER COLUMN min_recharge_cny SET NOT NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS user_api_keys (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    name TEXT NOT NULL,
    api_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_username
    ON user_api_keys(username);

CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    api_base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    upstream_model TEXT NOT NULL,
    upstream_api TEXT NOT NULL,
    pricing_currency TEXT NOT NULL DEFAULT 'USD',
    input_per_million_tokens NUMERIC(18, 6) NOT NULL DEFAULT 0,
    output_per_million_tokens NUMERIC(18, 6) NOT NULL DEFAULT 0,
    cached_input_per_million_tokens NUMERIC(18, 6) NOT NULL DEFAULT 0,
    cache_creation_per_million_tokens NUMERIC(18, 6) NOT NULL DEFAULT 0,
    image_per_unit NUMERIC(18, 6) NOT NULL DEFAULT 0,
    request_flat_fee NUMERIC(18, 6) NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    connectivity_status TEXT NOT NULL,
    connectivity_tested_at TIMESTAMPTZ,
    connectivity_message TEXT NOT NULL,
    connectivity_status_code INTEGER NOT NULL,
    connectivity_latency_ms INTEGER NOT NULL,
    price_multiplier NUMERIC(10, 4) NOT NULL DEFAULT 1.5
);
ALTER TABLE models
    ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE models
    ALTER COLUMN pricing_currency SET DEFAULT 'USD',
    ALTER COLUMN input_per_million_tokens SET DEFAULT 0,
    ALTER COLUMN output_per_million_tokens SET DEFAULT 0,
    ALTER COLUMN cached_input_per_million_tokens SET DEFAULT 0,
    ALTER COLUMN cache_creation_per_million_tokens SET DEFAULT 0,
    ALTER COLUMN image_per_unit SET DEFAULT 0,
    ALTER COLUMN request_flat_fee SET DEFAULT 0,
    ALTER COLUMN price_multiplier SET DEFAULT 1.5;
UPDATE models
SET price_multiplier = 1.5
WHERE COALESCE(price_multiplier, 1) <> 1.5;
CREATE UNIQUE INDEX IF NOT EXISTS uq_models_provider_upstream_api
    ON models(provider_id, upstream_api, upstream_model);

CREATE TABLE IF NOT EXISTS external_models (
    name TEXT PRIMARY KEY,
    strategy TEXT NOT NULL,
    pricing_currency TEXT NOT NULL DEFAULT 'USD',
    input_per_million_tokens NUMERIC(18, 6) NOT NULL DEFAULT 0,
    output_per_million_tokens NUMERIC(18, 6) NOT NULL DEFAULT 0,
    cached_input_per_million_tokens NUMERIC(18, 6) NOT NULL DEFAULT 0,
    cache_creation_per_million_tokens NUMERIC(18, 6) NOT NULL DEFAULT 0,
    thinking_per_million_tokens NUMERIC(18, 6) NOT NULL DEFAULT 0,
    image_per_unit NUMERIC(18, 6) NOT NULL DEFAULT 0,
    request_flat_fee NUMERIC(18, 6) NOT NULL DEFAULT 0,
    price_multiplier NUMERIC(10, 4) NOT NULL DEFAULT 1.5,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE external_models
    ADD COLUMN IF NOT EXISTS pricing_currency TEXT NOT NULL DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS input_per_million_tokens NUMERIC(18, 6) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS output_per_million_tokens NUMERIC(18, 6) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cached_input_per_million_tokens NUMERIC(18, 6) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cache_creation_per_million_tokens NUMERIC(18, 6) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS thinking_per_million_tokens NUMERIC(18, 6) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS image_per_unit NUMERIC(18, 6) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS request_flat_fee NUMERIC(18, 6) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS price_multiplier NUMERIC(10, 4) NOT NULL DEFAULT 1.5;
UPDATE external_models
SET price_multiplier = 1.5
WHERE COALESCE(price_multiplier, 1) <> 1.5;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'external_models'
          AND column_name = 'display_name'
    ) THEN
        EXECUTE '
            ALTER TABLE external_models
            DROP COLUMN display_name
        ';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'external_model_targets'
    ) THEN
        WITH target_pricing AS (
            SELECT
                t.external_model_name,
                MIN(COALESCE(m.pricing_currency, 'USD')) AS pricing_currency,
                AVG(COALESCE(m.input_per_million_tokens, 0)) AS input_per_million_tokens,
                AVG(COALESCE(m.output_per_million_tokens, 0)) AS output_per_million_tokens,
                AVG(COALESCE(m.cached_input_per_million_tokens, 0)) AS cached_input_per_million_tokens,
                AVG(COALESCE(m.cache_creation_per_million_tokens, 0)) AS cache_creation_per_million_tokens,
                AVG(COALESCE(m.output_per_million_tokens, 0)) AS thinking_per_million_tokens,
                AVG(COALESCE(m.image_per_unit, 0)) AS image_per_unit,
                AVG(COALESCE(m.request_flat_fee, 0)) AS request_flat_fee,
                MIN(COALESCE(m.price_multiplier, 1.5)) AS price_multiplier
            FROM external_model_targets t
            INNER JOIN models m
                ON m.id = t.model_id
            GROUP BY t.external_model_name
        )
        UPDATE external_models em
        SET
            pricing_currency = tp.pricing_currency,
            input_per_million_tokens = tp.input_per_million_tokens,
            output_per_million_tokens = tp.output_per_million_tokens,
            cached_input_per_million_tokens = tp.cached_input_per_million_tokens,
            cache_creation_per_million_tokens = tp.cache_creation_per_million_tokens,
            thinking_per_million_tokens = tp.thinking_per_million_tokens,
            image_per_unit = tp.image_per_unit,
            request_flat_fee = tp.request_flat_fee,
            price_multiplier = tp.price_multiplier
        FROM target_pricing tp
        WHERE em.name = tp.external_model_name
          AND COALESCE(em.input_per_million_tokens, 0) = 0
          AND COALESCE(em.output_per_million_tokens, 0) = 0
          AND COALESCE(em.cached_input_per_million_tokens, 0) = 0
          AND COALESCE(em.cache_creation_per_million_tokens, 0) = 0
          AND COALESCE(em.thinking_per_million_tokens, 0) = 0
          AND COALESCE(em.image_per_unit, 0) = 0
          AND COALESCE(em.request_flat_fee, 0) = 0
          AND COALESCE(em.price_multiplier, 1.5) = 1.5;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS subscription_plan_model_limits (
    plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    external_model_name TEXT NOT NULL REFERENCES external_models(name) ON DELETE CASCADE,
    daily_request_limit INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (plan_id, external_model_name)
);
CREATE INDEX IF NOT EXISTS idx_subscription_plan_model_limits_plan_id
    ON subscription_plan_model_limits(plan_id, external_model_name);

CREATE TABLE IF NOT EXISTS user_subscription_model_preferences (
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    external_model_name TEXT NOT NULL REFERENCES external_models(name) ON DELETE CASCADE,
    allow_balance_fallback BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (username, plan_id, external_model_name)
);
CREATE INDEX IF NOT EXISTS idx_user_subscription_model_preferences_username
    ON user_subscription_model_preferences(username, plan_id, external_model_name);

CREATE TABLE IF NOT EXISTS subscription_quota_counters (
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    external_model_name TEXT NOT NULL REFERENCES external_models(name) ON DELETE CASCADE,
    quota_date DATE NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    used_count INTEGER NOT NULL DEFAULT 0,
    inflight_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (username, plan_id, external_model_name, quota_date)
);

CREATE TABLE IF NOT EXISTS subscription_quota_reservations (
    request_id UUID PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    external_model_name TEXT NOT NULL REFERENCES external_models(name) ON DELETE CASCADE,
    quota_date DATE NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_subscription_quota_reservations_lookup
    ON subscription_quota_reservations(username, plan_id, external_model_name, quota_date, status);
CREATE INDEX IF NOT EXISTS idx_subscription_quota_reservations_stale
    ON subscription_quota_reservations(status, created_at);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'external_model_targets'
    ) THEN
        EXECUTE '
            CREATE TABLE external_model_targets (
                external_model_name TEXT NOT NULL REFERENCES external_models(name) ON DELETE CASCADE,
                model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
                priority INTEGER NOT NULL DEFAULT 100,
                weight INTEGER NOT NULL DEFAULT 1,
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (external_model_name, model_id)
            )
        ';
    ELSIF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'external_model_targets'
          AND column_name = 'route_id'
    ) THEN
        EXECUTE '
            CREATE TABLE external_model_targets_v2 (
                external_model_name TEXT NOT NULL REFERENCES external_models(name) ON DELETE CASCADE,
                model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
                priority INTEGER NOT NULL DEFAULT 100,
                weight INTEGER NOT NULL DEFAULT 1,
                enabled BOOLEAN NOT NULL DEFAULT TRUE,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (external_model_name, model_id)
            )
        ';

        EXECUTE '
            INSERT INTO external_model_targets_v2 (
                external_model_name,
                model_id,
                priority,
                weight,
                enabled,
                updated_at
            )
            SELECT
                t.external_model_name,
                r.model_id,
                MIN(COALESCE(t.priority, 100)) AS priority,
                MAX(COALESCE(t.weight, 1)) AS weight,
                BOOL_OR(COALESCE(t.enabled, TRUE)) AS enabled,
                MAX(COALESCE(t.updated_at, NOW())) AS updated_at
            FROM external_model_targets t
            INNER JOIN routes r
                ON r.id = t.route_id
            GROUP BY
                t.external_model_name,
                r.model_id
        ';

        EXECUTE 'DROP TABLE external_model_targets';
        EXECUTE 'ALTER TABLE external_model_targets_v2 RENAME TO external_model_targets';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_external_model_targets_name_priority
    ON external_model_targets(external_model_name, priority, model_id);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'subscription_model_limits'
    ) AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subscription_model_limits'
          AND column_name = 'model_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subscription_model_limits'
          AND column_name = 'external_model_name'
    ) THEN
        EXECUTE '
            CREATE TABLE subscription_model_limits_v2 (
                external_model_name TEXT PRIMARY KEY REFERENCES external_models(name) ON DELETE CASCADE,
                daily_request_limit INTEGER NOT NULL DEFAULT 0,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        ';

        EXECUTE '
            INSERT INTO subscription_model_limits_v2 (
                external_model_name,
                daily_request_limit,
                updated_at
            )
            SELECT DISTINCT
                t.external_model_name,
                s.daily_request_limit,
                COALESCE(s.updated_at, NOW())
            FROM subscription_model_limits s
            INNER JOIN external_model_targets t
                ON t.model_id = s.model_id
        ';

        EXECUTE 'DROP TABLE subscription_model_limits';
        EXECUTE 'ALTER TABLE subscription_model_limits_v2 RENAME TO subscription_model_limits';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS subscription_model_limits (
    external_model_name TEXT PRIMARY KEY REFERENCES external_models(name) ON DELETE CASCADE,
    daily_request_limit INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE
    legacy_monthly_price NUMERIC(18, 2) := 500;
BEGIN
    SELECT monthly_price_cny
    INTO legacy_monthly_price
    FROM subscription_settings
    WHERE id = 'default'
    LIMIT 1;

    INSERT INTO subscription_plans (
        id,
        name,
        description,
        enabled,
        monthly_price_cny,
        sort_order,
        created_at,
        updated_at
    )
    SELECT
        'legacy-default',
        '默认订阅',
        '由旧版单一订阅配置自动迁移而来',
        TRUE,
        COALESCE(legacy_monthly_price, 500),
        0,
        NOW(),
        NOW()
    WHERE (
        EXISTS (SELECT 1 FROM subscription_model_limits LIMIT 1)
        OR EXISTS (
            SELECT 1
            FROM users
            WHERE subscription_status = 'active'
              AND subscription_expires_at IS NOT NULL
        )
        OR EXISTS (SELECT 1 FROM subscription_orders LIMIT 1)
    )
      AND NOT EXISTS (SELECT 1 FROM subscription_plans LIMIT 1);

    INSERT INTO subscription_plan_model_limits (
        plan_id,
        external_model_name,
        daily_request_limit,
        updated_at
    )
    SELECT
        'legacy-default',
        external_model_name,
        daily_request_limit,
        COALESCE(updated_at, NOW())
    FROM subscription_model_limits
    WHERE EXISTS (
        SELECT 1
        FROM subscription_plans
        WHERE id = 'legacy-default'
    )
    ON CONFLICT (plan_id, external_model_name) DO NOTHING;

    UPDATE users
    SET subscription_plan_id = 'legacy-default'
    WHERE subscription_plan_id IS NULL
      AND subscription_status = 'active'
      AND EXISTS (
          SELECT 1
          FROM subscription_plans
          WHERE id = 'legacy-default'
      );

    UPDATE subscription_orders
    SET plan_id = 'legacy-default'
    WHERE plan_id IS NULL
      AND EXISTS (
          SELECT 1
          FROM subscription_plans
          WHERE id = 'legacy-default'
      );

    UPDATE subscription_orders
    SET snapshot_plan_name = '默认订阅'
    WHERE COALESCE(snapshot_plan_name, '') = ''
      AND plan_id = 'legacy-default';
END $$;

DROP TABLE IF EXISTS routes;

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS request_reservations (
    request_id UUID PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username),
    route_id TEXT,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    reserved_amount_usd NUMERIC(18, 6) NOT NULL,
    actual_amount_usd NUMERIC(18, 6),
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_request_reservations_username
    ON request_reservations(username, created_at DESC);

CREATE TABLE IF NOT EXISTS wallet_ledger (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username),
    request_id UUID,
    entry_type TEXT NOT NULL,
    amount_usd NUMERIC(18, 6) NOT NULL,
    balance_after_usd NUMERIC(18, 6) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_username
    ON wallet_ledger(username, created_at DESC);

CREATE TABLE IF NOT EXISTS recharge_orders (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    out_trade_no TEXT NOT NULL UNIQUE,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL,
    amount_usd NUMERIC(18, 6) NOT NULL,
    amount_cny NUMERIC(18, 2) NOT NULL,
    cny_per_usd NUMERIC(18, 6) NOT NULL,
    subject TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    paid_at TIMESTAMPTZ,
    trade_no TEXT NOT NULL,
    buyer_logon_id TEXT NOT NULL,
    trade_status TEXT NOT NULL,
    customer_note TEXT NOT NULL,
    reviewed_by TEXT NOT NULL,
    reviewed_at TIMESTAMPTZ,
    review_note TEXT NOT NULL,
    failure_reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recharge_orders_username
    ON recharge_orders(username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recharge_orders_status
    ON recharge_orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS recent_requests (
    id BIGSERIAL PRIMARY KEY,
    request_id UUID NOT NULL UNIQUE,
    username TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    model_id TEXT NOT NULL,
    model_name TEXT NOT NULL,
    accounting_mode TEXT NOT NULL DEFAULT 'balance',
    subscription_plan_id TEXT,
    subscription_quota_charged BOOLEAN NOT NULL DEFAULT TRUE,
    success BOOLEAN NOT NULL,
    input_tokens BIGINT NOT NULL,
    output_tokens BIGINT NOT NULL,
    cache_read_tokens BIGINT NOT NULL,
    cache_creation_tokens BIGINT NOT NULL,
    total_cost NUMERIC(18, 6) NOT NULL,
    currency TEXT NOT NULL,
    latency_ms INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recent_requests_username
    ON recent_requests(username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recent_requests_created_at
    ON recent_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recent_requests_username_model_name_created_at
    ON recent_requests(username, model_name, created_at DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'recent_requests'
          AND column_name = 'subscription_plan_id'
    ) THEN
        EXECUTE '
            ALTER TABLE recent_requests
            ADD COLUMN subscription_plan_id TEXT
        ';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'recent_requests'
          AND column_name = 'subscription_quota_charged'
    ) THEN
        EXECUTE 'ALTER TABLE recent_requests ADD COLUMN subscription_quota_charged BOOLEAN NOT NULL DEFAULT TRUE';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS stats_events (
    id BIGSERIAL PRIMARY KEY,
    request_id UUID NOT NULL UNIQUE,
    username TEXT,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    success BOOLEAN NOT NULL,
    input_tokens BIGINT NOT NULL,
    output_tokens BIGINT NOT NULL,
    cache_read_tokens BIGINT NOT NULL,
    cache_creation_tokens BIGINT NOT NULL,
    total_cost NUMERIC(18, 6) NOT NULL,
    currency TEXT NOT NULL,
    latency_ms INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stats_events_created_at
    ON stats_events(created_at DESC);

-- Migration: add thinking_tokens column for Claude/OpenAI o-series thinking/reasoning token tracking
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'recent_requests'
          AND column_name = 'thinking_tokens'
    ) THEN
        EXECUTE 'ALTER TABLE recent_requests ADD COLUMN thinking_tokens BIGINT NOT NULL DEFAULT 0';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'recent_requests'
          AND column_name = 'accounting_mode'
    ) THEN
        EXECUTE 'ALTER TABLE recent_requests ADD COLUMN accounting_mode TEXT NOT NULL DEFAULT ''balance''';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'stats_events'
          AND column_name = 'thinking_tokens'
    ) THEN
        EXECUTE 'ALTER TABLE stats_events ADD COLUMN thinking_tokens BIGINT NOT NULL DEFAULT 0';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user_api_keys'
          AND column_name = 'api_key_hash'
    ) THEN
        EXECUTE '
            ALTER TABLE user_api_keys
            ADD COLUMN api_key_hash TEXT UNIQUE
        ';
        EXECUTE '
            CREATE INDEX IF NOT EXISTS idx_user_api_keys_api_key_hash
            ON user_api_keys(api_key_hash)
            WHERE api_key_hash IS NOT NULL
        ';
        -- Backfill existing api_key_hash values (using sha256)
        EXECUTE '
            UPDATE user_api_keys
            SET api_key_hash = ''sha256:'' || encode(
                sha256(convert_to(api_key, ''UTF8'')),
                ''hex''
            )
            WHERE api_key_hash IS NULL
        ';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'models'
          AND column_name = 'price_multiplier'
    ) THEN
        EXECUTE '
            ALTER TABLE models
            ADD COLUMN price_multiplier NUMERIC(10, 4) NOT NULL DEFAULT 1.5
        ';
    END IF;
END $$;

DO $$
DECLARE
    needs_model_id_remap BOOLEAN := FALSE;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM models
        WHERE id IS DISTINCT FROM concat_ws(
            '--',
            btrim(provider_id),
            regexp_replace(
                regexp_replace(lower(btrim(upstream_api)), '[^a-z0-9_-]+', '-', 'g'),
                '(^-+)|(-+$)',
                '',
                'g'
            ),
            regexp_replace(
                regexp_replace(lower(btrim(upstream_model)), '[^a-z0-9_-]+', '-', 'g'),
                '(^-+)|(-+$)',
                '',
                'g'
            )
        )
    ) INTO needs_model_id_remap;

    IF needs_model_id_remap THEN
        CREATE TABLE IF NOT EXISTS backup_models_before_triplet_model_id AS TABLE models WITH DATA;
        CREATE TABLE IF NOT EXISTS backup_external_model_targets_before_triplet_model_id AS TABLE external_model_targets WITH DATA;
        CREATE TABLE IF NOT EXISTS backup_recent_requests_before_triplet_model_id AS TABLE recent_requests WITH DATA;
        CREATE TABLE IF NOT EXISTS backup_stats_events_before_triplet_model_id AS TABLE stats_events WITH DATA;
        CREATE TABLE IF NOT EXISTS backup_request_reservations_before_triplet_model_id AS TABLE request_reservations WITH DATA;

        CREATE TEMP TABLE tmp_model_id_mapping ON COMMIT DROP AS
        SELECT
            id AS old_id,
            concat_ws(
                '--',
                btrim(provider_id),
                regexp_replace(
                    regexp_replace(lower(btrim(upstream_api)), '[^a-z0-9_-]+', '-', 'g'),
                    '(^-+)|(-+$)',
                    '',
                    'g'
                ),
                regexp_replace(
                    regexp_replace(lower(btrim(upstream_model)), '[^a-z0-9_-]+', '-', 'g'),
                    '(^-+)|(-+$)',
                    '',
                    'g'
                )
            ) AS new_id
        FROM models;

        IF EXISTS (
            SELECT 1
            FROM tmp_model_id_mapping
            GROUP BY new_id
            HAVING COUNT(*) > 1
        ) THEN
            RAISE EXCEPTION 'Triplet model id migration would create duplicate model ids.';
        END IF;

        ALTER TABLE external_model_targets DROP CONSTRAINT IF EXISTS external_model_targets_model_id_fkey;
        ALTER TABLE external_model_targets DROP CONSTRAINT IF EXISTS external_model_targets_v2_model_id_fkey;

        UPDATE models AS m
        SET id = map.new_id
        FROM tmp_model_id_mapping AS map
        WHERE m.id = map.old_id
          AND map.old_id IS DISTINCT FROM map.new_id;

        UPDATE external_model_targets AS t
        SET model_id = map.new_id
        FROM tmp_model_id_mapping AS map
        WHERE t.model_id = map.old_id
          AND map.old_id IS DISTINCT FROM map.new_id;

        UPDATE recent_requests AS r
        SET model_id = map.new_id
        FROM tmp_model_id_mapping AS map
        WHERE r.model_id = map.old_id
          AND map.old_id IS DISTINCT FROM map.new_id;

        UPDATE stats_events AS s
        SET model_id = map.new_id
        FROM tmp_model_id_mapping AS map
        WHERE s.model_id = map.old_id
          AND map.old_id IS DISTINCT FROM map.new_id;

        UPDATE request_reservations AS rr
        SET model_id = map.new_id
        FROM tmp_model_id_mapping AS map
        WHERE rr.model_id = map.old_id
          AND map.old_id IS DISTINCT FROM map.new_id;
    END IF;
END $$;

DROP INDEX IF EXISTS uq_models_provider_upstream;
CREATE UNIQUE INDEX IF NOT EXISTS uq_models_provider_upstream_api
    ON models(provider_id, upstream_api, upstream_model);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'external_model_targets'::regclass
          AND contype = 'f'
          AND confrelid = 'models'::regclass
    ) THEN
        ALTER TABLE external_model_targets
            ADD CONSTRAINT external_model_targets_model_id_fkey
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE;
    END IF;
END $$;
