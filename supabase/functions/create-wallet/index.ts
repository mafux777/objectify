import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { keccak_256 } from "https://esm.sh/@noble/hashes@1.7.1/sha3";
import {
  bytesToHex,
  hexToBytes,
} from "https://esm.sh/@noble/hashes@1.7.1/utils";

// Safe v1.4.1 contract addresses on Base
const SAFE_PROXY_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
const SAFE_L2_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const FALLBACK_HANDLER = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Hex / ABI utilities (lightweight replacements for viem) ──

function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const padded = clean.length % 2 ? "0" + clean : clean;
  return hexToBytes(padded);
}

/** keccak256 of hex-encoded bytes, returns 0x-prefixed hex */
function keccak256(hex: string): string {
  return "0x" + bytesToHex(keccak_256(fromHex(hex)));
}

/** keccak256 of a UTF-8 string, returns 0x-prefixed hex */
function keccak256Utf8(text: string): string {
  return "0x" + bytesToHex(keccak_256(new TextEncoder().encode(text)));
}

/** Convert a UTF-8 string to 0x-prefixed hex (like viem's toHex) */
function stringToHex(str: string): string {
  return "0x" + bytesToHex(new TextEncoder().encode(str));
}

/** Left-pad hex to 32 bytes (64 hex chars) */
function pad32(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return clean.padStart(64, "0");
}

/** Concatenate hex strings */
function concatHex(...parts: string[]): string {
  return "0x" + parts.map((h) => (h.startsWith("0x") ? h.slice(2) : h)).join("");
}

/** EIP-55 mixed-case checksum address */
function checksumAddress(addr: string): string {
  const lower = addr.toLowerCase().replace("0x", "");
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(lower)));
  let result = "0x";
  for (let i = 0; i < 40; i++) {
    result += parseInt(hash[i], 16) >= 8
      ? lower[i].toUpperCase()
      : lower[i];
  }
  return result;
}

/**
 * ABI-encode the Safe.setup() function call.
 * setup(address[],uint256,address,bytes,address,address,uint256,address)
 */
function encodeSetupCall(ownerAddress: string): string {
  const selector = keccak256Utf8(
    "setup(address[],uint256,address,bytes,address,address,uint256,address)",
  ).slice(0, 10); // 4 bytes

  const ZERO32 = "0".repeat(64);
  const ONE32 = "0".repeat(63) + "1";

  // Head: 8 params × 32 bytes
  const head = [
    pad32("100"), // param 0: offset to _owners → 256
    ONE32, // param 1: _threshold = 1
    ZERO32, // param 2: to = 0x0
    pad32("140"), // param 3: offset to data → 320
    pad32(FALLBACK_HANDLER), // param 4: fallbackHandler
    ZERO32, // param 5: paymentToken = 0x0
    ZERO32, // param 6: payment = 0
    ZERO32, // param 7: paymentReceiver = 0x0
  ].join("");

  // Tail: _owners array (at offset 256 = 0x100)
  const ownersTail = ONE32 + pad32(ownerAddress);
  // Tail: data bytes (at offset 320 = 0x140)
  const dataTail = ZERO32; // length = 0

  return "0x" + selector.slice(2) + head + ownersTail + dataTail;
}

// Cache proxy creation code across invocations (same Deno isolate)
let cachedProxyCode: string | null = null;

async function getProxyCreationCode(rpcUrl: string): Promise<string> {
  if (cachedProxyCode) return cachedProxyCode;

  const selector = keccak256Utf8("proxyCreationCode()").slice(0, 10);

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: SAFE_PROXY_FACTORY, data: selector }, "latest"],
      id: 1,
    }),
  });

  const json = await response.json();
  if (json.error) {
    throw new Error(`RPC error: ${json.error.message}`);
  }

  const result = (json.result as string).slice(2); // remove "0x"
  // Decode ABI-encoded bytes: offset (32 bytes) + length (32 bytes) + data
  const offset = parseInt(result.slice(0, 64), 16) * 2;
  const length = parseInt(result.slice(offset, offset + 64), 16) * 2;
  cachedProxyCode = "0x" + result.slice(offset + 64, offset + 64 + length);

  return cachedProxyCode;
}

/**
 * Compute the counterfactual Safe address using CREATE2.
 * Mirrors SafeProxyFactory.createProxyWithNonce logic.
 */
function computeSafeAddress(
  proxyCode: string,
  ownerAddress: string,
  saltNonce: bigint,
): string {
  const initializer = encodeSetupCall(ownerAddress);

  // Salt: keccak256(abi.encodePacked(keccak256(initializer), saltNonce))
  const initHash = keccak256(initializer).slice(2);
  const noncePadded = saltNonce.toString(16).padStart(64, "0");
  const salt = keccak256("0x" + initHash + noncePadded);

  // Deployment bytecode: proxyCreationCode ++ abi.encode(singleton)
  const singletonPadded = pad32(SAFE_L2_SINGLETON);
  const deploymentData = concatHex(proxyCode, "0x" + singletonPadded);

  // CREATE2: keccak256(0xff ++ factory ++ salt ++ keccak256(bytecode))[12:]
  const factory = SAFE_PROXY_FACTORY.slice(2).toLowerCase();
  const initCodeHash = keccak256(deploymentData).slice(2);
  const create2Hash = keccak256(
    "0xff" + factory + salt.slice(2) + initCodeHash,
  );

  // Last 20 bytes (40 hex chars)
  const rawAddress = "0x" + create2Hash.slice(create2Hash.length - 40);
  return checksumAddress(rawAddress);
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
      return jsonError("Unauthorized", 401);
    }

    // 2. Check if wallet already exists for this user
    const { data: existing } = await supabase
      .from("wallets")
      .select("address")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ address: existing.address }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 3. Compute counterfactual Safe address
    const ownerAddress = Deno.env.get("MASTER_SAFE_OWNER_ADDRESS");
    const rpcUrl = Deno.env.get("BASE_RPC_URL") ?? "https://mainnet.base.org";

    if (!ownerAddress) {
      return jsonError("Server configuration error", 500);
    }

    const saltNonce = BigInt(keccak256(stringToHex(user.id)));
    const proxyCode = await getProxyCreationCode(rpcUrl);
    const address = computeSafeAddress(proxyCode, ownerAddress, saltNonce);

    // 4. Insert wallet using service role (bypasses RLS)
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: insertError } = await serviceClient
      .from("wallets")
      .insert({
        profile_id: user.id,
        address,
        salt_nonce: saltNonce.toString(),
      });

    if (insertError) {
      // Handle race condition: wallet might have been created concurrently
      if (insertError.code === "23505") {
        const { data: raceWallet } = await supabase
          .from("wallets")
          .select("address")
          .eq("profile_id", user.id)
          .single();
        return new Response(
          JSON.stringify({ address: raceWallet?.address ?? address }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      return jsonError("Failed to create wallet", 500);
    }

    // 5. Update profile with wallet address for quick display
    await serviceClient
      .from("profiles")
      .update({ wallet_address: address })
      .eq("id", user.id);

    return new Response(
      JSON.stringify({ address }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("create-wallet error:", err);
    return jsonError("Internal server error", 500);
  }
});
