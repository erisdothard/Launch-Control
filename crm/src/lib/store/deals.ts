import { getStoreClient, type StoreClient } from "./db";
import { logActivity } from "./activity";
import { createCustomer } from "./customers";
import type { Deal, DealStage } from "./types";

export type { Deal, DealStage } from "./types";
export { DEAL_STAGES } from "./types";

interface DealRow {
  id: string;
  business_name: string;
  value: number;
  stage: DealStage;
  notes: string;
  from_lead_id: string | null;
  created_at: string;
}

function rowToDeal(row: DealRow): Deal {
  return {
    id: row.id,
    businessName: row.business_name,
    value: row.value,
    stage: row.stage,
    notes: row.notes,
    fromLeadId: row.from_lead_id,
    createdAt: row.created_at,
  };
}

export async function getDeals(client?: StoreClient): Promise<Deal[]> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("deals").select("*").order("created_at", { ascending: false });

  if (error) throw error;
  return (data as DealRow[]).map(rowToDeal);
}

export interface CreateDealInput {
  businessName: string;
  value: number;
  notes: string;
  fromLeadId?: string | null;
  stage?: DealStage;
}

export async function createDeal(input: CreateDealInput, client?: StoreClient): Promise<Deal> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("deals")
    .insert({
      business_name: input.businessName,
      value: input.value,
      notes: input.notes,
      from_lead_id: input.fromLeadId ?? null,
      stage: input.stage ?? "inquiry",
    })
    .select()
    .single();

  if (error) throw error;
  const deal = rowToDeal(data as DealRow);

  await logActivity({ entityType: "deal", entityId: deal.id, entityLabel: deal.businessName, action: "created" }, client);

  return deal;
}

export async function updateDealStage(id: string, stage: DealStage, client?: StoreClient): Promise<Deal | null> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("deals").update({ stage }).eq("id", id).select().maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const deal = rowToDeal(data as DealRow);

  await logActivity(
    { entityType: "deal", entityId: id, entityLabel: deal.businessName, action: "status_changed", detail: `→ ${stage}` },
    client
  );
  // Winning the deal is the conversion: the lead becomes a customer (the DB trigger marks the lead converted).
  if (stage === "won" && deal.fromLeadId) await ensureCustomerForLead(deal.fromLeadId, supabase);

  return deal;
}

async function ensureCustomerForLead(leadId: string, supabase: StoreClient): Promise<void> {
  const { data: existing } = await supabase.from("customers").select("id").eq("from_lead_id", leadId).limit(1).maybeSingle();
  if (existing) return;
  const { data: lead } = await supabase.from("leads").select("business_name, email, phone, notes").eq("id", leadId).maybeSingle();
  if (!lead) return;
  const customer = await createCustomer(
    { businessName: lead.business_name, email: lead.email, phone: lead.phone, notes: lead.notes, fromLeadId: leadId },
    supabase
  );
  await logActivity(
    { entityType: "lead", entityId: leadId, entityLabel: lead.business_name, action: "converted", detail: `→ customer ${customer.id} (deal won)` },
    supabase
  );
}

export async function deleteDeal(id: string, client?: StoreClient): Promise<boolean> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("deals").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const deal = rowToDeal(data as DealRow);

  const { error: deleteError } = await supabase.from("deals").delete().eq("id", id);
  if (deleteError) throw deleteError;

  await logActivity({ entityType: "deal", entityId: id, entityLabel: deal.businessName, action: "deleted" }, client);

  return true;
}
