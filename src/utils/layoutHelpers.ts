import { NodeInstance } from "../types";

/**
 * Auto-layout configuration
 */
const LAYOUT_CONFIG = {
	horizontalSpacing: 140, // Distance between parent and child (left to right)
	verticalSpacing: 80, // Distance between siblings (top to bottom)
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

	// Position root nodes vertically with proper spacing
	let currentY = LAYOUT_CONFIG.startY;

	rootNodes.forEach((root) => {
		positions.set(root.instanceId, {
			x: LAYOUT_CONFIG.startX,
			y: currentY,
		});

		// Recursively position children and get bounds
		const bounds = positionChildren(root, instances, positions);

		// Next root starts after this subtree with spacing
		currentY = bounds.maxY + LAYOUT_CONFIG.verticalSpacing * 2;
	});

	return positions;
}

/**
 * Recursively position children of a node
 * Returns the min and max Y positions of the subtree
 */
function positionChildren(
	parent: NodeInstance,
	allInstances: NodeInstance[],
	positions: Map<string, { x: number; y: number }>
): { minY: number; maxY: number } {
	// Find children of this parent and sort by sibling order
	const children = allInstances
		.filter((inst) => inst.parentInstanceId === parent.instanceId)
		.sort((a, b) => a.siblingOrder - b.siblingOrder);

	if (children.length === 0) {
		const parentPos = positions.get(parent.instanceId);
		if (!parentPos) return { minY: 0, maxY: 0 };
		return { minY: parentPos.y, maxY: parentPos.y };
	}

	const parentPos = positions.get(parent.instanceId);
	if (!parentPos) return { minY: 0, maxY: 0 };

	const childX = parentPos.x + LAYOUT_CONFIG.horizontalSpacing;

	// First pass: position children and get their subtree bounds
	const childBounds: { minY: number; maxY: number }[] = [];
	let nextY = parentPos.y;

	children.forEach((child, index) => {
		// Position child
		positions.set(child.instanceId, {
			x: childX,
			y: nextY,
		});

		// Recursively position child's children and get bounds
		const bounds = positionChildren(child, allInstances, positions);
		childBounds.push(bounds);

		// Calculate next Y position for sibling
		if (index < children.length - 1) {
			nextY = bounds.maxY + LAYOUT_CONFIG.verticalSpacing;
		}
	});

	// Second pass: adjust parent to center of children
	if (children.length > 0) {
		const firstChildPos = positions.get(children[0].instanceId);
		const lastChildPos = positions.get(
			children[children.length - 1].instanceId
		);

		if (firstChildPos && lastChildPos) {
			const centerY = (firstChildPos.y + lastChildPos.y) / 2;
			positions.set(parent.instanceId, {
				x: parentPos.x,
				y: centerY,
			});
		}
	}

	// Return the bounds of this subtree
	const allYs = [parentPos.y, ...childBounds.flatMap((b) => [b.minY, b.maxY])];

	return {
		minY: Math.min(...allYs),
		maxY: Math.max(...allYs),
	};
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
