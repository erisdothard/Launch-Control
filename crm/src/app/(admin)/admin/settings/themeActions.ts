"use server";

import { revalidatePath } from "next/cache";
import { currentCrmUserEmail } from "@/lib/email/session";
import { setTheme } from "@/lib/store/theme";
import { parseTheme } from "@/lib/theme/theme";

/** Saves the signed-in person's own colours. Null puts the default look back. */
export async function saveThemeAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = await currentCrmUserEmail();
  if (!email) return { ok: false, error: "Sign in again to do that." };
  const theme = input === null ? null : parseTheme(input);
  if (input !== null && !theme) return { ok: false, error: "Those colours aren't valid. Pick them again." };
  const { ok } = await setTheme(email, theme);
  if (!ok) return { ok: false, error: "Couldn't save your colours. Try again." };
  revalidatePath("/", "layout");
  return { ok: true };
}
