// Saved email templates (subject + body with {{merge}} fields), for mass email and single sends.
import { getStoreClient, type StoreClient } from "./db";

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
  createdBy: string | null;
  updatedAt: string;
}

export async function listTemplates(client?: StoreClient): Promise<EmailTemplate[]> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("email_templates")
    .select("id, name, subject, body_text, created_by, updated_at")
    .order("name", { ascending: true });
  if (error) throw error;
  return data.map((t) => ({ id: t.id, name: t.name, subject: t.subject, bodyText: t.body_text, createdBy: t.created_by, updatedAt: t.updated_at }));
}

export interface TemplateInput {
  name: string;
  subject: string;
  bodyText: string;
}

export async function createTemplate(input: TemplateInput, createdBy: string, client?: StoreClient): Promise<EmailTemplate> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("email_templates")
    .insert({ name: input.name, subject: input.subject, body_text: input.bodyText, created_by: createdBy })
    .select("id, name, subject, body_text, created_by, updated_at")
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name, subject: data.subject, bodyText: data.body_text, createdBy: data.created_by, updatedAt: data.updated_at };
}

export async function updateTemplate(id: string, input: TemplateInput, client?: StoreClient): Promise<EmailTemplate | null> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("email_templates")
    .update({ name: input.name, subject: input.subject, body_text: input.bodyText, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name, subject, body_text, created_by, updated_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, name: data.name, subject: data.subject, bodyText: data.body_text, createdBy: data.created_by, updatedAt: data.updated_at };
}

export async function deleteTemplate(id: string, client?: StoreClient): Promise<void> {
  const supabase = await getStoreClient(client);
  const { error } = await supabase.from("email_templates").delete().eq("id", id);
  if (error) throw error;
}
