"use server";

import { revalidatePath } from "next/cache";
import { createCustomer, deleteCustomer } from "@/lib/store/customers";
import { logActivity } from "@/lib/store/activity";

export interface CreateCustomerInput {
  businessName: string;
  email: string;
  phone: string;
  notes: string;
}

export async function createCustomerAction(input: CreateCustomerInput) {
  const customer = await createCustomer({ ...input, fromLeadId: null });
  await logActivity({
    entityType: "customer",
    entityId: customer.id,
    entityLabel: customer.businessName,
    action: "created",
  });
  revalidatePath("/admin/customers");
  revalidatePath("/admin/activity");
  return customer;
}

export async function deleteCustomerAction(id: string) {
  const customer = await deleteCustomer(id);
  if (customer) {
    await logActivity({
      entityType: "customer",
      entityId: id,
      entityLabel: customer.businessName,
      action: "deleted",
    });
  }
  revalidatePath("/admin/customers");
  revalidatePath("/admin/activity");
}
