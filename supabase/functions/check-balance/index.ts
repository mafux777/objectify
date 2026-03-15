import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
// balanceOf(address) selector
const BALANCE_OF_SELECTOR = "0x70a08231";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonOk(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Left-pad hex to 32 bytes (64 hex chars) */
function pad32(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return clean.padStart(64, "0");
}

/** Read USDC balance at `address` via public Base RPC. Returns raw units as number. */
async function getUsdcBalance(
  rpcUrl: string,
  address: string,
): Promise<number> {
  const callData = BALANCE_OF_SELECTOR + pad32(address);

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: USDC_BASE, data: callData }, "latest"],
      id: 1,
    }),
  });

  const json = await response.json();
  if (json.error) {
    throw new Error(`RPC error: ${json.error.message}`);
  }

  // Parse hex result to number. Safe for USDC (6 decimals, max ~9 trillion).
  const hex = json.result as string;
  if (!hex || hex === "0x") return 0;
  return Number(BigInt(hex));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError("Missing authorization header", 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("Auth failed:", authError?.message, "user:", !!user);
      return jsonError(authError?.message ?? "Unauthorized", 401);
    }

    // 2. Look up wallet
    const { data: wallet } = await supabase
      .from("wallets")
      .select("address")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (!wallet) {
      return jsonError("No wallet found", 404);
    }

    // 3. Read on-chain USDC balance (public, no key needed)
    const rpcUrl = Deno.env.get("BASE_RPC_URL") ?? "https://mainnet.base.org";
    const onChainRaw = await getUsdcBalance(rpcUrl, wallet.address);

    // 4. Grant credits for any new deposits
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: creditsAdded, error: rpcError } = await serviceClient.rpc(
      "credit_deposit",
      {
        wallet_addr: wallet.address,
        new_usdc_raw: onChainRaw,
      },
    );

    if (rpcError) {
      console.error("credit_deposit error:", rpcError);
      return jsonError("Failed to process deposit", 500);
    }

    // 5. Read updated balance
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();

    // Format USDC for display (6 decimals)
    const usdcNum = onChainRaw / 1_000_000;
    const usdcBalance = usdcNum.toFixed(6);

    return jsonOk({
      creditsAdded: creditsAdded ?? 0,
      newBalance: profile?.credits ?? 0,
      usdcBalance,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : "";
    console.error("check-balance error:", msg, stack);
    return jsonError(`Internal error: ${msg}`, 500);
  }
});
