-- At most one waiting draft campaign per agent (email_campaigns.created_by is text; the Outreach
-- Writer writes 'agent:outreach-writer'). Two overlapping writer passes, or a retry after a
-- half-failed create, can't leave a second batch for Max to approve. People's own drafts
-- (created_by = their email, or null) are untouched.
--
-- If this fails with a duplicate-key error, an agent already has two drafts waiting: cancel or
-- delete the extra one in Campaigns (or: select id, created_at from email_campaigns where
-- status = 'draft' and created_by like 'agent:%' order by created_at) and apply again.
-- The writer deletes its own empty (zero-recipient) drafts before creating a new one, so a
-- leftover from a failed create can't trip this index.

create unique index if not exists email_campaigns_one_agent_draft
  on public.email_campaigns (created_by)
  where status = 'draft' and created_by like 'agent:%';
