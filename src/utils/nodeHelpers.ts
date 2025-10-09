import { v4 as uuidv4 } from "uuid";
import { TreeNode, NodeInstance, EdgeConnection } from "../types";

/**
 * Create a new tree node
 */
export function createNode(title: string = ""): TreeNode {
	const now = Date.now();
	return {
		nodeId: uuidv4(),
		title,
		createdAt: now,
		updatedAt: now,
		children: [],
	};
}

/**
 * Create a node instance for canvas placement
 */
export function createNodeInstance(
	nodeId: string,
	position: { x: number; y: number },
	parentInstanceId: string | null = null,
	depth: number = 0,
	siblingOrder: number = 0
): NodeInstance {
	return {
		instanceId: uuidv4(),
		nodeId,
		position,
		parentInstanceId,
		depth,
		siblingOrder,
	};
}

/**
 * Create an edge connection
 */
export function createEdge(source: string, target: string): EdgeConnection {
	return {
		id: `${source}-${target}`,
		source,
		target,
	};
}

/**
 * Count how many times a node appears on the canvas
 */
export function countNodeReferences(
	nodeId: string,
	instances: NodeInstance[]
): number {
	return instances.filter((inst) => inst.nodeId === nodeId).length;
}

/**
 * Get all children instances of a given instance
 */
export function getChildrenInstances(
	instanceId: string,
	instances: NodeInstance[]
): NodeInstance[] {
	return instances.filter((inst) => inst.parentInstanceId === instanceId);
}

/**
 * Get all descendants (children, grandchildren, etc.) of an instance
 */
export function getAllDescendants(
	instanceId: string,
	instances: NodeInstance[]
): NodeInstance[] {
	const descendants: NodeInstance[] = [];
	const children = getChildrenInstances(instanceId, instances);

	children.forEach((child) => {
		descendants.push(child);
		// Recursively get descendants of this child
		const childDescendants = getAllDescendants(child.instanceId, instances);
		descendants.push(...childDescendants);
	});

	return descendants;
}

/**
 * Get all sibling instances of a given instance (same parent)
 */
export function getSiblingInstances(
	instanceId: string,
	instances: NodeInstance[]
): NodeInstance[] {
	const instance = instances.find((inst) => inst.instanceId === instanceId);
	if (!instance) return [];

	return instances.filter(
		(inst) =>
			inst.parentInstanceId === instance.parentInstanceId &&
			inst.instanceId !== instanceId
	);
}

/**
 * Calculate position for a new sibling node
 * For horizontal layout: siblings are positioned vertically below each other
 */
export function calculateSiblingPosition(
	currentInstance: NodeInstance,
	_siblings: NodeInstance[]
): { x: number; y: number } {
	// Position below the current node (same x, different y)
	const verticalSpacing = 80;
	return {
		x: currentInstance.position.x,
		y: currentInstance.position.y + verticalSpacing,
	};
}

/**
 * Calculate position for a new child node
 * For horizontal layout: children are positioned to the right and down
 */
export function calculateChildPosition(
	parentInstance: NodeInstance,
	existingChildren: NodeInstance[]
): { x: number; y: number } {
	const horizontalSpacing = 140; // Reduced from 200 to 120 for shorter edges
	const verticalSpacing = 80; // Space down for multiple children

	// If no children, position to the right at same y level
	if (existingChildren.length === 0) {
		return {
			x: parentInstance.position.x + horizontalSpacing,
			y: parentInstance.position.y,
		};
	}

	// Position below the last child (same x as first child, incrementing y)
	const lastChild = existingChildren[existingChildren.length - 1];
	return {
		x: lastChild.position.x,
		y: lastChild.position.y + verticalSpacing,
	};
}

/**
 * Get the parent instance of a given instance
 */
export function getParentInstance(
	instanceId: string,
	instances: NodeInstance[]
): NodeInstance | null {
	const instance = instances.find((inst) => inst.instanceId === instanceId);
	if (!instance || !instance.parentInstanceId) return null;

	return (
		instances.find((inst) => inst.instanceId === instance.parentInstanceId) ||
		null
	);
}

/**
 * Get the first child instance of a given instance
 */
export function getFirstChildInstance(
	instanceId: string,
	instances: NodeInstance[]
): NodeInstance | null {
	const children = getChildrenInstances(instanceId, instances);
	if (children.length === 0) return null;

	// Sort by sibling order and return the first one
	return children.sort((a, b) => a.siblingOrder - b.siblingOrder)[0];
}

/**
 * Get the next sibling instance (same parent, higher sibling order)
 */
export function getNextSiblingInstance(
	instanceId: string,
	instances: NodeInstance[]
): NodeInstance | null {
	const instance = instances.find((inst) => inst.instanceId === instanceId);
	if (!instance) return null;

	const siblings = getSiblingInstances(instanceId, instances);
	if (siblings.length === 0) return null;

	// Sort by sibling order and find the next one
	const sortedSiblings = siblings.sort(
		(a, b) => a.siblingOrder - b.siblingOrder
	);
	const nextSibling = sortedSiblings.find(
		(sibling) => sibling.siblingOrder > instance.siblingOrder
	);

	return nextSibling || null;
}

/**
 * Get the previous sibling instance (same parent, lower sibling order)
 */
export function getPreviousSiblingInstance(
	instanceId: string,
	instances: NodeInstance[]
): NodeInstance | null {
	const instance = instances.find((inst) => inst.instanceId === instanceId);
	if (!instance) return null;

	const siblings = getSiblingInstances(instanceId, instances);
	if (siblings.length === 0) return null;

	// Sort by sibling order and find the previous one
	const sortedSiblings = siblings.sort(
		(a, b) => a.siblingOrder - b.siblingOrder
	);
	const previousSibling = sortedSiblings
		.reverse()
		.find((sibling) => sibling.siblingOrder < instance.siblingOrder);

	return previousSibling || null;
}

/**
 * Update positions of siblings that come after the current instance
 * This pushes them down when a new sibling is inserted
 */
export function updateSiblingPositions(
	currentInstance: NodeInstance,
	instances: NodeInstance[]
): NodeInstance[] {
	const verticalSpacing = 80;

	return instances.map((instance) => {
		// Only update siblings of the same parent that come after the current instance
		if (
			instance.parentInstanceId === currentInstance.parentInstanceId &&
			instance.siblingOrder > currentInstance.siblingOrder &&
			instance.instanceId !== currentInstance.instanceId
		) {
			return {
				...instance,
				position: {
					...instance.position,
					y: instance.position.y + verticalSpacing,
				},
			};
		}
		return instance;
	});
}
