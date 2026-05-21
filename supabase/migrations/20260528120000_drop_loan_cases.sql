-- Remove unused loan_cases table (bank loan tracking was never wired in the app).

drop table if exists public.loan_cases cascade;
