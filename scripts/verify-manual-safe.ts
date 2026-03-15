/**
 * Verify that the manual (no-viem) Safe address computation
 * produces the same results as the viem-based implementation.
 */

// ── viem-based implementation (reference) ──
import {
  encodeFunctionData,
  encodePacked,
  keccak256 as viemKeccak256,
  getCreate2Address,
  concat,
  toHex as viemToHex,
  parseAbi,
  type Hex,
} from "viem";

// ── manual implementation (@noble/hashes only) ──
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

const SAFE_PROXY_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
const SAFE_L2_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const FALLBACK_HANDLER = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// ── Manual utility functions (same as edge function) ──

function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const padded = clean.length % 2 ? "0" + clean : clean;
  return hexToBytes(padded);
}

function keccak256(hex: string): string {
  return "0x" + bytesToHex(keccak_256(fromHex(hex)));
}

function keccak256Utf8(text: string): string {
  return "0x" + bytesToHex(keccak_256(new TextEncoder().encode(text)));
}

function stringToHex(str: string): string {
  return "0x" + bytesToHex(new TextEncoder().encode(str));
}

function pad32(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return clean.padStart(64, "0");
}

function concatHex(...parts: string[]): string {
  return "0x" + parts.map((h) => (h.startsWith("0x") ? h.slice(2) : h)).join("");
}

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

function encodeSetupCall(ownerAddress: string): string {
  const selector = keccak256Utf8(
    "setup(address[],uint256,address,bytes,address,address,uint256,address)",
  ).slice(0, 10);

  const ZERO32 = "0".repeat(64);
  const ONE32 = "0".repeat(63) + "1";

  const head = [
    pad32("100"),
    ONE32,
    ZERO32,
    pad32("140"),
    pad32(FALLBACK_HANDLER),
    ZERO32,
    ZERO32,
    ZERO32,
  ].join("");

  const ownersTail = ONE32 + pad32(ownerAddress);
  const dataTail = ZERO32;

  return "0x" + selector.slice(2) + head + ownersTail + dataTail;
}

function manualComputeSafeAddress(
  proxyCode: string,
  ownerAddress: string,
  saltNonce: bigint,
): string {
  const initializer = encodeSetupCall(ownerAddress);
  const initHash = keccak256(initializer).slice(2);
  const noncePadded = saltNonce.toString(16).padStart(64, "0");
  const salt = keccak256("0x" + initHash + noncePadded);
  const singletonPadded = pad32(SAFE_L2_SINGLETON);
  const deploymentData = concatHex(proxyCode, "0x" + singletonPadded);
  const factory = SAFE_PROXY_FACTORY.slice(2).toLowerCase();
  const initCodeHash = keccak256(deploymentData).slice(2);
  const create2Hash = keccak256(
    "0xff" + factory + salt.slice(2) + initCodeHash,
  );
  const rawAddress = "0x" + create2Hash.slice(create2Hash.length - 40);
  return checksumAddress(rawAddress);
}

// ── viem-based reference ──

const SAFE_SETUP_ABI = parseAbi([
  "function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
]);

function viemComputeSafeAddress(
  proxyCode: Hex,
  ownerAddress: Hex,
  saltNonce: bigint,
): Hex {
  const initializer = encodeFunctionData({
    abi: SAFE_SETUP_ABI,
    functionName: "setup",
    args: [
      [ownerAddress],
      1n,
      ZERO_ADDRESS,
      "0x",
      FALLBACK_HANDLER as Hex,
      ZERO_ADDRESS,
      0n,
      ZERO_ADDRESS,
    ],
  });

  const salt = viemKeccak256(
    encodePacked(
      ["bytes32", "uint256"],
      [viemKeccak256(initializer), saltNonce],
    ),
  );

  const deploymentData = concat([
    proxyCode,
    encodePacked(["uint256"], [BigInt(SAFE_L2_SINGLETON)]),
  ]);

  return getCreate2Address({
    from: SAFE_PROXY_FACTORY as Hex,
    salt,
    bytecodeHash: viemKeccak256(deploymentData),
  });
}

// ── Test ──

async function main() {
  const ownerAddress = "0xD7e9b7124963439205B0EB9D2f919F05EF9F2919";

  // Fetch proxyCreationCode from Base (same as both implementations use)
  const { createPublicClient, http } = await import("viem");
  const { base } = await import("viem/chains");

  const client = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  console.log("Fetching proxyCreationCode from Base...");
  const proxyCode = (await client.readContract({
    address: SAFE_PROXY_FACTORY as Hex,
    abi: parseAbi(["function proxyCreationCode() view returns (bytes)"]),
    functionName: "proxyCreationCode",
  })) as Hex;
  console.log(`  Got ${(proxyCode.length - 2) / 2} bytes\n`);

  // Test intermediate values first
  console.log("=== Intermediate Value Comparison ===\n");

  const manualInitializer = encodeSetupCall(ownerAddress);
  const viemInitializer = encodeFunctionData({
    abi: SAFE_SETUP_ABI,
    functionName: "setup",
    args: [
      [ownerAddress as Hex],
      1n,
      ZERO_ADDRESS,
      "0x",
      FALLBACK_HANDLER as Hex,
      ZERO_ADDRESS,
      0n,
      ZERO_ADDRESS,
    ],
  });

  console.log("Initializer match:", manualInitializer.toLowerCase() === viemInitializer.toLowerCase());
  if (manualInitializer.toLowerCase() !== viemInitializer.toLowerCase()) {
    console.log("  Manual:", manualInitializer.slice(0, 80) + "...");
    console.log("  Viem:  ", viemInitializer.slice(0, 80) + "...");
    // Find first difference
    for (let i = 0; i < Math.max(manualInitializer.length, viemInitializer.length); i++) {
      if (manualInitializer[i]?.toLowerCase() !== viemInitializer[i]?.toLowerCase()) {
        console.log(`  First diff at char ${i}: manual='${manualInitializer[i]}' viem='${viemInitializer[i]}'`);
        console.log(`  Context: ...${manualInitializer.slice(Math.max(0, i - 10), i + 10)}...`);
        console.log(`  Context: ...${viemInitializer.slice(Math.max(0, i - 10), i + 10)}...`);
        break;
      }
    }
  }

  // Test toHex equivalence
  const manualUserHex = stringToHex("test-user-id");
  const viemUserHex = viemToHex("test-user-id");
  console.log("stringToHex match:", manualUserHex === viemUserHex);

  // Test keccak256 equivalence
  const manualHash = keccak256(manualUserHex);
  const viemHash = viemKeccak256(viemUserHex as Hex);
  console.log("keccak256 match:", manualHash === viemHash);

  console.log("\n=== Address Comparison ===\n");

  const testUserIds = [
    "00000000-0000-0000-0000-000000000001",
    "9c217141-abcd-4321-9999-123456789abc",
    "ffffffff-ffff-ffff-ffff-ffffffffffff",
  ];

  let allMatch = true;

  for (const userId of testUserIds) {
    const saltNonce = BigInt(viemKeccak256(viemToHex(userId) as Hex));
    const manualSaltNonce = BigInt(keccak256(stringToHex(userId)));

    const viemAddr = viemComputeSafeAddress(
      proxyCode,
      ownerAddress as Hex,
      saltNonce,
    );
    const manualAddr = manualComputeSafeAddress(
      proxyCode,
      ownerAddress,
      manualSaltNonce,
    );

    const match = viemAddr === manualAddr;
    allMatch = allMatch && match;

    console.log(`User: ${userId}`);
    console.log(`  Salt nonce match: ${saltNonce === manualSaltNonce}`);
    console.log(`  Viem:   ${viemAddr}`);
    console.log(`  Manual: ${manualAddr}`);
    console.log(`  Match:  ${match ? "YES" : "NO *** MISMATCH ***"}`);
    console.log();
  }

  console.log(allMatch ? "ALL TESTS PASSED" : "SOME TESTS FAILED");
  process.exit(allMatch ? 0 : 1);
}

main().catch(console.error);
