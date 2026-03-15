# Editor Layout & Interaction Test Plan

## Test Fixture: Fruit Grid Diagram

A 3x3 grid of boxes with three fruit categories, each column a different color:

|          | Apples (red) | Oranges (orange) | Bananas (yellow) |
|----------|-------------|-----------------|-----------------|
| **Row 1** | Fuji        | Navel           | Cavendish       |
| **Row 2** | Granny Smith| Valencia        | Plantain        |
| **Row 3** | Honeycrisp  | Blood Orange    | Lady Finger     |

- 3 horizontal guides (Row 1, Row 2, Row 3)
- 3 vertical guides (Apples, Oranges, Bananas)
- Edges connecting each row left→right (6 total)
- All edges start as `smoothstep` routing

---

## Test Scenarios

### A. Guide-Aligned Dragging

| # | Action | Expected | Screenshot |
|---|--------|----------|------------|
| A1 | Drag "Fuji" downward | All 3 boxes on Row 1 move down together | Before + After |
| A2 | Drag "Fuji" rightward | All 3 boxes on Apples column move right together | Before + After |
| A3 | Drag "Valencia" to a new position | Row 2 and Oranges column guides update, siblings follow | After |

### B. Alt+Drag (Guide Detachment)

| # | Action | Expected | Screenshot |
|---|--------|----------|------------|
| B1 | Alt+drag "Granny Smith" away from Row 2 | Gets its own guides ("Granny Smith Row", "Granny Smith Col") | After |
| B2 | Alt+drag "Granny Smith" back near Row 2 | If within MERGE_THRESHOLD (2%), guides consolidate back | After |
| B3 | Alt+drag creates short labels | New guide labels derived from node label, not very long | Inspect label text |

### C. Grid Expansion (3x3 → 4x4 with gaps)

| # | Action | Expected | Screenshot |
|---|--------|----------|------------|
| C1 | Alt+drag 4 boxes to create a 4th row and column | 4x4 guide grid forms | After |
| C2 | Verify gaps in grid | Some intersections empty, guides still aligned | Full diagram |

### D. Column Swapping by Dragging

| # | Action | Expected | Screenshot |
|---|--------|----------|------------|
| D1 | Drag Apples column guide past Oranges column | Column positions swap | Before + After |
| D2 | Colors verify: red boxes now in middle position | Visual check via screenshot | After |

### E. Box Resizing

| # | Action | Expected | Screenshot |
|---|--------|----------|------------|
| E1 | Select "Fuji", resize wider | "Fuji" gets wider | After |
| E2 | Normal resize: all boxes with same sizeId resize together | Siblings pulse highlight | After |
| E3 | Alt+resize "Fuji": only Fuji changes, gets new sizeId | Other boxes unchanged | After |

### F. Connector Routing Types

| # | Action | Expected | Screenshot |
|---|--------|----------|------------|
| F1 | Verify initial edges are smoothstep | Rounded 90° bends | Screenshot |
| F2 | Change an edge to "straight" | Direct line, no bends | After |
| F3 | Change an edge to "bezier" | Smooth S-curve | After |
| F4 | Change an edge to "step" | Sharp 90° corners | After |

### G. Persistence Across Tabs

| # | Action | Expected | Screenshot |
|---|--------|----------|------------|
| G1 | Move a box, switch to another document tab | Edit saved | — |
| G2 | Switch back to original tab | Box position preserved | After |
| G3 | Resize a box, switch tabs, switch back | New size preserved | After |
| G4 | Change connector type, switch tabs, switch back | Routing type preserved | After |

---

## Running Tests

```bash
# Prerequisites: supabase running, dev server on localhost:5173
supabase db reset
npx playwright test tests/editor.spec.ts
npx playwright test tests/editor.spec.ts --headed  # watch it run
```

Screenshots saved to `test-results/` on every test step.
