import { MindGraph } from "../types";

const STORAGE_KEY = "mindgraph-data";

/**
 * Save graph data to localStorage
 */
export function saveGraph(graph: MindGraph): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
	} catch (error) {
		console.error("Failed to save graph:", error);
	}
}

/**
 * Load graph data from localStorage
 */
export function loadGraph(): MindGraph | null {
	try {
		const data = localStorage.getItem(STORAGE_KEY);
		if (!data) return null;
		return JSON.parse(data) as MindGraph;
	} catch (error) {
		console.error("Failed to load graph:", error);
		return null;
	}
}

/**
 * Create an empty graph
 */
export function createEmptyGraph(): MindGraph {
	return {
		nodes: {},
		instances: [],
		edges: [],
		rootNodeId: null,
		focusedInstanceId: null,
	};
}
