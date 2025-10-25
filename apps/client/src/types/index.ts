/**
 * Core data structure for the mindgraph
 */

export interface TreeNode {
	/** Unique identifier for this node - the source of truth */
	nodeId: string;

	/** Display title of the node */
	title: string;

	/** Timestamp of creation */
	createdAt: number;

	/** Timestamp of last update */
	updatedAt: number;

	/** Child node IDs (references) */
	children: string[];

	/**
	 * If set, this node is a hyperlink pointing to another node.
	 * When clicked, the view will navigate to the target node.
	 * The hyperlink is automatically broken if the node's title changes.
	 */
	hyperlinkTargetId?: string;
}

/**
 * Position information for a node instance on the canvas
 * A node can appear multiple times with different positions
 */
export interface NodeInstance {
	/** Instance ID - unique for each visual appearance */
	instanceId: string;

	/** Reference to the actual node data */
	nodeId: string;

	/** Position on canvas */
	position: {
		x: number;
		y: number;
	};

	/** Parent instance ID (for tree structure) */
	parentInstanceId: string | null;

	/** Depth level in the tree (0 for root) */
	depth: number;

	/** Order among siblings (for consistent layout) */
	siblingOrder: number;

	/** Whether this node's children are collapsed/hidden */
	isCollapsed?: boolean;
}

/**
 * Edge connection between node instances
 */
export interface EdgeConnection {
	id: string;
	source: string; // instanceId
	target: string; // instanceId
}

/**
 * Complete graph structure
 */
export interface MindGraph {
	/** All unique nodes by their nodeId */
	nodes: Record<string, TreeNode>;

	/** Visual instances of nodes on canvas */
	instances: NodeInstance[];

	/** Connections between instances */
	edges: EdgeConnection[];

	/** Root node ID (entry point) */
	rootNodeId: string | null;

	/** Currently focused instance ID for keyboard navigation */
	focusedInstanceId: string | null;
}

/**
 * Canvas representation - a named workspace containing a graph
 */
export interface CanvasData {
	/** Unique identifier for this canvas */
	id: string;

	/** User-defined name for the canvas */
	name: string;

	/** The graph data for this canvas */
	graph: MindGraph;

	/** Timestamp of creation */
	createdAt: number;

	/** Timestamp of last update */
	updatedAt: number;
}

/**
 * Application state with multiple canvases
 */
export interface AppState {
	/** All canvases */
	canvases: CanvasData[];

	/** ID of the currently active canvas */
	activeCanvasId: string | null;
}
