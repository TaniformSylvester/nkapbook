-- New groups start on a free trial. (Enum values must be added in their own migration before use.)
alter type public.group_plan add value if not exists 'trial' before 'paid';
