import type { DiagramSpec } from "@objectify/schema";
import { supabase } from "./supabase.js";

/**
 * Upload an image to Supabase Storage, then call the convert edge function.
 * Returns the parsed DiagramSpec on success.
 */
export async function uploadAndConvert(file: File): Promise<DiagramSpec> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  // Upload to storage
  const ext = file.name.split(".").pop() || "png";
  const storagePath = `${session.user.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("diagram-images")
    .upload(storagePath, file);

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  // Call edge function
  const { data, error } = await supabase.functions.invoke("convert", {
    body: { storagePath },
  });

  if (error) throw new Error(error.message || "Conversion failed");
  if (data?.error) throw new Error(data.error);

  return data.spec as DiagramSpec;
}

/** Get current user's credit balance. */
export async function getCredits(): Promise<number> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data } = await supabase
    .from("profiles")
    .select("credits")
    .eq("id", user.id)
    .single();

  return data?.credits ?? 0;
}

/** Get user's conversion history. */
export async function getConversions() {
  const { data } = await supabase
    .from("conversions")
    .select("id, image_url, spec, status, created_at")
    .order("created_at", { ascending: false });

  return data ?? [];
}
