CREATE TABLE portfolio_state (
    slot TEXT PRIMARY KEY NOT NULL,
    revision INTEGER NOT NULL,
    content TEXT NOT NULL,
    saved_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE portfolio_releases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    revision INTEGER NOT NULL UNIQUE,
    content TEXT NOT NULL,
    saved_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE portfolio_media (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
