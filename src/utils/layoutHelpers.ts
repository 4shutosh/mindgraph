import { hierarchy, cluster, HierarchyPointNode } from "d3-hierarchy";
import { NodeInstance, TreeNode } from "../types";

/**
 * Layout configuration
 */
const LAYOUT_CONFIG = {
	horizontalSpacing: 200,
	minHorizontalSpacing: 180, // Minimum spacing for sparse trees
	maxHorizontalSpacing: 350, // Maximum spacing for dense trees
	verticalSpacing: 75,
	startX: 100,
	startY: 100,
	nodeMaxWidth: 300, // Match CSS max-width
	nodeMinWidth: 60, // Minimum node width
	lineHeight: 24, // Match CSS line-height (1.5rem)
	basePadding: 20, // Base padding for node (12px top + 12px bottom + some margin)
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
 * This accounts for word wrapping within the max-width constraint
 */
function estimateNodeHeight(text: string): number {
	if (!text || text.trim().length === 0) {
		return LAYOUT_CONFIG.lineHeight + LAYOUT_CONFIG.basePadding;
	}

	// More accurate character width estimation
	const avgCharWidth = 10; // Increased to account for padding and varied characters
	const maxCharsPerLine = Math.floor(LAYOUT_CONFIG.nodeMaxWidth / avgCharWidth);

	// Split by words to handle word wrapping properly
	const words = text.split(/\s+/);
	let lines = 1;
	let currentLineLength = 0;

	for (const word of words) {
		const wordLength = word.length;

		// If adding this word would exceed the line, start a new line
		if (
			currentLineLength + wordLength + 1 > maxCharsPerLine &&
			currentLineLength > 0
		) {
			lines++;
			currentLineLength = wordLength;
		} else {
			currentLineLength += wordLength + 1; // +1 for space
		}
	}

	// Height = (number of lines * line height) + padding
	// Add significantly more padding for multi-line nodes
	const extraPadding = lines > 1 ? 20 : 0;
	const minHeight = LAYOUT_CONFIG.lineHeight + LAYOUT_CONFIG.basePadding;

	return Math.max(
		lines * LAYOUT_CONFIG.lineHeight + LAYOUT_CONFIG.basePadding + extraPadding,
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

	// More accurate character width estimation (matches estimateNodeHeight)
	const avgCharWidth = 10;
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

		const children = instances
			.filter((inst) => inst.parentInstanceId === instance.instanceId)
			.sort((a, b) => a.siblingOrder - b.siblingOrder)
			.map((child) => buildNode(child));

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
	let currentOffsetY = LAYOUT_CONFIG.startY;

	trees.forEach((tree) => {
		const root = hierarchy<HierarchyNode>(tree, (d) => d.children);

		// Count nodes to determine reasonable tree height
		let nodeCount = 0;
		let maxHeight = 0;
		root.each((node) => {
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

		// Compact tree height - nodes should be close together
		// Using a smaller multiplier for tighter vertical spacing
		const treeHeight = nodeCount * (maxHeight * 0.45); // Further reduced for tighter spacing

		const clusterLayout = cluster<HierarchyNode>()
			.size([treeHeight, 1000])
			.separation((a, b) => {
				// Adaptive vertical spacing based on subtree density

				const aHeight = a.data.estimatedHeight;
				const bHeight = b.data.estimatedHeight;
				const avgHeight = (aHeight + bHeight) / 2;
				const baseHeight = LAYOUT_CONFIG.lineHeight + LAYOUT_CONFIG.basePadding;

				// Base height factor for tight spacing
				const baseHeightFactor = Math.max(0.25, (avgHeight / baseHeight) * 0.1);

				// If siblings, check parent's density
				if (a.parent === b.parent && a.parent) {
					const parentDescendants =
						descendantCounts.get(a.parent.data.instanceId) || 0;
					const siblingCount = siblingCounts.get(a.parent.data.instanceId) || 0;

					// Check if either sibling is a leaf node (no children)
					const aIsLeaf = !a.children || a.children.length === 0;
					const bIsLeaf = !b.children || b.children.length === 0;

					// If parent has many descendants AND many direct children,
					// we need more vertical spacing to prevent edge overlap
					if (parentDescendants >= 5 && siblingCount >= 4) {
						// Dense subtree: increase vertical spacing
						const densityMultiplier =
							1.5 + Math.min((siblingCount - 4) * 0.2, 1.0);
						return baseHeightFactor * densityMultiplier;
					}

					// If at least one sibling is a leaf node, add more spacing
					if (aIsLeaf || bIsLeaf) {
						return baseHeightFactor * 1.3; // 30% more spacing for leaf nodes
					}
				}

				// Default tight spacing
				return a.parent === b.parent
					? baseHeightFactor // Siblings: very tight
					: baseHeightFactor * 1.1; // Cousins: barely more
			});

		const layoutRoot = clusterLayout(root);

		// Use constant horizontal spacing for uniform edge lengths
		// All nodes at the same depth get the same X position
		const CONSTANT_HORIZONTAL_SPACING = 240; // Fixed spacing between levels

		layoutRoot.each((node: HierarchyPointNode<HierarchyNode>) => {
			// Calculate depth (distance from root)
			let depth = 0;
			let tempNode: HierarchyPointNode<HierarchyNode> | null = node.parent;
			while (tempNode) {
				depth++;
				tempNode = tempNode.parent;
			}

			// X position = startX + (depth × constant spacing)
			const xPos = LAYOUT_CONFIG.startX + depth * CONSTANT_HORIZONTAL_SPACING;

			positions.set(node.data.instanceId, {
				x: xPos,
				y: node.x + currentOffsetY,
			});
		});

		currentOffsetY += treeHeight + LAYOUT_CONFIG.verticalSpacing * 2;
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
