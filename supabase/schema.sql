begin;
create table public.circuits (
 id uuid primary key default gen_random_uuid(), creator_id uuid references auth.users on delete set null,
 parent_id uuid references public.circuits on delete set null, title text not null check(length(title) between 1 and 160),
 switching_rule text not null, verilog_code text not null check(octet_length(verilog_code)<=32768),
 netlist_json jsonb not null, gate_count integer not null check(gate_count between 0 and 500),
 logic_depth integer not null check(logic_depth>=0), is_public boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.fault_challenges (
 id uuid primary key default gen_random_uuid(), circuit_id uuid not null references public.circuits on delete cascade,
 max_probes int not null default 4 check(max_probes between 1 and 32),par_vectors int not null default 2,
 created_at timestamptz not null default now()
);
create table public.fault_answers (
 challenge_id uuid primary key references public.fault_challenges on delete cascade,hidden_faults jsonb not null
);
create table public.challenge_solves (
 id uuid primary key default gen_random_uuid(), challenge_id uuid not null references public.fault_challenges on delete cascade,
 solver_id uuid not null references auth.users on delete cascade, solver_name text not null,
 probes_used int not null check(probes_used>=0),test_vectors jsonb not null,solved_at timestamptz not null default now(),
 unique(challenge_id,solver_id)
);
alter table public.circuits enable row level security;
alter table public.fault_challenges enable row level security;
alter table public.fault_answers enable row level security;
alter table public.challenge_solves enable row level security;
revoke all on public.circuits,public.fault_challenges,public.fault_answers,public.challenge_solves from public, anon,authenticated;
grant select on public.circuits,public.fault_challenges,public.challenge_solves to anon,authenticated;
grant insert on public.circuits to authenticated;
grant all on public.circuits,public.fault_challenges,public.fault_answers,public.challenge_solves to service_role;
create policy visible_circuits on public.circuits for select using(is_public or creator_id=(select auth.uid()));
create policy publish_own on public.circuits for insert to authenticated with check(creator_id=(select auth.uid()) and (parent_id is null or parent_id in (select c.id from public.circuits c where c.is_public)));
create policy visible_challenges on public.fault_challenges for select using(circuit_id in (select id from public.circuits where is_public));
create policy visible_scores on public.challenge_solves for select using(challenge_id in (select id from public.fault_challenges));
commit;
