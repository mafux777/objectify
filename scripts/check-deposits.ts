/**
 * Check USDC deposits and deploy Safe contracts on Base.
 *
 * Reads the master owner mnemonic from 1Password CLI.
 * Checks USDC balance at Safe addresses and deploys if needed.
 *
 * Usage:
 *   npx tsx scripts/check-deposits.ts                    # check all wallets
 *   npx tsx scripts/check-deposits.ts --address 0x...    # check specific address
 *   npx tsx scripts/check-deposits.ts --dry-run          # check only, no deploy
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  encodePacked,
  keccak256,
  toHex,
  parseAbi,
  formatUnits,
  type Hex,
  type Address,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

// Load .env manually (avoids dotenv dependency)
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


// ── Contract addresses ──

const SAFE_PROXY_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67" as const;
const SAFE_L2_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762" as const;
const FALLBACK_HANDLER = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

// ── ABIs ──

const SAFE_SETUP_ABI = parseAbi([
  "function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
]);

const PROXY_FACTORY_ABI = parseAbi([
  "function proxyCreationCode() view returns (bytes)",
  "function createProxyWithNonce(address _singleton, bytes memory initializer, uint256 saltNonce) returns (address proxy)",
]);

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
]);

// ── Parse CLI args ──

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const addressIdx = args.indexOf("--address");
const filterAddress = addressIdx !== -1 ? args[addressIdx + 1] : null;

// ── 1Password: read mnemonic ──

function getMnemonic(): string {
  console.log("Reading mnemonic from 1Password...");
  try {
    const mnemonic = execSync(
      'op read "op://Private/objectify/Wiederherstellungsphrase"',
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
    if (!mnemonic || mnemonic.split(" ").length < 12) {
      throw new Error("Invalid mnemonic returned from 1Password");
    }
    console.log(`  Got ${mnemonic.split(" ").length}-word mnemonic\n`);
    return mnemonic;
  } catch (err: any) {
    console.error("Failed to read from 1Password. Make sure you're signed in:");
    console.error("  eval $(op signin)");
    process.exit(1);
  }
}

// ── Supabase: list wallets ──

interface WalletRow {
  id: string;
  profile_id: string;
  address: string;
  salt_nonce: string;
  deployed_at: string | null;
  deployed_tx_hash: string | null;
}

async function getWallets(): Promise<WalletRow[]> {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error(
      "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env",
    );
    console.error("Add SUPABASE_SERVICE_ROLE_KEY to .env for DB access.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey);
  let query = supabase
    .from("wallets")
    .select("id, profile_id, address, salt_nonce, deployed_at, deployed_tx_hash");

  if (filterAddress) {
    query = query.eq("address", filterAddress);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Supabase query error:", error.message);
    process.exit(1);
  }

  return (data ?? []) as WalletRow[];
}

async function updateWalletDeployed(
  walletId: string,
  txHash: string,
): Promise<void> {
  const url = process.env.VITE_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, serviceKey);

  const { error } = await supabase
    .from("wallets")
    .update({
      deployed_at: new Date().toISOString(),
      deployed_tx_hash: txHash,
    })
    .eq("id", walletId);

  if (error) {
    console.error(`  Warning: DB update failed: ${error.message}`);
  }
}

// ── Main ──

async function main() {
  console.log("=== Check Deposits & Deploy Safes ===\n");
  if (dryRun) console.log("DRY RUN — no transactions will be sent\n");

  // Set up viem clients
  const rpcUrl = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  // Read mnemonic and derive account (only if not dry-run, or always for address display)
  const mnemonic = getMnemonic();
  const account = mnemonicToAccount(mnemonic);
  console.log(`Deployer address: ${account.address}`);

  // Check deployer ETH balance
  const ethBalance = await publicClient.getBalance({ address: account.address });
  console.log(`Deployer ETH balance: ${formatUnits(ethBalance, 18)} ETH\n`);

  if (!dryRun && ethBalance === 0n) {
    console.error("Deployer has no ETH for gas. Fund it first.");
    process.exit(1);
  }

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl),
  });

  // Get wallets from Supabase
  const wallets = await getWallets();
  console.log(`Found ${wallets.length} wallet(s)\n`);

  if (wallets.length === 0) {
    console.log("No wallets to check.");
    return;
  }

  let deployed = 0;
  let skipped = 0;
  let alreadyDeployed = 0;

  for (const wallet of wallets) {
    console.log(`── Wallet: ${wallet.address} ──`);
    console.log(`   Profile: ${wallet.profile_id}`);

    // Check USDC balance
    const usdcBalance = await publicClient.readContract({
      address: USDC_BASE,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [wallet.address as Address],
    });
    console.log(`   USDC balance: ${formatUnits(usdcBalance, 6)} USDC`);

    // Check if Safe is deployed
    const code = await publicClient.getCode({
      address: wallet.address as Address,
    });
    const isDeployed = !!code && code !== "0x";

    if (isDeployed) {
      console.log(`   Safe: DEPLOYED`);
      alreadyDeployed++;

      // Update DB if not already recorded
      if (!wallet.deployed_at) {
        console.log(`   Updating DB (was not recorded)...`);
        await updateWalletDeployed(wallet.id, "deployed-externally");
      }
      console.log();
      continue;
    }

    console.log(`   Safe: NOT DEPLOYED`);

    if (usdcBalance === 0n) {
      console.log(`   Skipping (no balance)`);
      skipped++;
      console.log();
      continue;
    }

    if (dryRun) {
      console.log(`   Would deploy (dry-run)`);
      skipped++;
      console.log();
      continue;
    }

    // Deploy the Safe
    console.log(`   Deploying Safe...`);

    const ownerAddress =
      process.env.MASTER_SAFE_OWNER_ADDRESS ?? account.address;

    // Build initializer (same as create-wallet edge function)
    const initializer = encodeFunctionData({
      abi: SAFE_SETUP_ABI,
      functionName: "setup",
      args: [
        [ownerAddress as Address],
        1n,
        ZERO_ADDRESS,
        "0x",
        FALLBACK_HANDLER,
        ZERO_ADDRESS,
        0n,
        ZERO_ADDRESS,
      ],
    });

    const saltNonce = BigInt(wallet.salt_nonce);

    // Simulate first to catch errors
    try {
      await publicClient.simulateContract({
        address: SAFE_PROXY_FACTORY,
        abi: PROXY_FACTORY_ABI,
        functionName: "createProxyWithNonce",
        args: [SAFE_L2_SINGLETON, initializer, saltNonce],
        account: account.address,
      });
    } catch (err: any) {
      console.error(`   Simulation failed: ${err.shortMessage ?? err.message}`);
      skipped++;
      console.log();
      continue;
    }

    // Send the transaction
    try {
      const txHash = await walletClient.writeContract({
        address: SAFE_PROXY_FACTORY,
        abi: PROXY_FACTORY_ABI,
        functionName: "createProxyWithNonce",
        args: [SAFE_L2_SINGLETON, initializer, saltNonce],
      });

      console.log(`   Tx sent: ${txHash}`);
      console.log(`   Waiting for confirmation...`);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      });

      if (receipt.status === "success") {
        console.log(
          `   DEPLOYED in block ${receipt.blockNumber} (gas: ${receipt.gasUsed})`,
        );
        console.log(
          `   BaseScan: https://basescan.org/tx/${txHash}`,
        );
        await updateWalletDeployed(wallet.id, txHash);
        deployed++;
      } else {
        console.error(`   Transaction REVERTED`);
        skipped++;
      }
    } catch (err: any) {
      console.error(
        `   Deploy failed: ${err.shortMessage ?? err.message}`,
      );
      skipped++;
    }

    console.log();
  }

  console.log("=== Summary ===");
  console.log(`  Deployed: ${deployed}`);
  console.log(`  Already deployed: ${alreadyDeployed}`);
  console.log(`  Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
