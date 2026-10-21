import { getStoreClient, type StoreClient } from "./db";

export interface CompanyInfo {
  name: string;
  logoUrl: string | null;
  email: string;
  phone: string;
  address: string;
}

const DEFAULT_COMPANY: CompanyInfo = {
  name: "Syntra CRM",
  logoUrl: null,
  email: "",
  phone: "",
  address: "",
};

// Singleton row (id is always `true`), seeded by the schema migration —
// company_info always has exactly one row.
export async function getCompanyInfo(client?: StoreClient): Promise<CompanyInfo> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("company_info").select("*").eq("id", true).maybeSingle();

  if (error) throw error;
  if (!data) return DEFAULT_COMPANY;

  return {
    name: data.name,
    logoUrl: data.logo_url,
    email: data.email,
    phone: data.phone,
    address: data.address,
  };
}

export async function saveCompanyInfo(info: CompanyInfo, client?: StoreClient): Promise<void> {
  const supabase = await getStoreClient(client);
  const { error } = await supabase
    .from("company_info")
    .update({
      name: info.name,
      logo_url: info.logoUrl,
      email: info.email,
      phone: info.phone,
      address: info.address,
    })
    .eq("id", true);

  if (error) throw error;
}

/** Signature phone per sending address, keyed by email_accounts.id. Blank when none is set. */
export async function getSignaturePhones(client?: StoreClient): Promise<Record<string, string>> {
  const supabase = await getStoreClient(client);
  const { data, error } = await supabase.from("email_accounts").select("id, signature_phone");
  if (error) throw error;
  return Object.fromEntries(data.map((a) => [a.id, a.signature_phone ?? ""]));
}
