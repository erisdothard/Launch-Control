import { getStoreClient, type StoreClient } from "./db";
import type { Customer } from "./types";

export type { Customer } from "./types";

interface CustomerRow {
  id: string;
  business_name: string;
  email: string;
  phone: string;
  notes: string;
  from_lead_id: string | null;
  created_at: string;
}

function rowToCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    businessName: row.business_name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    fromLeadId: row.from_lead_id,
    createdAt: row.created_at,
  };
}

export async function getCustomers(client?: StoreClient): Promise<Customer[]> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as CustomerRow[]).map(rowToCustomer);
}

export async function createCustomer(
  input: Omit<Customer, "id" | "createdAt">,
  client?: StoreClient
): Promise<Customer> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase
    .from("customers")
    .insert({
      business_name: input.businessName,
      email: input.email,
      phone: input.phone,
      notes: input.notes,
      from_lead_id: input.fromLeadId,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToCustomer(data as CustomerRow);
}

// Logging is left to callers (not done internally, unlike leads/deals) because
// convertLeadToCustomer in leads.ts already logs its own "customer created"
// entry with lead-conversion detail — logging here too would double it up.
export async function deleteCustomer(id: string, client?: StoreClient): Promise<Customer | null> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { error: deleteError } = await supabase.from("customers").delete().eq("id", id);
  if (deleteError) throw deleteError;

  return rowToCustomer(data as CustomerRow);
}
