# MindGraph Layout System Guide

## Overview

The MindGraph layout system uses **D3's hierarchical cluster layout** algorithm to position mind map nodes in a tree structure. This guide explains how the layout works and how to tune it for different spacing requirements.

---

## Architecture

### Core Components

1. **layoutHelpers.ts** - Main layout calculation engine
2. **D3-hierarchy** - Tree positioning algorithm (`d3.cluster()`)
3. **React Flow** - Canvas rendering with Bezier curve edges

### Data Flow

```
Flat NodeInstance array
  ↓
buildHierarchyTree() - Converts to tree structure
  ↓
applyBalancedLayout() - Calculates positions using D3
  ↓
React Flow nodes with (x, y) coordinates
```

---

## Key Configuration Variables

All layout parameters are centralized in `LAYOUT_CONFIG`:

```typescript
const LAYOUT_CONFIG = {
	nodeMaxWidth: 400, // Maximum node width in pixels
	lineHeight: 24, // Text line height in pixels
	basePadding: 20, // Base padding for height calculation
	horizontalSpacing: 280, // Fixed spacing between depth levels
	verticalSpacingMultiplier: 0.5, // Controls vertical compactness
	minVerticalSeparation: 0.01, // Base separation between siblings
};
```

---

## Critical Tuning Variables

All critical tuning variables are centralized in the `LAYOUT_CONFIG` object at the top of `layoutHelpers.ts`.

### 1. **horizontalSpacing** (280px)

**What it controls:** The horizontal distance between parent and child nodes at different depth levels.

**Current value:** `280px`

**How to adjust:**

```typescript
const LAYOUT_CONFIG = {
	// ...
	horizontalSpacing: 280, // Increase for more spacing, decrease for less
	// ...
};
```

**Impact:**

- **Increase (e.g., 350px):** More space between parent/child, longer edges
- **Decrease (e.g., 220px):** Tighter horizontal layout, shorter edges
- ⚠️ **Warning:** Values below 220px may cause edge overlap with wide nodes (max-width: 400px)

**When to change:**

- Graph feels too compressed horizontally
- Edges are too long or too short
- Text readability is affected by node proximity

---

### 2. **verticalSpacingMultiplier** (0.5)

**What it controls:** The vertical space multiplier applied to the sum of all visible node heights. This is the **primary vertical spacing control** that works consistently whether nodes are collapsed or expanded.

**Current value:** `0.5` (comfortable spacing)

**How to adjust:**

```typescript
const LAYOUT_CONFIG = {
	// ...
	verticalSpacingMultiplier: 0.5, // Change this value
	// ...
};
```

**How it works:**

```typescript
treeHeight = totalNodeHeight × verticalSpacingMultiplier
```

Where `totalNodeHeight` is the **sum of all visible node heights**. This ensures:

- ✅ **Collapsed trees** (fewer visible nodes) maintain consistent spacing
- ✅ **Expanded trees** (more visible nodes) don't get overly spaced out
- ✅ Spacing remains proportional to actual content height

**Impact:**

- **Decrease to 0.3:** More compact vertical spacing
- **Current (0.5):** Comfortable, balanced spacing
- **Increase to 0.7:** More breathing room between nodes
- **Increase to 1.0:** Very spacious layout

**Common values:**
| Multiplier | Spacing Style | Use Case |
|------------|---------------|----------|
| 0.3 | Compact | Dense information display |
| 0.5 | Comfortable (current) | Balanced readability |
| 0.7 | Spacious | Good for presentations |
| 1.0+ | Very loose | Whiteboard-style |

**When to change:**

- Graph feels too cramped or too loose vertically
- After collapsing/expanding nodes, spacing feels inconsistent
- Want predictable spacing regardless of tree size

---

### 3. **minVerticalSeparation** (0.01)

**What it controls:** The **base** minimum vertical distance between sibling nodes. The system automatically adds extra separation for taller nodes (multi-line text) to prevent overlap.

**Current value:** `0.01` (base minimum)

**How to adjust:**

```typescript
const LAYOUT_CONFIG = {
	// ...
	minVerticalSeparation: 0.01, // Change this value
	// ...
};
```

**Impact:**

- **Current (0.01):** Small base spacing, automatically scales for taller nodes
- **Increase to 0.5:** More base spacing between all siblings
- **Increase to 1.0:** Significant base vertical gaps

**How it works with node height:**
The separation function automatically accounts for node heights to prevent overlap:

```typescript
// Taller nodes (multi-line text) automatically get more space
separation = minVerticalSeparation + (heightFactor × 0.5)
```

Where `heightFactor` is the average height of two adjacent nodes divided by the maximum node height in the tree.

**Advanced usage:**

You can modify the separation function in the code for custom spacing rules:

```typescript
// In applyBalancedLayout function
.separation((a, b) => {
  // Custom logic based on nodes a and b
  const heightA = a.data?.estimatedHeight || maxHeight;
  const heightB = b.data?.estimatedHeight || maxHeight;
  const avgHeight = (heightA + heightB) / 2;
  const heightFactor = avgHeight / maxHeight;

  // Adjust the multiplier (0.5) to control height-based spacing
  return LAYOUT_CONFIG.minVerticalSeparation + (heightFactor * 0.5);
})
```

**When to change:**

- Want more/less base spacing between all siblings
- Need to adjust the height-based spacing multiplier (currently 0.5)
- verticalSpacingMultiplier alone isn't giving desired results

---

## Height-Aware Spacing (Prevents Overlap & Ensures Consistency)

The layout system automatically adjusts vertical spacing based on node heights to **prevent overlap when text wraps to multiple lines** while ensuring **identical spacing for similar subtrees**.

### How It Works

The system uses a sophisticated separation calculation that ensures consistent spacing across different parts of your mindgraph:

1. **Estimates node height** based on text content and word wrapping
2. **Calculates relative separation** for each pair of adjacent siblings:
   ```
   relativeSeparation = (maxNodeHeight / avgNodeHeight) × 0.02
   ```
3. **D3 scales this** by the tree's height to get absolute pixel spacing

### Why This Approach?

**The Challenge:** D3's `.separation()` function returns a **relative multiplier**, not absolute pixels. Each root node tree calculates its own `treeHeight` based on visible nodes, which means the same separation value could produce different pixel spacing in different subtrees.

**The Solution:** By calculating separation **relative to the average node height in each tree**, the system ensures that:

- ✅ **Similar subtrees get identical spacing** - Same structure = same spacing
- ✅ **Independence** - A tall node in one branch doesn't affect spacing elsewhere
- ✅ **Overlap prevention** - Taller nodes automatically get more space
- ✅ **Mathematical consistency** - The relative factors cancel out to produce absolute spacing

### The Math

```typescript
// What the separation function returns (relative multiplier)
relativeSeparation = (maxNodeHeight / avgNodeHeight) × 0.02

// What D3 calculates for actual pixel spacing
actualSpacing = relativeSeparation × (treeHeight / nodeCount)
              = (maxNodeHeight / avgNodeHeight) × 0.02 × (totalNodeHeight × 0.5 / nodeCount)
              = (maxNodeHeight / avgNodeHeight) × 0.02 × (totalNodeHeight × 0.5 / nodeCount)

// Since avgNodeHeight = totalNodeHeight / nodeCount, this simplifies to:
              = maxNodeHeight × 0.01

// Result: Spacing depends ONLY on actual node height!
```

### Example

For a node with height 88px (double-line):

```
relativeSeparation = (88 / 44) × 0.02 = 0.04
actualSpacing ≈ 88 × 0.01 = 0.88 pixels (in D3's normalized space)
```

This produces consistent spacing regardless of what else is in the tree!

### Tuning the Separation

To adjust spacing, modify the **0.02 multiplier** in the separation function:

```typescript
// In the separation function
const relativeSeparation = (maxNodeHeight / avgNodeHeight) * 0.02;
//                                                            ^^^^
//                                                Increase for more space
//                                                Decrease for less space
```

**Common values:**

- `0.01` - Very compact (may cause overlap with 5+ line nodes)
- `0.02` - Balanced (current, good for most cases)
- `0.03` - More spacious
- `0.04` - Very spacious

**Important:** This multiplier works **consistently** across all subtrees because it's mathematically normalized!

---

## Collapse/Expand Behavior

### How Spacing Works with Collapsed Nodes

The layout system is designed to maintain **consistent spacing** whether nodes are collapsed or expanded:

**Key Innovation: Total Height-Based Calculation**

```typescript
treeHeight = totalNodeHeight × verticalSpacingMultiplier
```

Instead of using `nodeCount` (which changes dramatically), we use the **sum of all visible node heights**:

- **When collapsed:** Fewer visible nodes → smaller `totalNodeHeight` → proportionally smaller `treeHeight`
- **When expanded:** More visible nodes → larger `totalNodeHeight` → proportionally larger `treeHeight`

**Result:** The `verticalSpacingMultiplier` has **consistent effect** regardless of collapse state!

### Example

Given a tree with:

- 1 root node (44px)
- 2 children (44px each)
- 4 grandchildren (44px each)

**Fully Expanded:**

```
totalNodeHeight = 7 × 44px = 308px
treeHeight = 308px × 0.3 = 92.4px spacing budget
```

**Root Collapsed (only root visible):**

```
totalNodeHeight = 1 × 44px = 44px
treeHeight = 44px × 0.3 = 13.2px spacing budget
```

**Parent Collapsed (root + 2 children):**

```
totalNodeHeight = 3 × 44px = 132px
treeHeight = 132px × 0.3 = 39.6px spacing budget
```

The spacing **scales proportionally** with the amount of visible content!

### Why This Matters

**Old approach (count-based):**

- ❌ Collapsed: `nodeCount = 1` → tiny spacing effect
- ❌ Expanded: `nodeCount = 100` → huge spacing effect
- ❌ Multiplier value needs constant adjustment

**New approach (height-based):**

- ✅ Collapsed: Small total height → appropriately small spacing
- ✅ Expanded: Large total height → appropriately scaled spacing
- ✅ Multiplier value works consistently

---

## Node Dimension Estimation

### Text Wrapping Calculation

The system estimates node dimensions based on text content and CSS constraints:

```typescript
// From LAYOUT_CONFIG
nodeMaxWidth: 400; // CSS max-width constraint
lineHeight: 24; // CSS line-height (1.5rem)
```

**How it works:**

1. Calculates characters per line based on `nodeMaxWidth` (400px) and average character width (11px)
2. Simulates word wrapping to count total lines
3. Calculates height: `(lines × lineHeight) + basePadding + extraPadding`

**To adjust node sizes:**

- Change `nodeMaxWidth` in LAYOUT_CONFIG
- Update corresponding CSS in `App.css`:
  ```css
  .node-title {
  	max-width: 400px; /* Match LAYOUT_CONFIG.nodeMaxWidth */
  	font-size: 1.2rem; /* Affects character width estimation */
  }
  ```

---

## Common Tuning Scenarios

### Scenario 1: "Spacing changes too much when collapsing/expanding nodes"

**Problem:** This was an issue with the old count-based approach but **should be fixed now**.

**If still experiencing issues:**

1. Verify you're using the latest version with `totalNodeHeight` calculation
2. The multiplier should now work consistently - try adjusting it globally:

```typescript
const LAYOUT_CONFIG = {
	// ...
	verticalSpacingMultiplier: 0.4, // Increase for more space everywhere
	// ...
};
```

**Expected result:** Consistent spacing behavior regardless of collapse state

---

### Scenario 2: "Graph feels too cramped vertically"

**Solution:** Increase verticalSpacingMultiplier

```typescript
const LAYOUT_CONFIG = {
	// ...
	verticalSpacingMultiplier: 0.5, // Changed from 0.3
	// ...
};
```

**Expected result:** More vertical space between all nodes, scales with content

---

### Scenario 3: "Edges are too long/short horizontally"

**Solution:** Adjust horizontalSpacing

```typescript
const LAYOUT_CONFIG = {
	// ...
	horizontalSpacing: 300, // For longer edges (was 240)
	// OR
	horizontalSpacing: 200, // For shorter edges (was 240)
	// ...
};
```

**Expected result:** Uniform change in edge length across all depths

---

### Scenario 4: "Siblings are overlapping"

**Solution:** Increase verticalSpacingMultiplier AND minVerticalSeparation

```typescript
const LAYOUT_CONFIG = {
	// ...
	verticalSpacingMultiplier: 0.2, // Double current (was 0.1)
	minVerticalSeparation: 0.5, // 500× current (was 0.001)
	// ...
};
```

**Expected result:** More vertical space between siblings

---

### Scenario 5: "Want different spacing at different depths"

**Solution:** Implement depth-based horizontal spacing

```typescript
// Replace constant spacing with depth-based calculation
node.x = node.depth * getSpacingForDepth(node.depth);

function getSpacingForDepth(depth: number): number {
	if (depth === 0) return 0;
	if (depth === 1) return 300; // First level gets more space
	return 200; // Deeper levels more compact
}
```

---

## Troubleshooting

### Issue: Similar subtrees have different vertical spacing

**Status:** ✅ **FIXED** - The separation function now calculates spacing relative to each tree's average node height, ensuring consistent results.

**How it works:**

- Separation is calculated as `(maxNodeHeight / avgNodeHeight) × 0.02`
- This creates a relative multiplier that D3 scales by `treeHeight`
- The math ensures that similar structures produce identical absolute spacing
- Example: Two subtrees with 3 nodes of 44px each will always have the same spacing

**If still seeing inconsistencies:**

1. Verify nodes actually have the same text (different text = different heights)
2. Check that LAYOUT_CONFIG values match between sessions
3. Clear localStorage and recreate the nodes if needed

---

### Issue: Very tall multi-line nodes overlap with siblings

**Current Configuration:**

- Node max-width: 400px (reduces line count by ~33%)
- Separation multiplier: 0.02 (relative to tree average height)
- Character width estimation: 11px (matches 1.2rem font)
- Extra padding for 5+ line nodes: +10px

**If still experiencing overlap:**

1. **Increase the separation multiplier** to 0.03 or 0.04 in the code:
   ```typescript
   const relativeSeparation = (maxNodeHeight / avgNodeHeight) * 0.03;
   ```
2. **Increase verticalSpacingMultiplier** for more overall space:
   ```typescript
   verticalSpacingMultiplier: 0.6; // Increase from 0.5
   ```
3. **Increase node max-width** to reduce wrapping:
   ```typescript
   nodeMaxWidth: 500; // In LAYOUT_CONFIG
   ```
   And update CSS:
   ```css
   .node-title {
   	max-width: 500px;
   }
   ```

---

### Issue: Edges curve backwards

**Cause:** Horizontal spacing too small for wide parent nodes

**Fix:** Increase `horizontalSpacing`

```typescript
const LAYOUT_CONFIG = {
	// ...
	horizontalSpacing: 280, // Was 240
	// ...
};
```

---

### Issue: Nodes overlap vertically

**Cause:** verticalSpacingMultiplier too small or minVerticalSeparation too tight

**Fix:** Increase multiplier

```typescript
const LAYOUT_CONFIG = {
	// ...
	verticalSpacingMultiplier: 0.15, // Was 0.1
	// ...
};
```

---

### Issue: Too much empty space

**Cause:** verticalSpacingMultiplier too large

**Fix:** Decrease multiplier

```typescript
const LAYOUT_CONFIG = {
	// ...
	verticalSpacingMultiplier: 0.08, // Was 0.1
	// ...
};
```

---

## D3 Cluster Layout Explained

### What is a Cluster Layout?

D3's cluster layout creates a **dendrogram** (tree diagram) where:

- Nodes at the same depth are **horizontally aligned**
- Leaf nodes are **evenly distributed vertically**
- The layout automatically balances the tree

### Key Parameters

```typescript
const cluster = d3
	.cluster<TreeNode>()
	.size([treeHeight, 1]) // [vertical space, horizontal space (ignored)]
	.separation(() => 0.001); // Minimum vertical gap between nodes
```

**size([height, width]):**

- `height`: Total vertical space to distribute nodes across
- `width`: We ignore this and apply our own horizontal spacing

**separation(function):**

- Controls vertical spacing between siblings
- Returns a multiplier applied to the base spacing
- `0.001` = absolute minimum, effectively lets `treeHeight` control spacing

---

## Best Practices

1. **Always adjust horizontalSpacing first** when dealing with horizontal layout issues
2. **Use verticalSpacingMultiplier as primary vertical spacing control** (easier than minVerticalSeparation)
3. **Keep minVerticalSeparation at 0.001** unless you need fine-grained sibling spacing rules
4. **Test with various graph sizes** - small (5 nodes), medium (20 nodes), large (100+ nodes)
5. **Match CSS and LAYOUT_CONFIG** - Ensure `nodeMaxWidth` matches `.node-title max-width`
6. **Document any custom changes** - Add comments explaining non-standard values

---

## Quick Reference

| Variable                  | Current Value | Primary Effect                       | Recommended Range |
| ------------------------- | ------------- | ------------------------------------ | ----------------- |
| horizontalSpacing         | 280px         | Edge length                          | 220-400px         |
| verticalSpacingMultiplier | 0.5           | Vertical spacing (collapse-stable)   | 0.3-1.0           |
| minVerticalSeparation     | 0.01          | Base sibling spacing                 | 0.01-0.1          |
| nodeMaxWidth              | 400px         | Node text wrapping                   | 300-600px         |
| fontSize                  | 1.2rem        | Text size, affects wrapping          | 1rem-1.5rem       |
| separationMultiplier      | 0.02          | Height-based spacing (tree-relative) | 0.01-0.04         |

---

## Related Files

- **src/utils/layoutHelpers.ts** - Layout calculation logic
- **src/App.css** - Node styling (`.node-title`)
- **src/components/MindNode.tsx** - Individual node component with edge handles
- **src/components/Canvas.tsx** - React Flow canvas integration

---

## Additional Resources

- [D3 Hierarchy Documentation](https://d3js.org/d3-hierarchy/cluster)
- [React Flow Documentation](https://reactflow.dev/docs/introduction)
- [CSS Text Wrapping Reference](https://developer.mozilla.org/en-US/docs/Web/CSS/word-wrap)
