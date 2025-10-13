import { MindGraph, TreeNode, NodeInstance, EdgeConnection } from "../types";
import { v4 as uuidv4 } from "uuid";

/**
 * Export file format with versioning and metadata
 */
export interface MindGraphExport {
	/** Format version for future compatibility */
	version: string;

	/** Export metadata */
	metadata: {
		exportedAt: number; // timestamp
		appVersion: string;
		nodeCount: number;
		instanceCount: number;
		edgeCount: number;
	};

	/** The actual graph data */
	graph: MindGraph;
}

const CURRENT_EXPORT_VERSION = "1.0.0";
const APP_VERSION = "0.1.0"; // Should match package.json

/**
 * Export the graph to a JSON string
 * @param graph - The graph to export
 * @param options - Export options
 * @param options.includeRedundantEdges - Whether to include edges (default: false, as they're derivable from instances)
 */
export function exportGraph(
	graph: MindGraph,
	options: { includeRedundantEdges?: boolean } = {}
): string {
	const { includeRedundantEdges = false } = options;

	// Create a clean graph for export
	const exportGraph: MindGraph = {
		nodes: graph.nodes,
		instances: graph.instances,
		edges: includeRedundantEdges ? graph.edges : [],
		rootNodeId: graph.rootNodeId,
		focusedInstanceId: graph.focusedInstanceId,
	};

	const exportData: MindGraphExport = {
		version: CURRENT_EXPORT_VERSION,
		metadata: {
			exportedAt: Date.now(),
			appVersion: APP_VERSION,
			nodeCount: Object.keys(graph.nodes).length,
			instanceCount: graph.instances.length,
			edgeCount: includeRedundantEdges ? graph.edges.length : 0,
		},
		graph: exportGraph,
	};

	return JSON.stringify(exportData, null, 2);
}

/**
 * Derive edges from instances (for migration/compatibility)
 * Edges are redundant - they can be computed from parentInstanceId relationships
 */
function deriveEdgesFromInstances(instances: NodeInstance[]): EdgeConnection[] {
	return instances
		.filter((inst) => inst.parentInstanceId !== null)
		.map((inst) => ({
			id: `${inst.parentInstanceId}-${inst.instanceId}`,
			source: inst.parentInstanceId!,
			target: inst.instanceId,
		}));
}

/**
 * Import graph from JSON string with validation
 */
export function importGraph(jsonString: string): {
	success: boolean;
	graph?: MindGraph;
	error?: string;
} {
	try {
		const data = JSON.parse(jsonString) as MindGraphExport;

		// Validate structure
		if (!data.version || !data.graph) {
			return {
				success: false,
				error: "Invalid file format: missing version or graph data",
			};
		}

		// Version compatibility check
		if (!isVersionCompatible(data.version)) {
			return {
				success: false,
				error: `Incompatible version: ${data.version}. Expected ${CURRENT_EXPORT_VERSION}`,
			};
		}

		// Validate graph structure
		const validationError = validateGraph(data.graph);
		if (validationError) {
			return {
				success: false,
				error: validationError,
			};
		}

		// Ensure edges exist (for forward compatibility with v2.0 that may not have edges)
		// If edges are missing or empty, derive them from instances
		let finalGraph = data.graph;
		if (!finalGraph.edges || finalGraph.edges.length === 0) {
			console.log("Edges missing in import, deriving from instances...");
			finalGraph = {
				...finalGraph,
				edges: deriveEdgesFromInstances(finalGraph.instances),
			};
		}

		return {
			success: true,
			graph: finalGraph,
		};
	} catch (error) {
		return {
			success: false,
			error: `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

/**
 * Check if the import version is compatible with current version
 */
function isVersionCompatible(importVersion: string): boolean {
	// Currently only supporting exact match
	// In future, could implement more sophisticated version checking
	const [importMajor] = importVersion.split(".").map(Number);
	const [currentMajor] = CURRENT_EXPORT_VERSION.split(".").map(Number);

	return importMajor === currentMajor;
}

/**
 * Validate graph structure and data integrity
 */
function validateGraph(graph: MindGraph): string | null {
	// Check required properties
	if (typeof graph !== "object" || graph === null) {
		return "Graph must be an object";
	}

	if (!graph.nodes || typeof graph.nodes !== "object") {
		return "Missing or invalid nodes object";
	}

	if (!Array.isArray(graph.instances)) {
		return "Missing or invalid instances array";
	}

	if (!Array.isArray(graph.edges)) {
		// Allow missing edges (forward compatibility), but warn
		console.warn("Edges array missing, will be derived from instances");
		graph.edges = [];
	}

	// Validate nodes
	const nodeIds = new Set<string>();
	for (const [nodeId, node] of Object.entries(graph.nodes)) {
		if (!node.nodeId || !node.title || !node.createdAt || !node.updatedAt) {
			return `Invalid node structure for node ${nodeId}`;
		}

		if (node.nodeId !== nodeId) {
			return `Node ID mismatch: key=${nodeId}, node.nodeId=${node.nodeId}`;
		}

		if (!Array.isArray(node.children)) {
			return `Node ${nodeId} has invalid children array`;
		}

		// Validate hyperlink target if present
		if (node.hyperlinkTargetId !== undefined) {
			if (typeof node.hyperlinkTargetId !== 'string') {
				return `Node ${nodeId} has invalid hyperlinkTargetId type`;
			}
		}

		nodeIds.add(nodeId);
	}

	// Validate hyperlink references after all nodes are collected
	for (const [nodeId, node] of Object.entries(graph.nodes)) {
		if (node.hyperlinkTargetId && !nodeIds.has(node.hyperlinkTargetId)) {
			console.warn(`Node ${nodeId} has hyperlink to non-existent node ${node.hyperlinkTargetId}, will be removed`);
			// Remove broken hyperlink reference
			delete node.hyperlinkTargetId;
		}
	}

	// Validate instances
	const instanceIds = new Set<string>();
	for (const instance of graph.instances) {
		if (!instance.instanceId || !instance.nodeId) {
			return "Invalid instance structure: missing instanceId or nodeId";
		}

		if (!nodeIds.has(instance.nodeId)) {
			return `Instance ${instance.instanceId} references non-existent node ${instance.nodeId}`;
		}

		if (!instance.position || typeof instance.position.x !== "number" || typeof instance.position.y !== "number") {
			return `Instance ${instance.instanceId} has invalid position`;
		}

		if (typeof instance.depth !== "number" || typeof instance.siblingOrder !== "number") {
			return `Instance ${instance.instanceId} has invalid depth or siblingOrder`;
		}

		instanceIds.add(instance.instanceId);
	}

	// Validate edges (optional, can be derived)
	if (graph.edges && graph.edges.length > 0) {
		for (const edge of graph.edges) {
			if (!edge.id || !edge.source || !edge.target) {
				return "Invalid edge structure";
			}

			if (!instanceIds.has(edge.source)) {
				return `Edge ${edge.id} references non-existent source instance ${edge.source}`;
			}

			if (!instanceIds.has(edge.target)) {
				return `Edge ${edge.id} references non-existent target instance ${edge.target}`;
			}
		}
	}

	// Validate root node
	if (graph.rootNodeId && !nodeIds.has(graph.rootNodeId)) {
		return `Root node ${graph.rootNodeId} does not exist in nodes`;
	}

	// Validate focused instance
	if (graph.focusedInstanceId && !instanceIds.has(graph.focusedInstanceId)) {
		return `Focused instance ${graph.focusedInstanceId} does not exist in instances`;
	}

	return null; // All validations passed
}

/**
 * Download the exported JSON as a file
 */
export function downloadGraphAsFile(graph: MindGraph, filename?: string): void {
	const jsonString = exportGraph(graph);
	const blob = new Blob([jsonString], { type: "application/json" });
	const url = URL.createObjectURL(blob);

	const a = document.createElement("a");
	a.href = url;
	a.download = filename || `mindgraph-${Date.now()}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/**
 * Trigger file picker and import graph
 */
export function importGraphFromFile(): Promise<{
	success: boolean;
	graph?: MindGraph;
	error?: string;
}> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json,application/json";

		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) {
				resolve({
					success: false,
					error: "No file selected",
				});
				return;
			}

			try {
				const text = await file.text();
				const result = importGraph(text);
				resolve(result);
			} catch (error) {
				resolve({
					success: false,
					error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
		};

		input.oncancel = () => {
			resolve({
				success: false,
				error: "File selection cancelled",
			});
		};

		input.click();
	});
}

/**
 * Merge imported graph into current graph (non-destructive import)
 * Creates new IDs for all imported nodes/instances and offsets positions
 */
export function mergeGraphs(
	current: MindGraph,
	imported: MindGraph,
	options: {
		offsetX?: number;
		offsetY?: number;
		maintainRelativePositions?: boolean;
	} = {}
): MindGraph {
	const {
		offsetX = 400,
		offsetY = 0,
		maintainRelativePositions = true,
	} = options;

	// Create ID mappings to avoid conflicts
	const nodeIdMap = new Map<string, string>();
	const instanceIdMap = new Map<string, string>();

	// Generate new node IDs
	for (const nodeId of Object.keys(imported.nodes)) {
		nodeIdMap.set(nodeId, uuidv4());
	}

	// Generate new instance IDs
	for (const instance of imported.instances) {
		instanceIdMap.set(instance.instanceId, uuidv4());
	}

	// Remap nodes with new IDs
	const remappedNodes: Record<string, TreeNode> = {};
	for (const [oldNodeId, node] of Object.entries(imported.nodes)) {
		const newNodeId = nodeIdMap.get(oldNodeId)!;
		remappedNodes[newNodeId] = {
			...node,
			nodeId: newNodeId,
			// Update children references
			children: node.children.map((childId) => nodeIdMap.get(childId) || childId),
		};
	}

	// Calculate position offset
	let finalOffsetX = offsetX;
	let finalOffsetY = offsetY;

	if (maintainRelativePositions && imported.instances.length > 0) {
		// Find the bounds of imported instances
		const importedPositions = imported.instances.map((i) => i.position);
		const minX = Math.min(...importedPositions.map((p) => p.x));
		const minY = Math.min(...importedPositions.map((p) => p.y));

		// Find the bounds of current instances
		if (current.instances.length > 0) {
			const currentPositions = current.instances.map((i) => i.position);
			const maxX = Math.max(...currentPositions.map((p) => p.x));
			
			// Place imported graph to the right of current graph
			finalOffsetX = maxX + 300 - minX;
			finalOffsetY = -minY; // Center vertically relative to imported graph's center
		} else {
			// No existing instances, center imported graph
			finalOffsetX = -minX;
			finalOffsetY = -minY;
		}
	}

	// Remap instances with new IDs and offset positions
	const remappedInstances: NodeInstance[] = imported.instances.map((instance) => ({
		...instance,
		instanceId: instanceIdMap.get(instance.instanceId)!,
		nodeId: nodeIdMap.get(instance.nodeId)!,
		position: {
			x: instance.position.x + finalOffsetX,
			y: instance.position.y + finalOffsetY,
		},
		parentInstanceId: instance.parentInstanceId
			? instanceIdMap.get(instance.parentInstanceId) || null
			: null,
	}));

	// Remap edges with new instance IDs
	const remappedEdges: EdgeConnection[] = imported.edges.map((edge) => ({
		...edge,
		id: uuidv4(),
		source: instanceIdMap.get(edge.source)!,
		target: instanceIdMap.get(edge.target)!,
	}));

	// Merge with current graph
	return {
		nodes: {
			...current.nodes,
			...remappedNodes,
		},
		instances: [...current.instances, ...remappedInstances],
		edges: [...current.edges, ...remappedEdges],
		rootNodeId: current.rootNodeId, // Keep current root
		focusedInstanceId: current.focusedInstanceId,
	};
}

/**
 * Generate a sample/template graph for demonstration
 */
export function generateSampleGraph(): MindGraph {
	const now = Date.now();

	const nodes: Record<string, TreeNode> = {
		"sample-root": {
			nodeId: "sample-root",
			title: "My Knowledge Base",
			createdAt: now,
			updatedAt: now,
			children: ["sample-1", "sample-2"],
		},
		"sample-1": {
			nodeId: "sample-1",
			title: "Programming",
			createdAt: now,
			updatedAt: now,
			children: ["sample-1-1", "sample-1-2"],
		},
		"sample-2": {
			nodeId: "sample-2",
			title: "Design",
			createdAt: now,
			updatedAt: now,
			children: [],
		},
		"sample-1-1": {
			nodeId: "sample-1-1",
			title: "Frontend",
			createdAt: now,
			updatedAt: now,
			children: [],
		},
		"sample-1-2": {
			nodeId: "sample-1-2",
			title: "Backend",
			createdAt: now,
			updatedAt: now,
			children: [],
		},
	};

	return {
		nodes,
		instances: [
			{
				instanceId: "inst-root",
				nodeId: "sample-root",
				position: { x: 0, y: 0 },
				parentInstanceId: null,
				depth: 0,
				siblingOrder: 0,
			},
			{
				instanceId: "inst-1",
				nodeId: "sample-1",
				position: { x: 200, y: -100 },
				parentInstanceId: "inst-root",
				depth: 1,
				siblingOrder: 0,
			},
			{
				instanceId: "inst-2",
				nodeId: "sample-2",
				position: { x: 200, y: 100 },
				parentInstanceId: "inst-root",
				depth: 1,
				siblingOrder: 1,
			},
			{
				instanceId: "inst-1-1",
				nodeId: "sample-1-1",
				position: { x: 400, y: -150 },
				parentInstanceId: "inst-1",
				depth: 2,
				siblingOrder: 0,
			},
			{
				instanceId: "inst-1-2",
				nodeId: "sample-1-2",
				position: { x: 400, y: -50 },
				parentInstanceId: "inst-1",
				depth: 2,
				siblingOrder: 1,
			},
		],
		edges: [
			{ id: "edge-root-1", source: "inst-root", target: "inst-1" },
			{ id: "edge-root-2", source: "inst-root", target: "inst-2" },
			{ id: "edge-1-1-1", source: "inst-1", target: "inst-1-1" },
			{ id: "edge-1-1-2", source: "inst-1", target: "inst-1-2" },
		],
		rootNodeId: "sample-root",
		focusedInstanceId: null,
	};
}
