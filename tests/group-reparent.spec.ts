/**
 * Group Reparenting E2E Tests
 *
 * Tests moving nodes between groups via Alt+drag.
 * Uses a multi-layered "System Layers" diagram fixture.
 *
 * These tests document the DESIRED behavior. Some may fail until
 * the reparenting feature is implemented in FlowDiagram.tsx.
 */

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

const BASE = "http://localhost:5173";
const FIXTURE_PATH = join(__dirname, "fixtures", "system-layers.json");

// ── Helpers (shared with editor.spec.ts) ──

async function waitForEditor(page: Page) {
  await page.locator("h1:has-text('Objectify')").waitFor({ timeout: 15_000 });
  await page
    .locator("[title^='0x'], span:has-text('User:')")
    .first()
    .waitFor({ timeout: 20_000 });
}

async function waitForNode(page: Page, nodeId: string, timeout = 15_000) {
  await page
    .locator(`.react-flow__node[data-id="${nodeId}"]`)
    .waitFor({ state: "attached", timeout });
}

async function getNodeRect(page: Page, nodeId: string) {
  return page.evaluate((id) => {
    const node = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
    if (!node) return null;
    const flow = document.querySelector(".react-flow") as HTMLElement;
    const nr = node.getBoundingClientRect();
    const fr = flow.getBoundingClientRect();
    return {
      x: nr.left - fr.left,
      y: nr.top - fr.top,
      width: nr.width,
      height: nr.height,
      centerX: nr.left - fr.left + nr.width / 2,
      centerY: nr.top - fr.top + nr.height / 2,
    };
  }, nodeId);
}

/** Get the parentId of a node from React Flow's internal state */
async function getNodeParent(page: Page, nodeId: string): Promise<string | null> {
  return page.evaluate((id) => {
    const api = (window as any).__objectify;
    if (!api?.getNodes) return null;
    const node = api.getNodes().find((n: any) => n.id === id);
    return node?.parentId ?? null;
  }, nodeId);
}

async function dragNode(
  page: Page,
  nodeId: string,
  dx: number,
  dy: number,
  modifiers?: { alt?: boolean; shift?: boolean }
) {
  const node = page.locator(`.react-flow__node[data-id="${nodeId}"]`);
  const box = await node.boundingBox();
  if (!box) throw new Error(`Node ${nodeId} not found`);

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  const keys: string[] = [];
  if (modifiers?.alt) keys.push("Alt");
  if (modifiers?.shift) keys.push("Shift");

  for (const k of keys) await page.keyboard.down(k);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      startX + (dx * i) / steps,
      startY + (dy * i) / steps
    );
  }
  await page.mouse.up();

  for (const k of keys) await page.keyboard.up(k);
  await page.waitForTimeout(500);
}

async function importFixture(page: Page, fixturePath: string) {
  const json = readFileSync(fixturePath, "utf-8");

  await page.locator(".welcome-screen").waitFor({ timeout: 10_000 });
  await page.waitForFunction(
    () => (window as any).__objectifyTest?.createDocument,
    { timeout: 5_000 }
  );

  // Insert into Supabase and open
  const docId = await page.evaluate(async (jsonStr) => {
    const spec = JSON.parse(jsonStr);
    const { supabase } = await import("/src/lib/supabase.ts");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No user");
    const id = crypto.randomUUID();
    const { error } = await supabase.from("conversions").insert({
      id, user_id: user.id, spec, status: "completed",
    });
    if (error) throw new Error(`Insert failed: ${error.message}`);
    return id;
  }, json);

  await page.reload();
  await page.waitForTimeout(2000);
  const savedDiagram = page.locator("text=System Layers").first();
  await savedDiagram.waitFor({ timeout: 10_000 });
  await savedDiagram.click();
  await page.waitForTimeout(1000);
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: `test-results/reparent-${name}.png`,
    fullPage: false,
  });
}

// ── Tests ──

test.describe("Group Reparenting", () => {
  test.describe.configure({ mode: "serial" });

  async function setupDiagram(page: Page) {
    await page.goto(`${BASE}/app`);
    await waitForEditor(page);
    await importFixture(page, FIXTURE_PATH);
    await waitForNode(page, "payment-svc");
    await page.waitForTimeout(500);
  }

  test.beforeAll(async () => {
    const { mkdirSync } = await import("fs");
    try { mkdirSync("test-results", { recursive: true }); } catch {}
  });

  test("R0. load system layers fixture", async ({ page }) => {
    await setupDiagram(page);

    // Verify key nodes
    for (const id of ["system", "presentation", "business", "data-layer",
      "web-ui", "api-gateway", "payment-svc", "user-db", "cache"]) {
      await waitForNode(page, id);
    }

    // Verify Payment Svc is in Business Logic group
    const parent = await getNodeParent(page, "payment-svc");
    expect(parent).toBe("business");

    await screenshot(page, "R0-initial");
  });

  test("R1. normal drag keeps node inside parent group", async ({ page }) => {
    await setupDiagram(page);

    const dataLayerRect = await getNodeRect(page, "data-layer");

    // Try to drag Payment Svc downward toward Data Layer (without Alt)
    await dragNode(page, "payment-svc", 0, 200);

    // Node should still be in Business Logic
    const parent = await getNodeParent(page, "payment-svc");
    expect(parent).toBe("business");

    await screenshot(page, "R1-trapped-in-parent");
  });

  test("R2. alt+drag reparents node to another group", async ({ page }) => {
    await setupDiagram(page);

    // Verify initial parent
    expect(await getNodeParent(page, "payment-svc")).toBe("business");

    const paymentRect = await getNodeRect(page, "payment-svc");
    const dataRect = await getNodeRect(page, "data-layer");

    await screenshot(page, "R2-before");

    // Alt+drag Payment Svc into the Data Layer center
    // Use full distance to ensure we land well inside the Data Layer
    const dx = dataRect!.centerX - paymentRect!.centerX;
    const dy = dataRect!.centerY - paymentRect!.centerY;
    await dragNode(page, "payment-svc", dx, dy, { alt: true });

    await screenshot(page, "R2-after");

    // Node should now be in Data Layer
    const newParent = await getNodeParent(page, "payment-svc");
    expect(newParent).toBe("data-layer");
  });

  test("R3. reparent shows toast message", async ({ page }) => {
    await setupDiagram(page);

    const paymentRect = await getNodeRect(page, "payment-svc");
    const dataRect = await getNodeRect(page, "data-layer");

    const dx = dataRect!.centerX - paymentRect!.centerX;
    const dy = dataRect!.centerY - paymentRect!.centerY;
    await dragNode(page, "payment-svc", dx, dy, { alt: true });

    // Should see a toast/summary about the reparent
    const toast = page.locator("text=/Payment Svc.*Data Layer/i");
    await expect(toast).toBeVisible({ timeout: 3_000 });

    await screenshot(page, "R3-toast");
  });

  test("R4. alt+drag to empty space makes node top-level", async ({ page }) => {
    await setupDiagram(page);

    expect(await getNodeParent(page, "payment-svc")).toBe("business");

    // Alt+drag Payment Svc far outside all groups
    await dragNode(page, "payment-svc", -300, -200, { alt: true });

    const newParent = await getNodeParent(page, "payment-svc");
    // Should be null (top-level) or "system" (outermost container)
    expect(newParent === null || newParent === "system").toBeTruthy();

    await screenshot(page, "R4-orphan");
  });

  test("R5. edges survive reparenting", async ({ page }) => {
    await setupDiagram(page);

    // Payment Svc has edges: order-engine→payment-svc and payment-svc→cache
    await expect(page.locator('.react-flow__edge[data-id="e3"]')).toBeAttached();
    await expect(page.locator('.react-flow__edge[data-id="e6"]')).toBeAttached();

    // Reparent
    const paymentRect = await getNodeRect(page, "payment-svc");
    const dataRect = await getNodeRect(page, "data-layer");
    const dx = dataRect!.centerX - paymentRect!.centerX;
    const dy = dataRect!.centerY - paymentRect!.centerY;
    await dragNode(page, "payment-svc", dx, dy, { alt: true });

    // Edges should still exist
    await expect(page.locator('.react-flow__edge[data-id="e3"]')).toBeAttached();
    await expect(page.locator('.react-flow__edge[data-id="e6"]')).toBeAttached();

    await screenshot(page, "R5-edges-preserved");
  });
});
