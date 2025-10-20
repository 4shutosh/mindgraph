import { hierarchy, cluster, HierarchyPointNode } from "d3-hierarchy";
import { NodeInstance, TreeNode } from "../types";

/**
 * Layout configuration constants
 * See docs/LAYOUT_SYSTEM.md for detailed explanation
 */
const LAYOUT_CONFIG = {
	// Node dimensions (must match CSS in App.css)
	nodeMaxWidth: 400, // Maximum node width before text wraps
	nodeMinWidth: 60, // Minimum node width
	lineHeight: 24, // Line height for text (1.5rem = 24px)
	basePadding: 20, // Base padding around node content

	// Spacing configuration
	horizontalSpacing: 80, // Gap between parent's right edge and child's left edge
	verticalSpacingMultiplier: 0.6, // Controls vertical compactness (smaller = tighter)
	minVerticalSeparation: 0.01, // Minimum separation between sibling nodes

	// Tree positioning
	startX: 100, // Default X position for root nodes
	startY: 100, // Default Y position for root nodes
};

interface HierarchyNode {
	instanceId: string;
	instance: NodeInstance;
	nodeData: TreeNode;
	estimatedHeight: number;
	estimatedWidth: number;
	children?: HierarchyNode[];
}

/**
 * Estimate node height based on text content
 * Accounts for word wrapping within the max-width constraint
 */
function estimateNodeHeight(text: string): number {
	if (!text || text.trim().length === 0) {
		return LAYOUT_CONFIG.lineHeight + LAYOUT_CONFIG.basePadding;
	}

	// Font is 1.2rem ≈ 19.2px, so average char width is ~11px (accounting for varied widths)
	const avgCharWidth = 11;
	const maxCharsPerLine = Math.floor(LAYOUT_CONFIG.nodeMaxWidth / avgCharWidth);

	// Calculate number of lines by simulating word wrapping
	const words = text.split(/\s+/);
	let lines = 1;
	let currentLineLength = 0;

	for (const word of words) {
		const wordLength = word.length;
		if (
			currentLineLength + wordLength + 1 > maxCharsPerLine &&
			currentLineLength > 0
		) {
			lines++;
			currentLineLength = wordLength;
		} else {
			currentLineLength += wordLength + 1;
		}
	}

	// Calculate total height: (lines × line height) + base padding + extra padding for multi-line
	// Add more padding for very tall nodes (5+ lines)
	const extraPadding = lines > 1 ? 20 : 0;
	const tallNodePadding = lines >= 5 ? 10 : 0;
	const minHeight = LAYOUT_CONFIG.lineHeight + LAYOUT_CONFIG.basePadding;

	return Math.max(
		lines * LAYOUT_CONFIG.lineHeight +
			LAYOUT_CONFIG.basePadding +
			extraPadding +
			tallNodePadding,
		minHeight
	);
}

/**
 * Estimate node width based on text content
 * This estimates the actual rendered width considering word wrapping
 */
function estimateNodeWidth(text: string): number {
	if (!text || text.trim().length === 0) {
		return LAYOUT_CONFIG.nodeMinWidth;
	}

	// Character width estimation (matches estimateNodeHeight for consistency)
	// Font is 1.2rem ≈ 19.2px, so average char width is ~11px
	const avgCharWidth = 11;
	const padding = 24; // Total horizontal padding (12px left + 12px right)
	const maxCharsPerLine = Math.floor(LAYOUT_CONFIG.nodeMaxWidth / avgCharWidth);

	// Split by words to find the longest line after wrapping
	const words = text.split(/\s+/);
	let currentLineLength = 0;
	let maxLineLength = 0;

	for (const word of words) {
		const wordLength = word.length;

		// If adding this word would exceed the line, start a new line
		if (
			currentLineLength + wordLength + 1 > maxCharsPerLine &&
			currentLineLength > 0
		) {
			maxLineLength = Math.max(maxLineLength, currentLineLength);
			currentLineLength = wordLength;
		} else {
			currentLineLength += wordLength + 1; // +1 for space
		}
	}

	// Check the last line
	maxLineLength = Math.max(maxLineLength, currentLineLength);

	// Calculate width based on longest line
	const estimatedWidth = maxLineLength * avgCharWidth + padding;

	// Clamp between min and max widths
	return Math.max(
		LAYOUT_CONFIG.nodeMinWidth,
		Math.min(estimatedWidth, LAYOUT_CONFIG.nodeMaxWidth)
	);
}

/**
 * Build hierarchical tree structure from flat instance array
 */
function buildHierarchyTree(
	instances: NodeInstance[],
	nodes: Record<string, TreeNode>
): HierarchyNode[] {
	const rootInstances = instances.filter(
		(inst) => inst.parentInstanceId === null
	);

	function buildNode(instance: NodeInstance): HierarchyNode {
		const nodeData = nodes[instance.nodeId];
		const estimatedHeight = estimateNodeHeight(nodeData?.title || "");
		const estimatedWidth = estimateNodeWidth(nodeData?.title || "");

		// If this node is collapsed, don't include its children in the layout
		let children: HierarchyNode[] = [];
		if (!instance.isCollapsed) {
			children = instances
				.filter((inst) => inst.parentInstanceId === instance.instanceId)
				.sort((a, b) => a.siblingOrder - b.siblingOrder)
				.map((child) => buildNode(child));
		}

		return {
			instanceId: instance.instanceId,
			instance,
			nodeData,
			estimatedHeight,
			estimatedWidth,
			children: children.length > 0 ? children : undefined,
		};
	}

	return rootInstances
		.sort((a, b) => a.siblingOrder - b.siblingOrder)
		.map((root) => buildNode(root));
}

/**
 * Apply d3 cluster layout to instances
 */
export function applyBalancedLayout(
	instances: NodeInstance[],
	nodes: Record<string, TreeNode>
): NodeInstance[] {
	if (instances.length === 0) {
		return instances;
	}

	const positions = new Map<string, { x: number; y: number }>();
	const trees = buildHierarchyTree(instances, nodes);

	// Store original root positions to preserve custom positioning
	const rootPositions = new Map<string, { x: number; y: number }>();
	trees.forEach((tree) => {
		rootPositions.set(tree.instanceId, tree.instance.position);
	});

	trees.forEach((tree) => {
		const root = hierarchy<HierarchyNode>(tree, (d) => d.children);

		// Use the root's current position instead of default start position
		const rootPos = rootPositions.get(tree.instanceId) || {
			x: LAYOUT_CONFIG.startX,
			y: LAYOUT_CONFIG.startY,
		};

		// Calculate total height needed by summing all node heights
		let totalNodeHeight = 0;
		let nodeCount = 0;
		let maxHeight = 0;
		root.each((node) => {
			totalNodeHeight += node.data.estimatedHeight;
			nodeCount++;
			maxHeight = Math.max(maxHeight, node.data.estimatedHeight);
		});

		// Calculate density (number of descendants) for each node
		// This helps us determine both vertical AND horizontal spacing
		const descendantCounts = new Map<string, number>();
		root.each((node) => {
			let count = 0;
			node.each(() => count++);
			descendantCounts.set(node.data.instanceId, count - 1); // Exclude self
		});

		// Calculate how many siblings each parent has at each level
		const siblingCounts = new Map<string, number>();
		root.each((node) => {
			if (node.children) {
				siblingCounts.set(node.data.instanceId, node.children.length);
			}
		});

		// Calculate tree height based on total actual node heights plus spacing multiplier
		// This ensures consistent spacing regardless of collapse/expand state
		const treeHeight =
			totalNodeHeight * LAYOUT_CONFIG.verticalSpacingMultiplier;

		const clusterLayout = cluster<HierarchyNode>()
			.size([treeHeight, 1000])
			.separation((a, b) => {
				// D3's separation returns a RELATIVE multiplier that gets scaled by treeHeight
				// To get consistent absolute spacing, we need to calculate separation
				// relative to the average node height in THIS tree

				const heightA = a.data?.estimatedHeight || 44;
				const heightB = b.data?.estimatedHeight || 44;
				const maxNodeHeight = Math.max(heightA, heightB);

				// Calculate average node height for this tree
				const avgNodeHeight = totalNodeHeight / nodeCount;

				// Return separation relative to average node height
				// This way, when D3 scales by treeHeight, similar structures get similar absolute spacing
				// The 0.02 is a base minimum, and we add based on actual node height
				const relativeSeparation = (maxNodeHeight / avgNodeHeight) * 0.02;

				return LAYOUT_CONFIG.minVerticalSeparation + relativeSeparation;
			});

		const layoutRoot = clusterLayout(root);

		// Find the root node's position in the d3 layout to calculate offset
		let rootLayoutY = 0;
		layoutRoot.each((node: HierarchyPointNode<HierarchyNode>) => {
			if (node.data.instanceId === tree.instanceId) {
				rootLayoutY = node.x;
			}
		});

		// Calculate offset to keep root at its original position
		const yOffset = rootPos.y - rootLayoutY;

		// D3's .each() traverses the tree in breadth-first order (level by level),
		// ensuring parents are always positioned before their children.
		// This guarantees that positions.get(parentId) will always return a valid position.
		layoutRoot.each((node: HierarchyPointNode<HierarchyNode>) => {
			let xPos: number;

			if (!node.parent) {
				// Root node: use its original position
				xPos = rootPos.x;
			} else {
				// Child node: position based on parent's right edge + horizontal spacing
				const parentId = node.parent.data.instanceId;
				const parentXPos = positions.get(parentId)?.x || rootPos.x;
				const parentWidth = node.parent.data.estimatedWidth || LAYOUT_CONFIG.nodeMaxWidth;

				// X = parent's right edge + spacing
				// Parent's right edge = parentXPos + parentWidth
				xPos = parentXPos + parentWidth + LAYOUT_CONFIG.horizontalSpacing;
			}

			positions.set(node.data.instanceId, {
				x: xPos,
				y: node.x + yOffset,
			});
		});
	});

	return instances.map((instance) => {
		const newPos = positions.get(instance.instanceId);
		return newPos ? { ...instance, position: newPos } : instance;
	});
}

/**
 * Recalculate layout after graph modifications
 */
export function recalculateLayout(
	instances: NodeInstance[],
	nodes: Record<string, TreeNode>
): NodeInstance[] {
	return applyBalancedLayout(instances, nodes);
}
