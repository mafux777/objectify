/**
 * Test script: Verify Safe counterfactual address prediction.
 *
 * Usage:
 *   npx tsx scripts/test-safe-address.ts [ownerAddress]
 *
 * This script:
 * 1. Fetches proxyCreationCode from SafeProxyFactory on Base
 * 2. Computes a counterfactual Safe address for a test salt
 * 3. Verifies the address by calling createProxyWithNonce via eth_call (dry-run)
 * 4. Optionally deploys the Safe on Base mainnet (pass --deploy flag)
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  encodePacked,
  keccak256,
  getCreate2Address,
  concat,
  toHex,
  parseAbi,
  type Hex,
} from "viem";
import { base } from "viem/chains";

// Safe v1.4.1 contract addresses on Base
const SAFE_PROXY_FACTORY =
  "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67" as const;
const SAFE_L2_SINGLETON =
  "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762" as const;
const FALLBACK_HANDLER =
  "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99" as const;
const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

const SAFE_SETUP_ABI = parseAbi([
  "function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
]);

const PROXY_FACTORY_ABI = parseAbi([
  "function proxyCreationCode() view returns (bytes)",
  "function createProxyWithNonce(address _singleton, bytes memory initializer, uint256 saltNonce) returns (address proxy)",
]);

const client = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

function computeSafeAddress(
  proxyCode: Hex,
  ownerAddress: Hex,
  saltNonce: bigint,
): { address: Hex; initializer: Hex } {
  const initializer = encodeFunctionData({
    abi: SAFE_SETUP_ABI,
    functionName: "setup",
    args: [
      [ownerAddress],
      1n,
      ZERO_ADDRESS,
      "0x",
      FALLBACK_HANDLER,
      ZERO_ADDRESS,
      0n,
      ZERO_ADDRESS,
    ],
  });

  const salt = keccak256(
    encodePacked(
      ["bytes32", "uint256"],
      [keccak256(initializer), saltNonce],
    ),
  );

  const deploymentData = concat([
    proxyCode,
    encodePacked(["uint256"], [BigInt(SAFE_L2_SINGLETON)]),
  ]);

  const address = getCreate2Address({
    from: SAFE_PROXY_FACTORY,
    salt,
    bytecodeHash: keccak256(deploymentData),
  });

  return { address, initializer };
}

async function main() {
  const ownerAddress = (process.argv[2] ??
    "0xD7e9b7124963439205B0EB9D2f919F05EF9F2919") as Hex;

  console.log("=== Safe Counterfactual Address Test ===\n");
  console.log("Owner address:", ownerAddress);
  console.log("Chain: Base (8453)");
  console.log("Safe version: v1.4.1 (L2)\n");

  // 1. Fetch proxy creation code
  console.log("Fetching proxyCreationCode from SafeProxyFactory...");
  const proxyCode = (await client.readContract({
    address: SAFE_PROXY_FACTORY,
    abi: PROXY_FACTORY_ABI,
    functionName: "proxyCreationCode",
  })) as Hex;
  console.log(
    `  proxyCreationCode: ${proxyCode.slice(0, 20)}...${proxyCode.slice(-8)} (${(proxyCode.length - 2) / 2} bytes)\n`,
  );

  // 2. Compute addresses for a few test user IDs
  const testUserIds = [
    "00000000-0000-0000-0000-000000000001",
    "9c217141-abcd-4321-9999-123456789abc",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
  ];

  console.log("Computing counterfactual Safe addresses:\n");

  for (const userId of testUserIds) {
    const saltNonce = BigInt(keccak256(toHex(userId)));
    const { address, initializer } = computeSafeAddress(
      proxyCode,
      ownerAddress,
      saltNonce,
    );

    console.log(`  User: ${userId}`);
    console.log(`  Salt nonce: ${saltNonce}`);
    console.log(`  Safe address: ${address}`);

    // 3. Verify via eth_call (simulate createProxyWithNonce)
    try {
      const simResult = await client.simulateContract({
        address: SAFE_PROXY_FACTORY,
        abi: PROXY_FACTORY_ABI,
        functionName: "createProxyWithNonce",
        args: [SAFE_L2_SINGLETON, initializer, saltNonce],
      });

      const onChainAddress = simResult.result as Hex;
      const match = onChainAddress.toLowerCase() === address.toLowerCase();
      console.log(`  On-chain simulation: ${onChainAddress}`);
      console.log(`  Match: ${match ? "YES" : "NO *** MISMATCH ***"}`);
    } catch (err: any) {
      // If Safe already deployed at this address, simulation reverts
      if (err.message?.includes("revert")) {
        console.log(
          `  Simulation reverted (Safe may already exist at this address)`,
        );
      } else {
        console.log(`  Simulation error: ${err.message}`);
      }
    }

    // Check if already deployed
    const code = await client.getCode({ address: address as `0x${string}` });
    if (code && code !== "0x") {
      console.log(`  Status: ALREADY DEPLOYED on Base`);
    } else {
      console.log(`  Status: Not yet deployed (counterfactual)`);
    }

    console.log();
  }

  console.log("View any address on BaseScan: https://basescan.org/address/<address>");
}

main().catch(console.error);
