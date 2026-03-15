/**
 * Withdraw USDC from a user's Safe to the master wallet and credit the user.
 *
 * Executes a Safe transaction signed by the master owner, then updates
 * the user's credit balance in Supabase.
 *
 * Usage:
 *   npx tsx scripts/withdraw-usdc.ts --address 0x... --amount 0.5
 *   npx tsx scripts/withdraw-usdc.ts --address 0x... --amount 0.5 --dry-run
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseAbi,
  parseUnits,
  formatUnits,
  type Address,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

// Load .env
try {
  const envFile = readFileSync(new URL("../.env", import.meta.url), "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

// ── Constants ──

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const CREDITS_PER_USDC = 10;

// ── ABIs ──

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

const SAFE_ABI = parseAbi([
  "function nonce() view returns (uint256)",
  "function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures) payable returns (bool success)",
]);

// ── Parse CLI args ──

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

function getArg(name: string): string | null {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

const safeAddress = getArg("--address");
const amountStr = getArg("--amount");

if (!safeAddress || !amountStr) {
  console.error("Usage: npx tsx scripts/withdraw-usdc.ts --address 0x... --amount 0.5");
  process.exit(1);
}

const amountUsdc = parseUnits(amountStr, 6); // USDC has 6 decimals

// ── 1Password ──

function getMnemonic(): string {
  console.log("Reading mnemonic from 1Password...");
  try {
    const mnemonic = execSync(
      'op read "op://Private/objectify/Wiederherstellungsphrase"',
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
    if (!mnemonic || mnemonic.split(" ").length < 12) {
      throw new Error("Invalid mnemonic");
    }
    return mnemonic;
  } catch {
    console.error("Failed to read from 1Password. Run: eval $(op signin)");
    process.exit(1);
  }
}

// ── Main ──

async function main() {
  console.log("=== Withdraw USDC from Safe ===\n");
  console.log(`Safe:   ${safeAddress}`);
  console.log(`Amount: ${formatUnits(amountUsdc, 6)} USDC`);
  console.log(`Rate:   ${CREDITS_PER_USDC} credits per USDC`);
  console.log(`Credits: ${Number(amountUsdc) / 1_000_000 * CREDITS_PER_USDC}`);
  if (dryRun) console.log("\nDRY RUN — no transactions will be sent");
  console.log();

  const rpcUrl = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
  const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });

  // Set up account
  const mnemonic = getMnemonic();
  const account = mnemonicToAccount(mnemonic);
  console.log(`Owner:  ${account.address}\n`);

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl),
  });

  // Check USDC balance in the Safe
  const balance = await publicClient.readContract({
    address: USDC_BASE,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [safeAddress as Address],
  });
  console.log(`Safe USDC balance: ${formatUnits(balance, 6)} USDC`);

  if (balance < amountUsdc) {
    console.error(`Insufficient balance. Have ${formatUnits(balance, 6)}, need ${formatUnits(amountUsdc, 6)}`);
    process.exit(1);
  }

  // Get Safe nonce
  const safeNonce = await publicClient.readContract({
    address: safeAddress as Address,
    abi: SAFE_ABI,
    functionName: "nonce",
  });
  console.log(`Safe nonce: ${safeNonce}`);

  // Build the inner USDC transfer call
  const transferData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [account.address, amountUsdc], // transfer to master owner
  });

  // Sign the Safe transaction using EIP-712
  const signature = await account.signTypedData({
    domain: {
      chainId: 8453,
      verifyingContract: safeAddress as Address,
    },
    types: {
      SafeTx: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
        { name: "operation", type: "uint8" },
        { name: "safeTxGas", type: "uint256" },
        { name: "baseGas", type: "uint256" },
        { name: "gasPrice", type: "uint256" },
        { name: "gasToken", type: "address" },
        { name: "refundReceiver", type: "address" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "SafeTx",
    message: {
      to: USDC_BASE,
      value: 0n,
      data: transferData,
      operation: 0,
      safeTxGas: 0n,
      baseGas: 0n,
      gasPrice: 0n,
      gasToken: ZERO_ADDRESS,
      refundReceiver: ZERO_ADDRESS,
      nonce: safeNonce,
    },
  });

  console.log(`Signature: ${signature.slice(0, 20)}...`);

  if (dryRun) {
    console.log("\nDry run complete. Would execute Safe transaction and credit user.");
    return;
  }

  // Execute the Safe transaction (sent from the owner, who pays gas)
  console.log("\nExecuting Safe transaction...");
  const txHash = await walletClient.writeContract({
    address: safeAddress as Address,
    abi: SAFE_ABI,
    functionName: "execTransaction",
    args: [
      USDC_BASE,           // to: USDC contract
      0n,                   // value: 0 ETH
      transferData,         // data: transfer(owner, amount)
      0,                    // operation: Call
      0n,                   // safeTxGas
      0n,                   // baseGas
      0n,                   // gasPrice
      ZERO_ADDRESS,         // gasToken
      ZERO_ADDRESS,         // refundReceiver
      signature,            // signatures
    ],
  });

  console.log(`Tx sent: ${txHash}`);
  console.log("Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 60_000,
  });

  if (receipt.status !== "success") {
    console.error("Transaction REVERTED");
    process.exit(1);
  }

  console.log(`CONFIRMED in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`);
  console.log(`BaseScan: https://basescan.org/tx/${txHash}`);

  // Credit the user in Supabase
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.warn("\nNo SUPABASE_SERVICE_ROLE_KEY — skipping credit update.");
    return;
  }

  const supabase = createClient(url, serviceKey);

  // Find the user profile via wallet address
  const { data: wallet } = await supabase
    .from("wallets")
    .select("profile_id")
    .eq("address", safeAddress)
    .single();

  if (!wallet) {
    console.error("Wallet not found in DB — cannot credit user.");
    return;
  }

  const creditsToAdd = Math.floor(Number(amountUsdc) / 1_000_000 * CREDITS_PER_USDC);

  // Get current credits
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits")
    .eq("id", wallet.profile_id)
    .single();

  const currentCredits = profile?.credits ?? 0;
  const newCredits = currentCredits + creditsToAdd;

  const { error } = await supabase
    .from("profiles")
    .update({ credits: newCredits })
    .eq("id", wallet.profile_id);

  if (error) {
    console.error(`Credit update failed: ${error.message}`);
  } else {
    console.log(`\nCredited ${creditsToAdd} credits (${currentCredits} → ${newCredits})`);
  }

  // Verify final USDC balance
  const finalBalance = await publicClient.readContract({
    address: USDC_BASE,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [safeAddress as Address],
  });
  console.log(`Safe remaining USDC: ${formatUnits(finalBalance, 6)}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
