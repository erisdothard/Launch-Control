-- The From line on CRM mail is the company ("Launch Control"); the person is named in the signature.
-- display_name stays the sender name; signature_name is who signs.
alter table public.email_accounts add column signature_name text not null default '';
update public.email_accounts set signature_name = display_name where signature_name = '' and display_name <> '';
