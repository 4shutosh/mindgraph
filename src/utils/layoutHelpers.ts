import { NodeInstance } from "../types";

/**
 * Auto-layout configuration
 */
const LAYOUT_CONFIG = {
	horizontalSpacing: 280, // Distance between parent and child (left to right)
	verticalSpacing: 100, // Distance between siblings (top to bottom)
	startX: 100, // Starting X position for root nodes
	startY: 100, // Starting Y position for root nodes
};

/**
 * Calculate balanced positions for all nodes in the tree
 */
export function calculateBalancedLayout(
	instances: NodeInstance[]
): Map<string, { x: number; y: number }> {
	const positions = new Map<string, { x: number; y: number }>();

	// Find root nodes (no parent) and sort by sibling order
	const rootNodes = instances
		.filter((inst) => inst.parentInstanceId === null)
		.sort((a, b) => a.siblingOrder - b.siblingOrder);

	// Group nodes by depth level
	const nodesByDepth = new Map<number, NodeInstance[]>();
	instances.forEach((inst) => {
		const existing = nodesByDepth.get(inst.depth) || [];
		nodesByDepth.set(inst.depth, [...existing, inst]);
	});

	// Position root nodes vertically
	rootNodes.forEach((root, index) => {
		const y = LAYOUT_CONFIG.startY + index * LAYOUT_CONFIG.verticalSpacing;
		positions.set(root.instanceId, {
			x: LAYOUT_CONFIG.startX,
			y,
		});

		// Recursively position children
		positionChildren(root, instances, positions);
	});

	return positions;
}

/**
 * Recursively position children of a node
 */
function positionChildren(
	parent: NodeInstance,
	allInstances: NodeInstance[],
	positions: Map<string, { x: number; y: number }>
): void {
	// Find children of this parent and sort by sibling order
	const children = allInstances
		.filter((inst) => inst.parentInstanceId === parent.instanceId)
		.sort((a, b) => a.siblingOrder - b.siblingOrder);

	if (children.length === 0) return;

	const parentPos = positions.get(parent.instanceId);
	if (!parentPos) return;

	// Calculate child positions
	const childX = parentPos.x + LAYOUT_CONFIG.horizontalSpacing;

	// Position children vertically centered around parent
	const totalHeight = (children.length - 1) * LAYOUT_CONFIG.verticalSpacing;
	const startY = parentPos.y - totalHeight / 2;

	children.forEach((child, index) => {
		const childY = startY + index * LAYOUT_CONFIG.verticalSpacing;
		positions.set(child.instanceId, {
			x: childX,
			y: childY,
		});

		// Recursively position this child's children
		positionChildren(child, allInstances, positions);
	});

	// Adjust parent position to center of children
	if (children.length > 0) {
		const childPositions = children
			.map((c) => positions.get(c.instanceId))
			.filter((p) => p !== undefined);

		if (childPositions.length > 0) {
			const avgChildY =
				childPositions.reduce((sum, p) => sum + p!.y, 0) /
				childPositions.length;

			// Update parent Y to align with center of children
			positions.set(parent.instanceId, {
				x: parentPos.x,
				y: avgChildY,
			});
		}
	}
}

/**
 * Apply balanced layout positions to instances
 */
export function applyBalancedLayout(instances: NodeInstance[]): NodeInstance[] {
	const positions = calculateBalancedLayout(instances);

	return instances.map((instance) => {
		const newPos = positions.get(instance.instanceId);
		if (newPos) {
			return {
				...instance,
				position: newPos,
			};
		}
		return instance;
	});
}
