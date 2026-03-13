-- ============================================================
-- DEVOTION SCHEMA
-- Run once in Supabase SQL editor to set up the database.
-- ============================================================


-- ------------------------------------------------------------
-- CORE STATE
-- ------------------------------------------------------------

-- Global points counter and app state
create table if not exists devotion_state (
  id         text primary key default 'main',
  points     integer not null default 0,
  updated_at timestamptz default now()
);
insert into devotion_state (id, points) values ('main', 0) on conflict do nothing;

-- PIN authentication (roles: 'sub', 'mistress')
create table if not exists devotion_pins (
  role       text primary key,
  pin        text not null,
  updated_at timestamptz default now()
);


-- ------------------------------------------------------------
-- CONTENT  (managed by Mistress)
-- ------------------------------------------------------------

-- Reward categories with icon and colour
create table if not exists devotion_categories (
  id         bigint primary key generated always as identity,
  name       text not null unique,
  icon       text not null default '✨',
  color      text not null default '#ff758f',
  created_at timestamptz default now()
);

-- Repeatable chores the Sub can mark as done (requires approval)
-- added_by: 'mistress' (priority, top section) or 'sub' (sub can add their own)
create table if not exists devotion_chores (
  id         bigint primary key generated always as identity,
  name       text not null,
  pts        integer not null default 10,
  added_by   text not null default 'mistress',
  created_at timestamptz default now()
);

-- Rewards the Sub can redeem with earned points
create table if not exists devotion_rewards (
  id         bigint primary key generated always as identity,
  cat        text not null default 'Custom',
  name       text not null,
  pts        integer not null default 10,
  created_at timestamptz default now()
);

-- Penalty templates — applied immediately by Mistress to deduct points
create table if not exists devotion_penalties (
  id         bigint primary key generated always as identity,
  name       text not null,
  pts        integer not null default 5,
  created_at timestamptz default now()
);


-- ------------------------------------------------------------
-- ACTIVITY  (generated at runtime)
-- ------------------------------------------------------------

-- Full activity log (types: earned, redeemed, approved, denied, penalty, chore_approved, chore_denied)
create table if not exists devotion_log (
  id         bigint primary key generated always as identity,
  type       text not null,
  text       text not null,
  pts        text default '',
  created_at timestamptz default now()
);

-- Reward redemption requests (Sub → Mistress approval)
create table if not exists devotion_requests (
  id          bigint primary key generated always as identity,
  reward_id   bigint,
  reward_name text not null,
  reward_cat  text not null,
  reward_pts  integer not null,
  status      text not null default 'pending',
  created_at  timestamptz default now()
);

-- Chore completion requests (Sub → Mistress approval)
create table if not exists devotion_chore_requests (
  id         bigint primary key generated always as identity,
  chore_id   bigint not null,
  chore_name text not null,
  chore_pts  integer not null,
  status     text not null default 'pending',
  created_at timestamptz default now()
);


-- ------------------------------------------------------------
-- ROW LEVEL SECURITY  (disabled — personal app, no auth layer)
-- ------------------------------------------------------------

alter table devotion_state          disable row level security;
alter table devotion_pins           disable row level security;
alter table devotion_categories     disable row level security;
alter table devotion_chores         disable row level security;
alter table devotion_rewards        disable row level security;
alter table devotion_penalties      disable row level security;
alter table devotion_log            disable row level security;
alter table devotion_requests       disable row level security;
alter table devotion_chore_requests disable row level security;


-- ------------------------------------------------------------
-- SEED DATA
-- ------------------------------------------------------------

-- Default PINs — change these in the app after first login
insert into devotion_pins (role, pin) values
  ('sub',      '1234'),
  ('mistress', '9999')
on conflict do nothing;

-- Starter categories — add the rest directly from the app (Mistress → Settings)
insert into devotion_categories (name, icon, color) values
  ('Outfit',    '👗', '#ff4d6d'),
  ('Attention', '🤝', '#ff758f'),
  ('Lifestyle', '🎁', '#ff6b81'),
  ('Luxury',    '🌟', '#ff0a54'),
  ('Custom',    '✨', '#ff758f')
on conflict (name) do nothing;
