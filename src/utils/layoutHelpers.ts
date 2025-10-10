import { hierarchy, cluster, HierarchyPointNode } from "d3-hierarchy";
import { NodeInstance, TreeNode } from "../types";

/**
 * Layout configuration
 */
const LAYOUT_CONFIG = {
	horizontalSpacing: 200,
	verticalSpacing: 75,
	startX: 100,
	startY: 100,
	nodeMaxWidth: 300, // Match CSS max-width
	lineHeight: 24, // Match CSS line-height (1.5rem)
	basePadding: 20, // Base padding for node (12px top + 12px bottom + some margin)
};

interface HierarchyNode {
	instanceId: string;
	instance: NodeInstance;
	nodeData: TreeNode;
	estimatedHeight: number;
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

		const children = instances
			.filter((inst) => inst.parentInstanceId === instance.instanceId)
			.sort((a, b) => a.siblingOrder - b.siblingOrder)
			.map((child) => buildNode(child));

		return {
			instanceId: instance.instanceId,
			instance,
			nodeData,
			estimatedHeight,
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

		// Much more compact tree height calculation
		const treeHeight = nodeCount * (maxHeight + 20); // Just node height + small gap

		const clusterLayout = cluster<HierarchyNode>()
			.size([treeHeight, 1000])
			.separation((a, b) => {
				// Calculate separation based on the actual heights of the nodes
				const aHeight = a.data.estimatedHeight;
				const bHeight = b.data.estimatedHeight;
				const avgHeight = (aHeight + bHeight) / 2;
				const baseHeight = LAYOUT_CONFIG.lineHeight + LAYOUT_CONFIG.basePadding;

				// Use actual height to determine separation
				// This ensures nodes with more text get more spacing
				const heightFactor = avgHeight / baseHeight;

				// Adjusted spacing that scales better with node height
				return a.parent === b.parent
					? 0.8 * heightFactor // Siblings: scale with height
					: 0.9 * heightFactor; // Cousins: slightly more spacing
			});

		const layoutRoot = clusterLayout(root);

		layoutRoot.each((node: HierarchyPointNode<HierarchyNode>) => {
			positions.set(node.data.instanceId, {
				x: LAYOUT_CONFIG.startX + node.depth * LAYOUT_CONFIG.horizontalSpacing,
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
