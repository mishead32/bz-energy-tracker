-- BZ Energy Tracker: run this in Neon > SQL Editor > paste > Run
-- It is safe to run again later: it only adds what is missing and never deletes data.

------------------------------------------------------------
-- 1. Daily meter readings, checklist, issues, visits
------------------------------------------------------------
create table if not exists readings (
  id bigserial primary key,
  entry_date date not null,
  shift text not null check (shift in ('Opening','Closing')),
  meter text not null,
  reading numeric not null,
  entered_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_date, shift, meter)
);

create table if not exists checklist (
  id bigserial primary key,
  entry_date date not null,
  shift text not null check (shift in ('Opening','Closing')),
  item text not null,
  done boolean not null,
  entered_by text not null,
  created_at timestamptz not null default now(),
  unique (entry_date, shift, item)
);

create table if not exists issues (
  id bigserial primary key,
  entry_date date not null,
  area text,
  issue text not null,
  entered_by text not null,
  status text not null default 'Open' check (status in ('Open','Closed')),
  created_at timestamptz not null default now()
);

-- Member visits per day (from face-ID attendance), used for kWh per member visit
create table if not exists daily_visits (
  entry_date date primary key,
  visits int not null check (visits >= 0),
  updated_by text,
  updated_at timestamptz not null default now()
);

------------------------------------------------------------
-- 2. Settings
------------------------------------------------------------
create table if not exists app_config (
  id int primary key default 1 check (id = 1),
  data jsonb not null
);

insert into app_config (id, data) values (1, '{
  "meters": ["Main Meter"],
  "staff": ["Rohit", "Meshpal"],
  "items": [
    "AC set point is 24 to 26 C",
    "Lights off in unused halls and rooms",
    "Cardio machines and screens switched off at the plug (closing)",
    "Geysers, steam and sauna off or on timer",
    "Pumps and motors off when not needed",
    "Outdoor lights and signage on timer",
    "AC filters and doors checked"
  ],
  "baseline_per_day": null,
  "plan_start": null,
  "energy_owner": "",
  "backup_owner": ""
}'::jsonb)
on conflict (id) do nothing;

------------------------------------------------------------
-- 3. Proposal modules
------------------------------------------------------------

-- 30/60/90-day plan
create table if not exists plan_tasks (
  id bigserial primary key,
  phase text not null,
  title text not null,
  area text,
  owner text,
  due_date date,
  due_offset int,
  status text not null default 'Not started' check (status in ('Not started','In progress','Done')),
  notes text,
  done_date date,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- Where BodyZone can save: one row per area
create table if not exists saving_areas (
  id bigserial primary key,
  area text not null unique,
  what text,
  cost text,
  status text not null default 'Not checked' check (status in ('Not checked','Checked','Action in progress','Fixed')),
  finding text,
  action text,
  owner text,
  saving_pct numeric,
  updated_at timestamptz not null default now()
);

-- Major equipment with kW rating and running hours
create table if not exists equipment (
  id bigserial primary key,
  name text not null,
  zone text,
  area text,
  qty int not null default 1,
  kw numeric,
  hours_per_day numeric,
  notes text
);

-- Monthly electricity bill and DG diesel
create table if not exists bills (
  id bigserial primary key,
  bill_month date not null unique,
  units numeric,
  amount numeric,
  power_factor numeric,
  contract_kva numeric,
  diesel_litres numeric,
  notes text
);

-- Approvals needed from CMD Sir
create table if not exists approvals (
  id bigserial primary key,
  item text not null,
  status text not null default 'Pending' check (status in ('Pending','Approved','Needs changes')),
  cmd_remark text,
  decided_on date,
  sort int not null default 0
);

-- Selection scorecard for the Energy Owner (score 1 to 5)
create table if not exists scorecard (
  id bigserial primary key,
  criterion text not null,
  person text not null,
  score int not null check (score between 1 and 5),
  unique (criterion, person)
);

------------------------------------------------------------
-- 4. Starting content (added only if the table is empty)
------------------------------------------------------------
insert into plan_tasks (phase, title, area, owner, due_offset, sort)
select * from (values
  ('Days 1 to 7: Baseline', 'Brief Rohit and Meshpal on their roles and the daily checklist', 'Routine', 'Raj', 1, 10),
  ('Days 1 to 7: Baseline', 'List and photograph every meter point (enter names in Settings)', 'Power bill and DG', 'Energy Owner', 3, 20),
  ('Days 1 to 7: Baseline', 'Collect the last 12 months of electricity bills (enter in Bills tab)', 'Power bill and DG', 'Raj', 5, 30),
  ('Days 1 to 7: Baseline', 'List major equipment with kW rating and running hours (Equipment tab)', 'All', 'Energy Owner', 7, 40),
  ('Days 8 to 30: No-cost actions', 'Start the opening and closing checklist and daily meter readings', 'Routine', 'Energy Owner', 8, 50),
  ('Days 8 to 30: No-cost actions', 'Fix AC set points at 24 to 26 C', 'Air conditioning', 'Energy Owner', 10, 60),
  ('Days 8 to 30: No-cost actions', 'Switch off unused zones and equipment', 'Lighting', 'Energy Owner', 14, 70),
  ('Days 8 to 30: No-cost actions', 'Switch off cardio machines and screens at the plug at closing', 'Cardio equipment and screens', 'Energy Owner', 14, 80),
  ('Days 8 to 30: No-cost actions', 'Set the baseline units per day in Settings after 30 days of readings', 'Routine', 'Raj', 30, 90),
  ('Days 31 to 60: Low-cost fixes', 'Check power factor, contract demand and diesel use on the bills', 'Power bill and DG', 'Raj', 40, 100),
  ('Days 31 to 60: Low-cost fixes', 'Fit timers and sensors (hot water, signage, outdoor lights)', 'Hot water, steam, sauna', 'Energy Owner', 45, 110),
  ('Days 31 to 60: Low-cost fixes', 'Service AC filters and coils', 'Air conditioning', 'Energy Owner', 45, 120),
  ('Days 31 to 60: Low-cost fixes', 'Replace the worst lights with LED', 'Lighting', 'Energy Owner', 50, 130),
  ('Days 31 to 60: Low-cost fixes', 'Repair water and steam leaks', 'Hot water, steam, sauna', 'Energy Owner', 55, 140),
  ('Days 61 to 90: Review', 'Compare kWh with the baseline', 'Routine', 'Raj', 75, 150),
  ('Days 61 to 90: Review', 'Decide larger items (sub-meters, motor controllers, solar) with payback estimates', 'All', 'Raj', 85, 160),
  ('Days 61 to 90: Review', 'Present the day-90 review to CMD Sir', 'All', 'Raj', 90, 170)
) as v(phase, title, area, owner, due_offset, sort)
where not exists (select 1 from plan_tasks);

insert into saving_areas (area, what, cost)
select * from (values
  ('Air conditioning', 'Fix a standard set point (24 to 26 °C), run only the zones in use, clean filters monthly, shut doors', 'Nil to low'),
  ('Lighting', 'Switch off unused halls and rooms, move to LED, add timers for signage and outdoor lights', 'Low'),
  ('Hot water, steam, sauna (spa and wet areas)', 'Run on timers matched to booking hours, insulate pipes, repair leaks', 'Low'),
  ('Cardio equipment and screens', 'Switch off at the plug at closing, use power strips with one master switch', 'Nil'),
  ('Pumps and motors', 'Run only when needed, check for overload or faults that waste power', 'Low'),
  ('Power bill and DG', 'Check power factor, contract demand and diesel use on bills; correct any penalties', 'Depends on finding'),
  ('Opening and closing routine', 'One written checklist, signed daily', 'Nil')
) as v(area, what, cost)
where not exists (select 1 from saving_areas);

insert into approvals (item, sort)
select * from (values
  ('Confirm which of Rohit or Meshpal is the Energy Owner, and who is the backup', 10),
  ('Authority for the owner to switch off unused zones and fix AC set points, including telling trainers and staff', 20),
  ('A small budget for timers, power strips and LED lights, amount to be set after the baseline', 30),
  ('Whether to link recognition or a reward to the savings target', 40),
  ('A review date at day 90', 50)
) as v(item, sort)
where not exists (select 1 from approvals);

------------------------------------------------------------
-- 5. Date-wise usage per meter, calculated from readings
------------------------------------------------------------
-- day_units   = closing - opening (while open)
-- night_units = next morning opening - closing (power used while closed)
-- total_units = next morning opening - opening (full 24 hours)
create or replace view daily_usage as
select
  o.entry_date,
  o.meter,
  o.reading as opening,
  c.reading as closing,
  c.reading - o.reading as day_units,
  n.reading - c.reading as night_units,
  n.reading - o.reading as total_units
from readings o
left join readings c on c.entry_date = o.entry_date and c.meter = o.meter and c.shift = 'Closing'
left join readings n on n.entry_date = o.entry_date + 1 and n.meter = o.meter and n.shift = 'Opening'
where o.shift = 'Opening';

create index if not exists readings_date_idx on readings (entry_date);
create index if not exists checklist_date_idx on checklist (entry_date);
create index if not exists issues_date_idx on issues (entry_date);
