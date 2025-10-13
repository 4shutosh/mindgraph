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
		const childDescendants = getAllDescendants(child.instanceId, instances);
		descendants.push(...childDescendants);
	});

	return descendants;
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

	return children.sort((a, b) => a.siblingOrder - b.siblingOrder)[0];
}

/**
 * Get the next sibling instance
 */
export function getNextSiblingInstance(
	instanceId: string,
	instances: NodeInstance[]
): NodeInstance | null {
	const instance = instances.find((inst) => inst.instanceId === instanceId);
	if (!instance) return null;

	const siblings = instances.filter(
		(inst) =>
			inst.parentInstanceId === instance.parentInstanceId &&
			inst.instanceId !== instanceId &&
			inst.siblingOrder > instance.siblingOrder
	);

	if (siblings.length === 0) return null;

	return siblings.sort((a, b) => a.siblingOrder - b.siblingOrder)[0];
}

/**
 * Get the previous sibling instance
 */
export function getPreviousSiblingInstance(
	instanceId: string,
	instances: NodeInstance[]
): NodeInstance | null {
	const instance = instances.find((inst) => inst.instanceId === instanceId);
	if (!instance) return null;

	const siblings = instances.filter(
		(inst) =>
			inst.parentInstanceId === instance.parentInstanceId &&
			inst.instanceId !== instanceId &&
			inst.siblingOrder < instance.siblingOrder
	);

	if (siblings.length === 0) return null;

	return siblings.sort((a, b) => b.siblingOrder - a.siblingOrder)[0];
}

/**
 * Get the breadcrumb path from root to a specific node
 * Returns array of node titles in order from root to target
 */
export function getNodePath(
	nodeId: string,
	nodes: Record<string, TreeNode>,
	instances: NodeInstance[]
): string[] {
	// Find the first instance of this node
	const targetInstance = instances.find((inst) => inst.nodeId === nodeId);
	if (!targetInstance) return [];

	const path: string[] = [];
	let currentInstance = targetInstance;

	// Walk up the tree to build the path
	while (currentInstance) {
		const node = nodes[currentInstance.nodeId];
		if (node) {
			path.unshift(node.title); // Add to beginning of array
		}

		if (!currentInstance.parentInstanceId) break;

		const parentInstance = instances.find(
			(inst) => inst.instanceId === currentInstance.parentInstanceId
		);
		if (!parentInstance) break;

		currentInstance = parentInstance;
	}

	return path;
}
