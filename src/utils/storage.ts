import { MindGraph, AppState, CanvasData } from "../types";

const STORAGE_KEY = "mindgraph-data";
const APP_STATE_KEY = "mindgraph-app-state";

/**
 * Generate a unique ID
 */
function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create an empty canvas with a default name
 */
export function createEmptyCanvas(name: string = "Untitled Canvas"): CanvasData {
	const now = Date.now();
	return {
		id: generateId(),
		name,
		graph: createEmptyGraph(),
		createdAt: now,
		updatedAt: now,
	};
}

/**
 * Create default app state with one empty canvas
 */
export function createDefaultAppState(): AppState {
	const canvas = createEmptyCanvas("My First Canvas");
	return {
		canvases: [canvas],
		activeCanvasId: canvas.id,
	};
}

/**
 * Save app state to localStorage
 */
export function saveAppState(appState: AppState): void {
	try {
		localStorage.setItem(APP_STATE_KEY, JSON.stringify(appState));
	} catch (error) {
		console.error("Failed to save app state:", error);
	}
}

/**
 * Load app state from localStorage
 */
export function loadAppState(): AppState | null {
	try {
		const data = localStorage.getItem(APP_STATE_KEY);
		if (!data) {
			// Check for old storage format and migrate
			return migrateFromOldStorage();
		}
		return JSON.parse(data) as AppState;
	} catch (error) {
		console.error("Failed to load app state:", error);
		return null;
	}
}

/**
 * Migrate from old single-graph storage to new multi-canvas format
 */
function migrateFromOldStorage(): AppState | null {
	try {
		const oldGraph = loadGraph();
		if (oldGraph) {
			console.log("Migrating from old storage format...");
			const canvas: CanvasData = {
				id: generateId(),
				name: "Main Canvas",
				graph: oldGraph,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			};
			const appState: AppState = {
				canvases: [canvas],
				activeCanvasId: canvas.id,
			};
			// Save in new format and remove old key
			saveAppState(appState);
			localStorage.removeItem(STORAGE_KEY);
			return appState;
		}
		return null;
	} catch (error) {
		console.error("Failed to migrate from old storage:", error);
		return null;
	}
}

/**
 * Save graph data to localStorage (legacy - kept for backward compatibility)
 */
export function saveGraph(graph: MindGraph): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
	} catch (error) {
		console.error("Failed to save graph:", error);
	}
}

/**
 * Load graph data from localStorage (legacy - kept for backward compatibility)
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
