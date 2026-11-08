-- Public catalog default: Service Name and Service Description only.
-- Stock labels rename when they still match the previous wording.
-- A visibility that differs from the previous stock default is kept and marked as an override.
-- Apply after 0006_v3_field_lookup_toggle.sql. This file has no credentials.

alter table public.field_definitions
  add column if not exists visibility_overridden boolean not null default false;

update public.field_definitions
set label = 'Service Description'
where field_key = 'summary'
  and label = 'Executive Summary';

update public.field_definitions
set help_text = 'One or two sentences a client can read. This is the service description.'
where field_key = 'summary'
  and help_text = 'One or two sentences a leader or client can read without the full description.';

update public.field_definitions
set label = 'Full Service Description'
where field_key = 'description'
  and label = 'Full Description';

update public.field_definitions
set help_text = 'The longer narrative of how the service is delivered.'
where field_key = 'description'
  and help_text = 'Complete narrative of how the service is delivered.';

update public.field_definitions
set help_text = 'Shared mailbox for support and escalation. One email address.'
where field_key = 'support_contact'
  and help_text = 'Where to escalate when the normal path is not enough.';

update public.field_definitions
set lookup_bound = false
where field_key = 'support_contact'
  and lookup_bound = true;

-- Keep a visibility that is not the previous stock value.
update public.field_definitions
set visibility_overridden = true
where visibility_overridden = false
  and (
    (
      field_key in (
        'internal_name',
        'current_tooling_notes',
        'internal_notes',
        'current_maturity_cmmi',
        'target_maturity_cmmi',
        'maturity_gap',
        'known_gaps_or_risks',
        'third_party_providers',
        'cost_model',
        'cost_or_effort_notes'
      )
      and visibility = 'public'
    )
    or (
      field_key not in (
        'internal_name',
        'current_tooling_notes',
        'internal_notes',
        'current_maturity_cmmi',
        'target_maturity_cmmi',
        'maturity_gap',
        'known_gaps_or_risks',
        'third_party_providers',
        'cost_model',
        'cost_or_effort_notes'
      )
      and visibility = 'internal'
    )
  );

update public.field_definitions
set visibility = 'internal'
where visibility_overridden = false
  and visibility = 'public'
  and field_key not in ('name', 'summary');
