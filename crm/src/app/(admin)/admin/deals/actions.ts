"use server";

import { revalidatePath } from "next/cache";
import { createDeal, updateDealStage, deleteDeal, type DealStage, type CreateDealInput } from "@/lib/store/deals";

export async function createDealAction(input: CreateDealInput) {
  const deal = await createDeal(input);
  revalidatePath("/admin/deals");
  revalidatePath("/admin/activity");
  return deal;
}

export async function updateDealStageAction(id: string, stage: DealStage) {
  await updateDealStage(id, stage);
  revalidatePath("/admin/deals");
  revalidatePath("/admin/activity");
}

export async function deleteDealAction(id: string) {
  await deleteDeal(id);
  revalidatePath("/admin/deals");
  revalidatePath("/admin/activity");
}
