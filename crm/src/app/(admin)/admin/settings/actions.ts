"use server";

import { revalidatePath } from "next/cache";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { getCompanyInfo, saveCompanyInfo } from "@/lib/store/company";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/svg+xml", "image/webp"]);

export async function updateCompanyInfo(formData: FormData): Promise<{ error?: string }> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();

  if (!name) {
    return { error: "Company name is required." };
  }

  const current = await getCompanyInfo();
  let logoUrl = current.logoUrl;

  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > MAX_LOGO_BYTES) {
      return { error: "Logo must be under 2MB." };
    }
    if (!ALLOWED_LOGO_TYPES.has(logo.type)) {
      return { error: "Logo must be PNG, JPEG, WebP, or SVG." };
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    const ext = logo.type.split("/")[1].replace("svg+xml", "svg");
    const filename = `logo-${Date.now()}.${ext}`;
    const bytes = Buffer.from(await logo.arrayBuffer());
    await writeFile(path.join(UPLOAD_DIR, filename), bytes);
    logoUrl = `/uploads/${filename}`;
  }

  await saveCompanyInfo({ name, email, phone, address, logoUrl });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout"); // sidebar reads company info via the layout
  return {};
}
