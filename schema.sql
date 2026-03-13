-- Points & global state
create table if not exists devotion_state (
  id text primary key default 'main',
  points integer not null default 0,
  updated_at timestamptz default now()
);
insert into devotion_state (id, points) values ('main', 0) on conflict do nothing;

-- Chores
create table if not exists devotion_chores (
  id bigint primary key generated always as identity,
  name text not null,
  pts integer not null default 10,
  created_at timestamptz default now()
);

-- Rewards
create table if not exists devotion_rewards (
  id bigint primary key generated always as identity,
  cat text not null default 'Custom',
  name text not null,
  pts integer not null default 10,
  created_at timestamptz default now()
);

-- Activity log
create table if not exists devotion_log (
  id bigint primary key generated always as identity,
  type text not null,
  text text not null,
  pts text default '',
  created_at timestamptz default now()
);

-- Redemption requests
create table if not exists devotion_requests (
  id bigint primary key generated always as identity,
  reward_id bigint,
  reward_name text not null,
  reward_cat text not null,
  reward_pts integer not null,
  status text not null default 'pending',
  created_at timestamptz default now()
);

-- Chore completion requests
create table if not exists devotion_chore_requests (
  id bigint primary key generated always as identity,
  chore_id bigint not null,
  chore_name text not null,
  chore_pts integer not null,
  status text not null default 'pending',
  created_at timestamptz default now()
);

-- PIN authentication
create table if not exists devotion_pins (
  role text primary key,
  pin text not null,
  updated_at timestamptz default now()
);

-- Disable RLS on all tables
alter table devotion_state          disable row level security;
alter table devotion_chores         disable row level security;
alter table devotion_rewards        disable row level security;
alter table devotion_log            disable row level security;
alter table devotion_requests       disable row level security;
alter table devotion_chore_requests disable row level security;
alter table devotion_pins           disable row level security;

-- Default PINs (change in app after setup!)
insert into devotion_pins (role, pin) values ('sub', '1234') on conflict do nothing;
insert into devotion_pins (role, pin) values ('mistress', '9999') on conflict do nothing;

-- Seed default chores
insert into devotion_chores (name, pts) values
  ('Wash dishes', 5),
  ('Vacuum floors', 10),
  ('Clean bathroom', 15),
  ('Do laundry', 10),
  ('Cook dinner', 15),
  ('Take out trash', 5),
  ('Mop floors', 10),
  ('Clean kitchen', 15),
  ('Grocery shopping', 20),
  ('Iron clothes', 10)
  on conflict do nothing;

-- Seed default rewards
insert into devotion_rewards (cat, name, pts) values
  ('Outfit',     'Choose a lingerie/clothing item to wear briefly', 10),
  ('Outfit',     'Pick full outfit for a play session', 20),
  ('Outfit',     'Select entire evening outfit', 30),
  ('Outfit',     'Pick outfit AND hairstyle for date night', 40),
  ('JOI',        'Basic teasing JOI with edging only', 15),
  ('JOI',        'Intense JOI — multiple edges, strict pacing', 25),
  ('JOI',        'Edged to the brink — no release', 30),
  ('JOI',        'Guided JOI blindfolded (sensory only)', 35),
  ('Attention',  '10 min focused teasing or touching', 15),
  ('Attention',  '15 min cuddling, kissing, or body worship', 20),
  ('Attention',  'Extended verbal praise or humiliation session', 25),
  ('Attention',  'Full sensory play — blindfold, feathers, ice, wax', 40),
  ('Attention',  'Roleplay scenario of your choosing', 45),
  ('Cum',        'Controlled orgasm on command (countdown or rules)', 20),
  ('Cum',        'Release allowed — but must hold completely still', 25),
  ('Cum',        'Full unrestricted orgasm', 30),
  ('Cum',        'Multiple orgasms in one session', 50),
  ('Finish',     'Finish on chosen body part', 25),
  ('Finish',     'Finish on face', 40),
  ('Power Flip', 'Give ONE command she must follow (within limits)', 35),
  ('Power Flip', 'Switch night — you take full control', 75),
  ('Power Flip', 'Private dance or striptease', 40),
  ('Lifestyle',  'Skip all chores for one full day', 25),
  ('Lifestyle',  'Breakfast in bed made by her', 20),
  ('Lifestyle',  'Handwritten praise letter about you', 15),
  ('Lifestyle',  'Full spa massage night', 35),
  ('Lifestyle',  'She plans a surprise date', 60),
  ('Luxury',     'Fantasy roleplay scenario you''ve always wanted', 100),
  ('Luxury',     'Overnight getaway or special experience', 150);
