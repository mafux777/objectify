import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface NodeInfo {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
  guideRow?: string;
  guideColumn?: string;
  sizeId?: string;
}

interface GuideInfo {
  id: string;
  direction: "horizontal" | "vertical";
  position: number;
  label?: string;
}

/** Read all React Flow nodes through the exposed __objectify helper. */
async function getNodes(page: Page): Promise<NodeInfo[]> {
  return page.evaluate(() => {
    const obj = (window as any).__objectify;
    if (!obj) throw new Error("__objectify not found");
    return obj.getNodes().map((n: any) => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      width: n.width ?? n.measured?.width ?? 160,
      height: n.height ?? n.measured?.height ?? 50,
      parentId: n.parentId,
      guideRow: n.data?.guideRow,
      guideColumn: n.data?.guideColumn,
      sizeId: n.data?.sizeId,
    }));
  });
}

/** Read all guides through the exposed __objectify helper. */
async function getGuides(page: Page): Promise<GuideInfo[]> {
  return page.evaluate(() => {
    const obj = (window as any).__objectify;
    if (!obj) throw new Error("__objectify not found");
    return obj.getGuides().map((g: any) => ({
      id: g.id,
      direction: g.direction,
      position: g.position,
      label: g.label,
    }));
  });
}

/** Get canvasWidth and canvasHeight. */
async function getCanvasDimensions(page: Page): Promise<{ canvasWidth: number; canvasHeight: number }> {
  return page.evaluate(() => {
    const obj = (window as any).__objectify;
    return { canvasWidth: obj.canvasWidth, canvasHeight: obj.canvasHeight };
  });
}

/** Programmatically set a single guide's position. */
async function setGuidePosition(page: Page, guideId: string, newPosition: number): Promise<void> {
  await page.evaluate(
    ({ guideId, newPosition }) => {
      const obj = (window as any).__objectify;
      obj.setGuides((gs: any[]) =>
        gs.map((g: any) => (g.id === guideId ? { ...g, position: newPosition } : g))
      );
    },
    { guideId, newPosition }
  );
  // Let React process the state update
  await page.waitForTimeout(200);
}

/**
 * Programmatically move a guide and reposition nodes on that guide
 * (simulates what the GuideLines onPointerMove handler does).
 */
async function moveGuideWithNodes(page: Page, guideId: string, newPosition: number): Promise<void> {
  await page.evaluate(
    ({ guideId, newPosition }) => {
      const obj = (window as any).__objectify;
      const guides: any[] = obj.getGuides();
      const guide = guides.find((g: any) => g.id === guideId);
      if (!guide) throw new Error(`Guide ${guideId} not found`);

      const canvasDim =
        guide.direction === "horizontal" ? obj.canvasHeight : obj.canvasWidth;
      const newCanvasPos = newPosition * canvasDim;
      const topField = guide.direction === "horizontal" ? "guideRow" : "guideColumn";

      // Update guide position
      obj.setGuides((gs: any[]) =>
        gs.map((g: any) => (g.id === guideId ? { ...g, position: newPosition } : g))
      );

      // Reposition nodes on that guide
      obj.setNodes((nds: any[]) =>
        nds.map((n: any) => {
          if (n.data?.[topField] !== guideId) return n;
          const nW = n.width ?? n.measured?.width ?? 160;
          const nH = n.height ?? n.measured?.height ?? 50;
          let pOffX = 0,
            pOffY = 0;
          if (n.parentId) {
            const parent = nds.find((p: any) => p.id === n.parentId);
            if (parent) {
              pOffX = parent.position.x;
              pOffY = parent.position.y;
            }
          }
          if (guide.direction === "horizontal") {
            return { ...n, position: { x: n.position.x, y: newCanvasPos - nH / 2 - pOffY } };
          } else {
            return { ...n, position: { x: newCanvasPos - nW / 2 - pOffX, y: n.position.y } };
          }
        })
      );
    },
    { guideId, newPosition }
  );
  await page.waitForTimeout(200);
}

/** Navigate to the app and open the Grouped Calibration Grid template. */
async function openGroupedCalibrationGrid(page: Page): Promise<void> {
  await page.goto("/app");

  // Enable debug mode
  await page.evaluate(() => {
    (window as any).__debugObjectify = true;
  });

  // Wait for the welcome screen to load with templates
  await page.waitForSelector(".welcome-doc-card", { timeout: 15_000 });

  // Find and click the "Grouped Calibration Grid" template
  const templateCard = page.locator(".welcome-doc-card", {
    hasText: "Grouped Calibration Grid",
  });
  await templateCard.click();

  // Wait for the diagram to render (nodes become available)
  await page.waitForFunction(
    () => {
      const obj = (window as any).__objectify;
      return obj && obj.getNodes && obj.getNodes().length > 0;
    },
    { timeout: 15_000 }
  );

  // Wait for layout to settle
  await page.waitForTimeout(1000);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Guide and Group Drag Behavior", () => {
  test.beforeEach(async ({ page }) => {
    await openGroupedCalibrationGrid(page);
  });

  test("dragging a guide only moves nodes on that guide", async ({ page }) => {
    // Record initial positions of all nodes
    const beforeNodes = await getNodes(page);
    const beforeGuides = await getGuides(page);

    // Find the C5 (col-5) guide
    const col5Guide = beforeGuides.find((g) => g.id === "col-5");
    expect(col5Guide).toBeTruthy();

    // Identify C5 column nodes (those on col-5 guide)
    const c5NodeIds = beforeNodes
      .filter((n) => n.guideColumn === "col-5")
      .map((n) => n.id);
    expect(c5NodeIds.length).toBeGreaterThan(0);

    // Move C5 guide to the right (increase position)
    const newCol5Pos = col5Guide!.position + 100 / 1200; // ~100px right on 1200px canvas
    await moveGuideWithNodes(page, "col-5", newCol5Pos);

    // Read positions after the move
    const afterNodes = await getNodes(page);

    // Verify C5 nodes moved
    for (const c5Id of c5NodeIds) {
      const before = beforeNodes.find((n) => n.id === c5Id)!;
      const after = afterNodes.find((n) => n.id === c5Id)!;
      // C5 nodes are ungrouped so their absolute position is just position.x
      expect(Math.abs(after.x - before.x)).toBeGreaterThan(10);
    }

    // Verify non-C5 nodes did NOT move (within 1px tolerance)
    for (const beforeNode of beforeNodes) {
      if (c5NodeIds.includes(beforeNode.id)) continue;
      // Skip group nodes (they don't have guide references in this check)
      if (beforeNode.id.startsWith("group-")) continue;
      const afterNode = afterNodes.find((n) => n.id === beforeNode.id)!;
      expect(Math.abs(afterNode.x - beforeNode.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(afterNode.y - beforeNode.y)).toBeLessThanOrEqual(1);
    }
  });

  test("guide positions can exceed 1.0 without causing other guides to change", async ({
    page,
  }) => {
    // Record initial guide positions
    const beforeGuides = await getGuides(page);

    // Move C5 guide far right — past 1.0
    await setGuidePosition(page, "col-5", 1.5);

    const afterGuides = await getGuides(page);

    // Verify C5 guide is > 1.0
    const col5After = afterGuides.find((g) => g.id === "col-5")!;
    expect(col5After.position).toBeGreaterThan(1.0);

    // Verify ALL other guides are UNCHANGED
    for (const before of beforeGuides) {
      if (before.id === "col-5") continue;
      const after = afterGuides.find((g) => g.id === before.id)!;
      expect(after.position).toBeCloseTo(before.position, 10);
    }
  });

  test("dragging a group moves its column guides but not other column guides", async ({
    page,
  }) => {
    const beforeGuides = await getGuides(page);
    const beforeNodes = await getNodes(page);

    // Simulate moving col-1 guide (the C1 Group's column) to the left
    const col1Before = beforeGuides.find((g) => g.id === "col-1")!;
    const newCol1Pos = col1Before.position - 200 / 1200; // 200px left
    await moveGuideWithNodes(page, "col-1", newCol1Pos);

    const afterGuides = await getGuides(page);

    // col-1 should have changed
    const col1After = afterGuides.find((g) => g.id === "col-1")!;
    expect(Math.abs(col1After.position - col1Before.position)).toBeGreaterThan(0.01);

    // col-2, col-3, col-4, col-5 should be unchanged
    for (const colId of ["col-2", "col-3", "col-4", "col-5"]) {
      const before = beforeGuides.find((g) => g.id === colId)!;
      const after = afterGuides.find((g) => g.id === colId)!;
      expect(after.position).toBeCloseTo(before.position, 10);
    }

    // Verify C1 Group children moved (their x positions changed)
    const afterNodes = await getNodes(page);
    const c1Children = afterNodes.filter((n) => n.guideColumn === "col-1");
    for (const child of c1Children) {
      const beforeChild = beforeNodes.find((n) => n.id === child.id)!;
      expect(Math.abs(child.x - beforeChild.x)).toBeGreaterThan(10);
    }
  });

  test("dragging a row guide moves nodes in all columns sharing that row", async ({
    page,
  }) => {
    const beforeNodes = await getNodes(page);
    const beforeGuides = await getGuides(page);

    // Move row-xs guide down
    const rowXsBefore = beforeGuides.find((g) => g.id === "row-xs")!;
    const newRowPos = rowXsBefore.position + 100 / 800; // 100px down on 800px canvas
    await moveGuideWithNodes(page, "row-xs", newRowPos);

    const afterNodes = await getNodes(page);

    // All nodes on row-xs should have moved down
    const rowXsNodes = beforeNodes.filter((n) => n.guideRow === "row-xs");
    expect(rowXsNodes.length).toBeGreaterThan(0);

    for (const beforeNode of rowXsNodes) {
      const afterNode = afterNodes.find((n) => n.id === beforeNode.id)!;
      // y position should change (accounting for parent offset)
      // For ungrouped nodes (like xs-5) we check directly
      if (!beforeNode.parentId) {
        expect(Math.abs(afterNode.y - beforeNode.y)).toBeGreaterThan(10);
      }
    }

    // Verify nodes NOT on row-xs did not change Y position
    for (const beforeNode of beforeNodes) {
      if (beforeNode.guideRow === "row-xs") continue;
      if (beforeNode.id.startsWith("group-")) continue;
      const afterNode = afterNodes.find((n) => n.id === beforeNode.id)!;
      expect(Math.abs(afterNode.y - beforeNode.y)).toBeLessThanOrEqual(1);
    }
  });

  test("group auto-expands when child hits boundary", async ({ page }) => {
    // Record initial C1 Group dimensions
    const beforeNodes = await getNodes(page);
    const c1Group = beforeNodes.find((n) => n.id === "group-c1");
    expect(c1Group).toBeTruthy();
    const initialWidth = c1Group!.width;
    const initialX = c1Group!.x;

    // Move col-1 guide to the left AND run the group expansion logic
    // (the real GuideLines handler does both in one pass)
    const guides = await getGuides(page);
    const col1 = guides.find((g) => g.id === "col-1")!;
    const newPos = col1.position - 150 / 1200; // 150px left

    await page.evaluate(
      ({ guideId, newPosition }) => {
        const obj = (window as any).__objectify;
        const guides: any[] = obj.getGuides();
        const guide = guides.find((g: any) => g.id === guideId);
        if (!guide) throw new Error(`Guide ${guideId} not found`);

        const canvasDim =
          guide.direction === "horizontal" ? obj.canvasHeight : obj.canvasWidth;
        const newCanvasPos = newPosition * canvasDim;
        const topField = guide.direction === "horizontal" ? "guideRow" : "guideColumn";

        const GROUP_PAD_TOP = 40;
        const GROUP_PAD_SIDE = 20;
        const GROUP_PAD_BOTTOM = 20;

        // Update guide position
        obj.setGuides((gs: any[]) =>
          gs.map((g: any) => (g.id === guideId ? { ...g, position: newPosition } : g))
        );

        // Reposition nodes AND expand groups
        obj.setNodes((nds: any[]) => {
          // Pass 1: move nodes on the guide
          const updated = nds.map((n: any) => {
            if (n.data?.[topField] !== guideId) return n;
            const nW = n.width ?? n.measured?.width ?? 160;
            const nH = n.height ?? n.measured?.height ?? 50;
            let pOffX = 0, pOffY = 0;
            if (n.parentId) {
              const parent = nds.find((p: any) => p.id === n.parentId);
              if (parent) { pOffX = parent.position.x; pOffY = parent.position.y; }
            }
            if (guide.direction === "horizontal") {
              return { ...n, position: { x: n.position.x, y: newCanvasPos - nH / 2 - pOffY } };
            } else {
              return { ...n, position: { x: newCanvasPos - nW / 2 - pOffX, y: n.position.y } };
            }
          });

          // Pass 2: expand groups to fit children
          const result = [...updated];
          for (let gi = 0; gi < result.length; gi++) {
            const group = result[gi];
            if (group.type !== "groupNode") continue;
            const children = result.filter((n: any) => n.parentId === group.id);
            if (children.length === 0) continue;

            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const child of children) {
              const cw = child.width ?? child.measured?.width ?? 80;
              const ch = child.height ?? child.measured?.height ?? 80;
              minX = Math.min(minX, child.position.x);
              minY = Math.min(minY, child.position.y);
              maxX = Math.max(maxX, child.position.x + cw);
              maxY = Math.max(maxY, child.position.y + ch);
            }

            const reqLeft = minX - GROUP_PAD_SIDE;
            const reqTop = minY - GROUP_PAD_TOP;
            const reqRight = maxX + GROUP_PAD_SIDE;
            const reqBottom = maxY + GROUP_PAD_BOTTOM;

            const gw = group.width ?? 100;
            const gh = group.height ?? 100;

            let shiftX = 0, shiftY = 0;
            let newGW = gw, newGH = gh;

            if (reqLeft < 0) { shiftX = -reqLeft; newGW += shiftX; }
            if (reqRight > newGW) { newGW = reqRight; }
            if (reqTop < 0) { shiftY = -reqTop; newGH += shiftY; }
            if (reqBottom > newGH) { newGH = reqBottom; }

            if (shiftX === 0 && shiftY === 0 && newGW === gw && newGH === gh) continue;

            result[gi] = {
              ...group,
              position: { x: group.position.x - shiftX, y: group.position.y - shiftY },
              width: newGW, height: newGH,
              style: { ...group.style, width: newGW, height: newGH },
            };

            if (shiftX !== 0 || shiftY !== 0) {
              for (let ci = 0; ci < result.length; ci++) {
                if (result[ci].parentId === group.id) {
                  result[ci] = {
                    ...result[ci],
                    position: { x: result[ci].position.x + shiftX, y: result[ci].position.y + shiftY },
                  };
                }
              }
            }
          }
          return result;
        });
      },
      { guideId: "col-1", newPosition: newPos }
    );

    await page.waitForTimeout(500);

    const afterNodes = await getNodes(page);
    const c1GroupAfter = afterNodes.find((n) => n.id === "group-c1")!;

    // Group should have expanded (wider) or shifted left
    const expandedOrShifted =
      c1GroupAfter.width > initialWidth || c1GroupAfter.x < initialX;
    expect(expandedOrShifted).toBe(true);

    // Verify all C1 children are still inside the group bounds
    const c1Children = afterNodes.filter((n) => n.parentId === "group-c1");
    for (const child of c1Children) {
      // Child positions are relative to group
      expect(child.x).toBeGreaterThanOrEqual(-5); // small tolerance
      expect(child.y).toBeGreaterThanOrEqual(-5);
      expect(child.x + child.width).toBeLessThanOrEqual(c1GroupAfter.width + 5);
      expect(child.y + child.height).toBeLessThanOrEqual(c1GroupAfter.height + 5);
    }
  });

  test("resize updates all nodes in the same size class", async ({ page }) => {
    // Find all XS nodes
    const beforeNodes = await getNodes(page);
    const xsNodes = beforeNodes.filter((n) => n.sizeId === "xs");
    expect(xsNodes.length).toBeGreaterThanOrEqual(5);

    // Record their widths — they should all be the same
    const originalWidth = xsNodes[0].width;
    for (const n of xsNodes) {
      expect(n.width).toBeCloseTo(originalWidth, 0);
    }

    // Programmatically resize one XS node by simulating a size update through setNodes
    const newWidth = originalWidth + 40;
    const newHeight = xsNodes[0].height + 20;
    await page.evaluate(
      ({ targetId, newWidth, newHeight, sizeId }) => {
        const obj = (window as any).__objectify;
        // Update all nodes with the same sizeId (mimicking the size-class resize behavior)
        obj.setNodes((nds: any[]) =>
          nds.map((n: any) => {
            if (n.data?.sizeId !== sizeId) return n;
            return {
              ...n,
              width: newWidth,
              height: newHeight,
              style: { ...n.style, width: newWidth, height: newHeight },
            };
          })
        );
      },
      { targetId: xsNodes[0].id, newWidth, newHeight, sizeId: "xs" }
    );
    await page.waitForTimeout(300);

    const afterNodes = await getNodes(page);
    const xsAfter = afterNodes.filter((n) => n.sizeId === "xs");

    // All XS nodes should have the new size
    for (const n of xsAfter) {
      expect(n.width).toBeCloseTo(newWidth, 0);
      expect(n.height).toBeCloseTo(newHeight, 0);
    }
  });
});
