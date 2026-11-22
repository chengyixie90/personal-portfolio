CREATE TABLE portfolio_editor_auth (
    slot TEXT PRIMARY KEY NOT NULL,
    salt TEXT NOT NULL,
    digest TEXT NOT NULL,
    key_version INTEGER NOT NULL,
    changed_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE portfolio_editor_sessions (
    token_hash TEXT PRIMARY KEY NOT NULL,
    key_version INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX portfolio_editor_sessions_expiry ON portfolio_editor_sessions(expires_at);
--> statement-breakpoint
CREATE TABLE portfolio_editor_attempts (
    bucket TEXT PRIMARY KEY NOT NULL,
    attempts INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
