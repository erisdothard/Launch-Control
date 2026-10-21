-- Inbox (Builder B), 2026-10-21. Additive. Keeps every message of a conversation under one thread
-- key in email_threads and the Inbox.
--
-- 1. The provider's thread id IS the conversation id (Outlook conversationId, Gmail threadId).
--    The CRM's SMTP sends only learn it when the worker's Sent Items sync attaches the ids, and rows
--    stored before the v2 inbox never had conversation_id, so fill it from provider_thread_id.
create or replace function public.email_messages_fill_conversation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.conversation_id is null and new.provider_thread_id is not null then
    new.conversation_id := new.provider_thread_id;
  end if;
  return new;
end;
$$;

drop trigger if exists email_messages_fill_conversation on public.email_messages;
create trigger email_messages_fill_conversation
  before insert or update of provider_thread_id, conversation_id on public.email_messages
  for each row execute function public.email_messages_fill_conversation();

update public.email_messages
  set conversation_id = provider_thread_id
  where conversation_id is null and provider_thread_id is not null;

-- 2. Rows from before the folder column: what we sent is in Sent.
update public.email_messages set folder = 'sent' where direction = 'out' and folder = 'inbox';
