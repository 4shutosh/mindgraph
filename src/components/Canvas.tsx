import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import {
	ReactFlow,
	Node,
	Edge,
	Background,
	Controls,
	useNodesState,
	useEdgesState,
	Connection,
	NodeTypes,
	BackgroundVariant,
	SelectionMode,
	ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { MindGraph, TreeNode, NodeInstance } from "../types";
import {
	createNode,
	createNodeInstance,
	createEdge,
	getChildrenInstances,
	getAllDescendants,
	getParentInstance,
	getFirstChildInstance,
	getNextSiblingInstance,
	getPreviousSiblingInstance,
} from "../utils/nodeHelpers";
import { recalculateLayout } from "../utils/layoutHelpers";
import MindNode, { MindNodeData } from "./MindNode";
import SearchDropdown from "./SearchDropdown";
import ConfirmDialog from "./ConfirmDialog";
import ContextMenu from "./ContextMenu";
import { NodeSearchTrie } from "../utils/trie";
import { copyTreeAsImage } from "../utils/imageExport";

const nodeTypes: NodeTypes = {
	mindNode: MindNode,
};

// Maximum number of hyperlink suggestions to show
const MAX_HYPERLINK_SUGGESTIONS = 10;

interface CanvasProps {
	graph: MindGraph;
	onGraphChange: (graph: MindGraph) => void;
	instanceToEditId: string | null;
}

/**
 * Main canvas component using React Flow
 */
export default function Canvas({
	graph,
	onGraphChange,
	instanceToEditId,
}: CanvasProps) {
	const [nodes, setNodes, onNodesChange] = useNodesState<Node<MindNodeData>>(
		[]
	);
	const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
	const [editingInstanceId, setEditingInstanceId] = useState<string | null>(
		null
	);
	const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
		new Set()
	);
	const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
	const [targetDropOrder, setTargetDropOrder] = useState<number | null>(null);
	const [dragStartPos, setDragStartPos] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const [isDraggingForReparent, setIsDraggingForReparent] = useState(false);
	const [potentialDropParentId, setPotentialDropParentId] = useState<
		string | null
	>(null);
	const reactFlowInstance = useRef<ReactFlowInstance<
		Node<MindNodeData>,
		Edge
	> | null>(null);

	// Hyperlinking state
	const [isHyperlinkMode, setIsHyperlinkMode] = useState(false);
	const [hyperlinkQuery, setHyperlinkQuery] = useState("");
	const [hyperlinkSuggestions, setHyperlinkSuggestions] = useState<TreeNode[]>(
		[]
	);
	const [dropdownPosition, setDropdownPosition] = useState<{
		x: number;
		y: number;
	}>({ x: 0, y: 0 });
	const searchTrie = useRef(new NodeSearchTrie());
	const isSelectingHyperlinkRef = useRef(false); // Flag to prevent input events during selection

	// Confirmation dialog state
	const [showConfirmDialog, setShowConfirmDialog] = useState(false);
	const [confirmDialogData, setConfirmDialogData] = useState<{
		title: string;
		message: string;
		onConfirm: () => void;
	} | null>(null);
	const pendingDeletionRef = useRef<Set<string> | null>(null);

	// Context menu state
	const [contextMenu, setContextMenu] = useState<{
		position: { x: number; y: number };
		instanceId: string;
	} | null>(null);

	// Pre-compute child counts for performance (used in dropdown)
	const childCountsMap = useMemo(() => {
		const counts = new Map<string, number>();
		graph.instances.forEach((inst) => {
			if (inst.parentInstanceId) {
				const current = counts.get(inst.parentInstanceId) || 0;
				counts.set(inst.parentInstanceId, current + 1);
			}
		});
		return counts;
	}, [graph.instances]);

	// Pre-compute instance lookup map for performance
	const instanceMap = useMemo(() => {
		const map = new Map<string, NodeInstance>();
		graph.instances.forEach((inst) => map.set(inst.instanceId, inst));
		return map;
	}, [graph.instances]);

	// Effect to trigger editing mode from parent
	useEffect(() => {
		if (instanceToEditId) {
			setEditingInstanceId(instanceToEditId);
		}
	}, [instanceToEditId]);

	// Rebuild the search trie whenever nodes change
	useEffect(() => {
		const nodesForTrie = Object.values(graph.nodes).filter(
			(node) => node.title && node.title.trim() !== ""
		);
		searchTrie.current.rebuild(
			Object.fromEntries(nodesForTrie.map((node) => [node.nodeId, node]))
		);
	}, [graph.nodes]);

	// Helper: Find all nodes that have hyperlinks pointing to the given nodeIds
	const findHyperlinkedNodes = useCallback(
		(nodeIds: Set<string>): TreeNode[] => {
			const hyperlinkedNodes: TreeNode[] = [];
			Object.values(graph.nodes).forEach((node) => {
				if (node.hyperlinkTargetId && nodeIds.has(node.hyperlinkTargetId)) {
					hyperlinkedNodes.push(node);
				}
			});
			return hyperlinkedNodes;
		},
		[graph.nodes]
	);

	// Helper: Check if reparenting would create a circular dependency
	const wouldCreateCircularDependency = useCallback(
		(draggedInstanceId: string, newParentInstanceId: string): boolean => {
			// Can't be a child of yourself
			if (draggedInstanceId === newParentInstanceId) {
				return true;
			}

			// Check if the new parent is a descendant of the dragged node
			const descendants = getAllDescendants(draggedInstanceId, graph.instances);
			return descendants.some((d) => d.instanceId === newParentInstanceId);
		},
		[graph.instances]
	);

	// Delete a specific instance and its descendants
	// Only deletes the underlying node if no other instances reference it
	const deleteInstance = useCallback(
		(instanceId: string) => {
			const instanceToDelete = graph.instances.find(
				(inst) => inst.instanceId === instanceId
			);

			if (!instanceToDelete) {
				setEditingInstanceId(null);
				return;
			}

			// Get all descendants of this instance to delete
			const descendants = getAllDescendants(instanceId, graph.instances);
			const instanceIdsToDelete = new Set<string>([
				instanceId,
				...descendants.map((d) => d.instanceId),
			]);

			// Check for hyperlinks before deletion
			const remainingInstances = graph.instances.filter(
				(inst) => !instanceIdsToDelete.has(inst.instanceId)
			);
			const remainingNodeIds = new Set(
				remainingInstances.map((inst) => inst.nodeId)
			);

			// Get nodeIds that will be deleted
			const nodeIdsToDelete = new Set<string>();
			Object.keys(graph.nodes).forEach((nodeId) => {
				if (!remainingNodeIds.has(nodeId)) {
					nodeIdsToDelete.add(nodeId);
				}
			});

			// Check if any nodes have hyperlinks pointing to nodes being deleted
			// Note: For single instance deletion (e.g., canceling edit), we silently convert
			// hyperlinks without showing a dialog for better UX
			// findHyperlinkedNodes(nodeIdsToDelete); // Hyperlinks will be handled below

			// Filter out edges connected to deleted instances
			const remainingEdges = graph.edges.filter(
				(edge) =>
					!instanceIdsToDelete.has(edge.source) &&
					!instanceIdsToDelete.has(edge.target)
			);

			// Update nodes: convert hyperlinked nodes to regular copies
			const updatedNodes: Record<string, TreeNode> = {};
			Object.entries(graph.nodes).forEach(([nodeId, node]) => {
				if (remainingNodeIds.has(nodeId)) {
					const isHyperlinkedToDeleted =
						node.hyperlinkTargetId &&
						nodeIdsToDelete.has(node.hyperlinkTargetId);

					if (isHyperlinkedToDeleted) {
						const { hyperlinkTargetId, ...nodeWithoutHyperlink } = node;
						updatedNodes[nodeId] = {
							...nodeWithoutHyperlink,
							updatedAt: Date.now(),
						};
					} else {
						updatedNodes[nodeId] = node;
					}
				}
			});

			// Recalculate layout for remaining nodes
			const layoutedInstances = recalculateLayout(
				remainingInstances,
				updatedNodes
			);

			onGraphChange({
				...graph,
				nodes: updatedNodes,
				instances: layoutedInstances,
				edges: remainingEdges,
				focusedInstanceId: null,
			});
			setEditingInstanceId(null);
		},
		[graph, onGraphChange, findHyperlinkedNodes]
	);

	// Check if a specific instance has any children
	const instanceHasChildren = useCallback(
		(instanceId: string): boolean => {
			const children = getChildrenInstances(instanceId, graph.instances);
			return children.length > 0;
		},
		[graph.instances]
	);

	// Handle real-time width changes while editing
	const handleWidthChange = useCallback(
		(_nodeId: string, widthDelta: number) => {
			if (!editingInstanceId || widthDelta === 0) return;

			const editingInstance = graph.instances.find(
				(inst) => inst.instanceId === editingInstanceId
			);
			if (!editingInstance) return;

			// Get all descendants
			const descendants = getAllDescendants(
				editingInstance.instanceId,
				graph.instances
			);
			const descendantIds = new Set(descendants.map((d) => d.instanceId));

			// Update positions of all descendants
			const updatedInstances = graph.instances.map((instance) => {
				if (descendantIds.has(instance.instanceId)) {
					return {
						...instance,
						position: {
							...instance.position,
							x: instance.position.x + widthDelta,
						},
					};
				}
				return instance;
			});

			// Update the graph with new positions
			onGraphChange({
				...graph,
				instances: updatedInstances,
			});
		},
		[editingInstanceId, graph, onGraphChange]
	);

	// Handle hyperlink click - navigate to the target node
	const handleHyperlinkClick = useCallback(
		(targetNodeId: string) => {
			// Find the first instance of the target node
			const targetInstance = graph.instances.find(
				(inst) => inst.nodeId === targetNodeId
			);

			if (!targetInstance) return;

			// Find all ancestors of the target node
			const getAncestors = (instanceId: string): string[] => {
				const ancestors: string[] = [];
				let current = graph.instances.find(
					(inst) => inst.instanceId === instanceId
				);

				while (current && current.parentInstanceId) {
					ancestors.push(current.parentInstanceId);
					current = graph.instances.find(
						(inst) => inst.instanceId === current!.parentInstanceId
					);
				}

				return ancestors;
			};

			const ancestorIds = getAncestors(targetInstance.instanceId);

			// Expand any collapsed ancestors
			let updatedInstances = graph.instances.map((inst) => {
				if (ancestorIds.includes(inst.instanceId) && inst.isCollapsed) {
					return {
						...inst,
						isCollapsed: false,
					};
				}
				return inst;
			});

			// Check if we need to recalculate layout (if any ancestors were expanded)
			const anyExpanded = updatedInstances.some(
				(inst, idx) => inst.isCollapsed !== graph.instances[idx].isCollapsed
			);

			if (anyExpanded) {
				// Recalculate layout with expanded ancestors
				updatedInstances = recalculateLayout(updatedInstances, graph.nodes);
			}

			// Update graph and focus on the target node
			onGraphChange({
				...graph,
				instances: updatedInstances,
				focusedInstanceId: targetInstance.instanceId,
			});

			// Pan to the target node after a short delay to allow layout recalculation
			setTimeout(() => {
				if (reactFlowInstance.current) {
					const node = reactFlowInstance.current.getNode(
						targetInstance.instanceId
					);
					if (node) {
						const zoom = reactFlowInstance.current.getZoom();
						reactFlowInstance.current.setCenter(
							node.position.x + 75,
							node.position.y + 20,
							{ zoom, duration: 500 }
						);
					}
				}
			}, 100);
		},
		[graph, onGraphChange]
	);

	// Handle hyperlink selection from dropdown
	const handleHyperlinkSelect = useCallback(
		(selectedNode: TreeNode) => {
			if (!editingInstanceId) return;

			const editingInstance = graph.instances.find(
				(inst) => inst.instanceId === editingInstanceId
			);
			if (!editingInstance) return;

			const currentNode = graph.nodes[editingInstance.nodeId];

			// Set flag to prevent input event processing
			isSelectingHyperlinkRef.current = true;

			// Exit hyperlink mode first
			setIsHyperlinkMode(false);
			setHyperlinkQuery("");
			setHyperlinkSuggestions([]);

			// Update the node to be a hyperlink - React will handle DOM updates
			const updatedNode: TreeNode = {
				...currentNode,
				title: selectedNode.title,
				hyperlinkTargetId: selectedNode.nodeId,
				updatedAt: Date.now(),
			};

			onGraphChange({
				...graph,
				nodes: { ...graph.nodes, [currentNode.nodeId]: updatedNode },
			});

			// Exit editing mode - React will re-render with new title
			setEditingInstanceId(null);

			// Reset flag after a short delay
			setTimeout(() => {
				isSelectingHyperlinkRef.current = false;
			}, 100);

			// Ensure canvas regains focus
			setTimeout(() => {
				const canvasElement = document.querySelector(".react-flow");
				if (canvasElement instanceof HTMLElement) {
					canvasElement.focus();
				}
			}, 100);
		},
		[editingInstanceId, graph, onGraphChange]
	);

	// Close hyperlink dropdown
	const closeHyperlinkDropdown = useCallback(() => {
		setIsHyperlinkMode(false);
		setHyperlinkQuery("");
		setHyperlinkSuggestions([]);
	}, []);

	// Monitor contentEditable input for "/" trigger
	useEffect(() => {
		const handleInput = (e: Event) => {
			// Skip if we're in the middle of selecting a hyperlink
			if (isSelectingHyperlinkRef.current) {
				return;
			}

			const target = e.target as HTMLElement;

			// Only process if we're editing and the target is contentEditable
			if (
				!editingInstanceId ||
				!target.isContentEditable ||
				!target.classList.contains("node-title")
			) {
				return;
			}

			const editingInstance = graph.instances.find(
				(inst) => inst.instanceId === editingInstanceId
			);
			if (!editingInstance) return;

			// Don't allow hyperlinking for root nodes
			if (editingInstance.parentInstanceId === null) {
				return;
			}

			const text = target.textContent || "";

			// Check if "/" was just typed
			if (text.startsWith("/") && !isHyperlinkMode) {
				// Enter hyperlink mode
				setIsHyperlinkMode(true);

				// Get query after "/"
				const query = text.slice(1);
				setHyperlinkQuery(query);

				// Show all nodes initially or filtered if there's already a query
				const currentNodeId = graph.nodes[editingInstance.nodeId].nodeId;

				if (query.trim()) {
					// Search for matching nodes
					const matchingNodeIds = searchTrie.current.search(
						query,
						MAX_HYPERLINK_SUGGESTIONS
					);
					const suggestions = Array.from(matchingNodeIds)
						.map((nodeId) => graph.nodes[nodeId])
						.filter(
							(node) =>
								node && node.nodeId !== currentNodeId && !node.hyperlinkTargetId
						)
						.slice(0, MAX_HYPERLINK_SUGGESTIONS);
					setHyperlinkSuggestions(suggestions);
				} else {
					// Show all available nodes
					const allNodes = Object.values(graph.nodes)
						.filter(
							(node) =>
								node &&
								node.nodeId !== currentNodeId &&
								!node.hyperlinkTargetId &&
								node.title &&
								node.title.trim() !== ""
						)
						.slice(0, MAX_HYPERLINK_SUGGESTIONS);
					setHyperlinkSuggestions(allNodes);
				}

				// Calculate dropdown position relative to the node
				const rect = target.getBoundingClientRect();
				setDropdownPosition({
					x: rect.left,
					y: rect.bottom + 5,
				});
			} else if (isHyperlinkMode && text.startsWith("/")) {
				// Continue hyperlink mode - extract query after "/"
				const query = text.slice(1);
				setHyperlinkQuery(query);

				// Search for matching nodes (exclude the current node)
				const currentNodeId = graph.nodes[editingInstance.nodeId].nodeId;
				if (query.trim()) {
					const matchingNodeIds = searchTrie.current.search(
						query,
						MAX_HYPERLINK_SUGGESTIONS
					);
					const suggestions = Array.from(matchingNodeIds)
						.map((nodeId) => graph.nodes[nodeId])
						.filter(
							(node) =>
								node && node.nodeId !== currentNodeId && !node.hyperlinkTargetId
						)
						.slice(0, MAX_HYPERLINK_SUGGESTIONS);
					setHyperlinkSuggestions(suggestions);
				} else {
					// Show all available nodes when only "/" is present
					const allNodes = Object.values(graph.nodes)
						.filter(
							(node) =>
								node &&
								node.nodeId !== currentNodeId &&
								!node.hyperlinkTargetId &&
								node.title &&
								node.title.trim() !== ""
						)
						.slice(0, MAX_HYPERLINK_SUGGESTIONS);
					setHyperlinkSuggestions(allNodes);
				}

				// Update dropdown position
				const rect = target.getBoundingClientRect();
				setDropdownPosition({
					x: rect.left,
					y: rect.bottom + 5,
				});
			} else if (isHyperlinkMode && !text.startsWith("/")) {
				// User deleted the "/" - exit hyperlink mode
				setIsHyperlinkMode(false);
				setHyperlinkQuery("");
				setHyperlinkSuggestions([]);
			}
		};

		document.addEventListener("input", handleInput, true);
		return () => document.removeEventListener("input", handleInput, true);
	}, [editingInstanceId, graph, isHyperlinkMode]);

	// Finish editing and save changes
	const handleFinishEdit = useCallback(
		(nodeId: string, newTitle: string, _widthDelta: number = 0) => {
			// Get the instance being edited
			const editingInstance = graph.instances.find(
				(inst) => inst.instanceId === editingInstanceId
			);

			// If title is empty, delete this specific instance (if it has no children)
			if (newTitle.trim() === "") {
				if (
					editingInstance &&
					!instanceHasChildren(editingInstance.instanceId)
				) {
					deleteInstance(editingInstance.instanceId);
					return;
				}
				// If instance has children, keep it with empty title
				// (User can manually delete it later if needed)
			}

			const currentNode = graph.nodes[nodeId];
			const trimmedTitle = newTitle.trim() || "(empty)";

			// Check if this node is a hyperlink and if the title has changed
			// If title changed, break the hyperlink
			const shouldBreakHyperlink =
				currentNode.hyperlinkTargetId && currentNode.title !== trimmedTitle;

			const updatedNode = {
				...currentNode,
				title: trimmedTitle,
				updatedAt: Date.now(),
				// Remove hyperlinkTargetId if title changed
				...(shouldBreakHyperlink ? { hyperlinkTargetId: undefined } : {}),
			};

			onGraphChange({
				...graph,
				nodes: { ...graph.nodes, [nodeId]: updatedNode },
				// Ensure the edited instance remains focused after editing
				focusedInstanceId:
					editingInstance?.instanceId || graph.focusedInstanceId,
			});

			setEditingInstanceId(null);

			// Ensure canvas regains focus after editing
			setTimeout(() => {
				const canvasElement = document.querySelector(".react-flow");
				if (canvasElement instanceof HTMLElement) {
					canvasElement.focus();
				}
			}, 100);
		},
		[
			graph,
			onGraphChange,
			deleteInstance,
			instanceHasChildren,
			editingInstanceId,
		]
	);

	// Cancel editing - only delete if instance is empty AND has no children
	const handleCancelEdit = useCallback(
		(nodeId: string) => {
			const node = graph.nodes[nodeId];
			const editingInstance = graph.instances.find(
				(inst) => inst.instanceId === editingInstanceId
			);

			// Only delete if the node is empty/new and this instance has no children
			if ((!node.title || node.title.trim() === "") && editingInstance) {
				if (!instanceHasChildren(editingInstance.instanceId)) {
					deleteInstance(editingInstance.instanceId);
					return;
				}
			}
			// If node has content or children, just exit edit mode
			setEditingInstanceId(null);

			// Ensure canvas regains focus after editing
			setTimeout(() => {
				const canvasElement = document.querySelector(".react-flow");
				if (canvasElement instanceof HTMLElement) {
					canvasElement.focus();
				}
			}, 100);
		},
		[
			graph.nodes,
			graph.instances,
			deleteInstance,
			instanceHasChildren,
			editingInstanceId,
		]
	);

	// Toggle collapse/expand of a subtree
	const handleToggleCollapse = useCallback(
		(instanceId: string) => {
			const targetInstance = graph.instances.find(
				(inst) => inst.instanceId === instanceId
			);
			if (!targetInstance) return;

			// Toggle the collapsed state
			const updatedInstances = graph.instances.map((inst) => {
				if (inst.instanceId === targetInstance.instanceId) {
					return {
						...inst,
						isCollapsed: !inst.isCollapsed,
					};
				}
				return inst;
			});

			// Recalculate layout with new collapsed state
			const layoutedInstances = recalculateLayout(
				updatedInstances,
				graph.nodes
			);

			onGraphChange({
				...graph,
				instances: layoutedInstances,
				focusedInstanceId: null, // Clear focus when collapsing/expanding
			});
		},
		[graph, onGraphChange]
	);

	// Create a child node for a specific instance (used by indicator button click)
	const handleCreateChildFor = useCallback(
		(parentInstanceId: string) => {
			const parentInstance = graph.instances.find(
				(inst) => inst.instanceId === parentInstanceId
			);
			if (!parentInstance) return;

			const newNode = createNode();
			const existingChildren = getChildrenInstances(
				parentInstance.instanceId,
				graph.instances
			);

			// Create new instance with temporary position (will be recalculated)
			const newInstance = createNodeInstance(
				newNode.nodeId,
				{ x: 0, y: 0 }, // Temporary position
				parentInstance.instanceId,
				parentInstance.depth + 1,
				existingChildren.length
			);

			// Add the new instance
			const instancesWithNew = [...graph.instances, newInstance];

			// Apply d3 layout to calculate proper positions
			const layoutedInstances = recalculateLayout(instancesWithNew, {
				...graph.nodes,
				[newNode.nodeId]: newNode,
			});

			// Create edge from parent to child
			const newEdge = createEdge(
				parentInstance.instanceId,
				newInstance.instanceId
			);

			const updatedGraph: MindGraph = {
				...graph,
				nodes: { ...graph.nodes, [newNode.nodeId]: newNode },
				instances: layoutedInstances,
				edges: [...graph.edges, newEdge],
				focusedInstanceId: newInstance.instanceId,
			};

			onGraphChange(updatedGraph);
			// Start editing immediately
			setTimeout(() => {
				setEditingInstanceId(newInstance.instanceId);
			}, 50);
		},
		[graph, onGraphChange]
	);

	// Create a sibling node for a specific instance (used by ghost node click)
	const handleCreateSiblingFor = useCallback(
		(siblingInstanceId: string) => {
			const currentInstance = graph.instances.find(
				(inst) => inst.instanceId === siblingInstanceId
			);
			if (!currentInstance) return;

			const newNode = createNode();

			// Create new instance with temporary position (will be recalculated)
			const newInstance = createNodeInstance(
				newNode.nodeId,
				{ x: 0, y: 0 }, // Temporary position
				currentInstance.parentInstanceId,
				currentInstance.depth,
				currentInstance.siblingOrder + 1 // Insert right after current instance
			);

			// Update sibling orders for nodes that come after
			const updatedInstances = graph.instances.map((inst) => {
				if (
					inst.parentInstanceId === currentInstance.parentInstanceId &&
					inst.siblingOrder > currentInstance.siblingOrder
				) {
					return { ...inst, siblingOrder: inst.siblingOrder + 1 };
				}
				return inst;
			});

			// Add the new instance
			const instancesWithNew = [...updatedInstances, newInstance];

			// Apply d3 layout to calculate proper positions
			const layoutedInstances = recalculateLayout(instancesWithNew, {
				...graph.nodes,
				[newNode.nodeId]: newNode,
			});

			// Create edge from parent to new sibling
			const newEdges = [...graph.edges];
			if (currentInstance.parentInstanceId) {
				newEdges.push(
					createEdge(currentInstance.parentInstanceId, newInstance.instanceId)
				);
			}

			const updatedGraph: MindGraph = {
				...graph,
				nodes: { ...graph.nodes, [newNode.nodeId]: newNode },
				instances: layoutedInstances,
				edges: newEdges,
				rootNodeId: graph.rootNodeId || newNode.nodeId,
				focusedInstanceId: newInstance.instanceId,
			};

			onGraphChange(updatedGraph);
			// Start editing immediately
			setTimeout(() => {
				setEditingInstanceId(newInstance.instanceId);
			}, 50);
		},
		[graph, onGraphChange]
	);

	// Handle context menu on root node
	const handleContextMenu = useCallback(
		(event: React.MouseEvent, instanceId: string) => {
			event.preventDefault();
			event.stopPropagation();
			
			setContextMenu({
				position: { x: event.clientX, y: event.clientY },
				instanceId,
			});
		},
		[]
	);

	// Handle copy tree as image
	const handleCopyAsImage = useCallback(async () => {
		// Close context menu first
		setContextMenu(null);
		
		try {
			// Wait a bit for context menu to close and DOM to update
			await new Promise((resolve) => setTimeout(resolve, 50));
			
			await copyTreeAsImage({
				backgroundColor: null, // Transparent background
				scale: 2,
			});

			console.log("✅ Tree copied to clipboard!");
			alert("✅ Tree copied to clipboard!");
		} catch (error) {
			console.error("❌ Failed to copy tree as image:", error);
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			alert(`Failed to copy tree as image:\n${errorMessage}\n\nCheck console for details.`);
		}
	}, []);

	// Close context menu
	const handleCloseContextMenu = useCallback(() => {
		setContextMenu(null);
	}, []);

	// Convert graph data to React Flow format
	const syncGraphToFlow = useCallback(() => {
		// Helper: Get all instances that should be hidden (descendants of collapsed nodes)
		const getHiddenInstanceIds = (): Set<string> => {
			const hidden = new Set<string>();
			graph.instances.forEach((instance) => {
				if (instance.isCollapsed) {
					// Hide all descendants of this collapsed node
					const descendants = getAllDescendants(
						instance.instanceId,
						graph.instances
					);
					descendants.forEach((desc) => hidden.add(desc.instanceId));
				}
			});
			return hidden;
		};

		// Helper: Count descendants for collapsed nodes
		const countDescendants = (instanceId: string): number => {
			const descendants = getAllDescendants(instanceId, graph.instances);
			return descendants.length;
		};

		const hiddenInstanceIds = getHiddenInstanceIds();

		const flowNodes: Node<MindNodeData>[] = graph.instances
			.filter((instance) => {
				// Only include instances that have a valid node and are not hidden
				return (
					graph.nodes[instance.nodeId] !== undefined &&
					!hiddenInstanceIds.has(instance.instanceId)
				);
			})
			.map((instance) => {
				const treeNode = graph.nodes[instance.nodeId];
				const isFocused = instance.instanceId === graph.focusedInstanceId;
				const isEditing = instance.instanceId === editingInstanceId;
				const isRoot = instance.parentInstanceId === null;
				const isDragging = instance.instanceId === draggingNodeId;
				const isCollapsed = instance.isCollapsed || false;
				const collapsedCount = isCollapsed
					? countDescendants(instance.instanceId)
					: 0;

				// Determine if this node is at the target drop position (for vertical reordering)
				let isDragOver = false;
				if (
					draggingNodeId &&
					targetDropOrder !== null &&
					!isDraggingForReparent
				) {
					const draggingInstance = graph.instances.find(
						(i) => i.instanceId === draggingNodeId
					);
					if (
						draggingInstance &&
						instance.parentInstanceId === draggingInstance.parentInstanceId &&
						instance.instanceId !== draggingNodeId
					) {
						// Create node map for O(1) position lookups (performance optimization)
						const nodeMap = new Map(nodes.map((n) => [n.id, n]));

						// Get all siblings excluding the dragging node, sorted by Y position
						const otherSiblings = graph.instances
							.filter(
								(inst) =>
									inst.parentInstanceId === draggingInstance.parentInstanceId &&
									inst.instanceId !== draggingNodeId
							)
							.sort((a, b) => {
								const nodeA = nodeMap.get(a.instanceId);
								const nodeB = nodeMap.get(b.instanceId);
								return (nodeA?.position.y ?? 0) - (nodeB?.position.y ?? 0);
							});

						// Highlight the sibling that will be at the target position after the drop
						const targetIndex = targetDropOrder;
						if (targetIndex < otherSiblings.length) {
							// Highlight the sibling at the target index (the dragged node will be inserted before it)
							isDragOver =
								instance.instanceId === otherSiblings[targetIndex].instanceId;
						}
					}
				}

				// Determine if this node is a valid drop target for reparenting
				const isValidDropTarget = Boolean(
					isDraggingForReparent &&
						draggingNodeId &&
						instance.instanceId !== draggingNodeId &&
						!wouldCreateCircularDependency(draggingNodeId, instance.instanceId)
				);

				// Highlight if this is the current potential drop parent
				const isDropTargetHovered = Boolean(
					isValidDropTarget && instance.instanceId === potentialDropParentId
				);

				// Check if this node has children
				const hasChildren =
					getChildrenInstances(instance.instanceId, graph.instances).length > 0;

				// Check if this node is a hyperlink
				const isHyperlink = Boolean(treeNode.hyperlinkTargetId);

				// Check if multiple nodes are selected (for hiding UI elements)
				const isMultipleSelected = selectedNodeIds.size > 1;

				return {
					id: instance.instanceId,
					type: "mindNode",
					position: instance.position,
					positionAbsolute: instance.position, // Ensure absolute positioning
					data: {
						node: treeNode,
						isEditing,
						isRoot,
						onFinishEdit: handleFinishEdit,
						onCancelEdit: handleCancelEdit,
						onWidthChange: handleWidthChange,
						isDragging,
						isDragOver,
						isValidDropTarget,
						isDropTargetHovered,
						isCollapsed,
						collapsedCount,
						hasChildren,
						onToggleCollapse: handleToggleCollapse,
						onHyperlinkClick: handleHyperlinkClick,
						isHyperlink,
						isHyperlinkMode,
						isMultipleSelected,
						onCreateChild: !isHyperlink
							? () => handleCreateChildFor(instance.instanceId)
							: undefined,
						onCreateSibling: instance.parentInstanceId
							? () => handleCreateSiblingFor(instance.instanceId)
							: undefined,
						onContextMenu: handleContextMenu,
					},
					selected: isFocused,
					draggable: !isEditing, // Allow dragging all nodes when not editing (including roots)
				};
			});

		const flowEdges: Edge[] = graph.edges
			.filter((edge) => {
				// Filter out edges to hidden nodes
				return (
					!hiddenInstanceIds.has(edge.source) &&
					!hiddenInstanceIds.has(edge.target)
				);
			})
			.map((edge) => ({
				id: edge.id,
				source: edge.source,
				target: edge.target,
				type: "default",
				animated: false,
				selectable: false,
				focusable: false,
				deletable: false,
				interactable: false,
				style: { pointerEvents: "none" },
			}));

		// Add ghost edge preview during reparenting - balanced visibility
		if (isDraggingForReparent && potentialDropParentId && draggingNodeId) {
			flowEdges.push({
				id: `ghost-edge-${potentialDropParentId}-${draggingNodeId}`,
				source: potentialDropParentId,
				target: draggingNodeId,
				type: "default",
				animated: false,
				selectable: false,
				focusable: false,
				deletable: false,
				style: {
					stroke: "#3b82f6",
					strokeWidth: 2,
					strokeDasharray: "5,5",
					opacity: 0.6,
					pointerEvents: "none",
				},
			});
		}

		setNodes(flowNodes);
		setEdges(flowEdges);
	}, [
		graph,
		editingInstanceId,
		draggingNodeId,
		targetDropOrder,
		isDraggingForReparent,
		potentialDropParentId,
		wouldCreateCircularDependency,
		handleFinishEdit,
		handleCancelEdit,
		handleWidthChange,
		handleToggleCollapse,
		handleHyperlinkClick,
		handleCreateChildFor,
		handleCreateSiblingFor,
		setNodes,
		setEdges,
	]);
	useEffect(() => {
		syncGraphToFlow();
	}, [syncGraphToFlow]);

	// Pan to newly created/editing nodes
	useEffect(() => {
		if (editingInstanceId && reactFlowInstance.current) {
			const node = reactFlowInstance.current.getNode(editingInstanceId);
			if (node) {
				const zoom = reactFlowInstance.current.getZoom();
				reactFlowInstance.current.setCenter(
					node.position.x + 75, // offset to center of node (approximate)
					node.position.y + 20,
					{ zoom, duration: 300 }
				);
			}
		}
	}, [editingInstanceId]);

	// Disable manual edge connections - edges are created automatically
	const onConnect = useCallback((_connection: Connection) => {
		// Manual connections disabled - all edges created automatically via Tab/Enter
	}, []);

	// Create a sibling node (Enter key)
	const handleCreateSibling = useCallback(() => {
		if (!graph.focusedInstanceId) return;

		const currentInstance = graph.instances.find(
			(inst) => inst.instanceId === graph.focusedInstanceId
		);
		if (!currentInstance) return;

		const newNode = createNode();

		// Create new instance with temporary position (will be recalculated)
		const newInstance = createNodeInstance(
			newNode.nodeId,
			{ x: 0, y: 0 }, // Temporary position
			currentInstance.parentInstanceId,
			currentInstance.depth,
			currentInstance.siblingOrder + 1 // Insert right after current instance
		);

		// Update sibling orders for nodes that come after
		const updatedInstances = graph.instances.map((inst) => {
			if (
				inst.parentInstanceId === currentInstance.parentInstanceId &&
				inst.siblingOrder > currentInstance.siblingOrder
			) {
				return { ...inst, siblingOrder: inst.siblingOrder + 1 };
			}
			return inst;
		});

		// Add the new instance
		const instancesWithNew = [...updatedInstances, newInstance];

		// Apply d3 layout to calculate proper positions
		const layoutedInstances = recalculateLayout(instancesWithNew, {
			...graph.nodes,
			[newNode.nodeId]: newNode,
		});

		// Create edge from parent to new sibling
		const newEdges = [...graph.edges];
		if (currentInstance.parentInstanceId) {
			newEdges.push(
				createEdge(currentInstance.parentInstanceId, newInstance.instanceId)
			);
		}

		const updatedGraph: MindGraph = {
			...graph,
			nodes: { ...graph.nodes, [newNode.nodeId]: newNode },
			instances: layoutedInstances,
			edges: newEdges,
			rootNodeId: graph.rootNodeId || newNode.nodeId,
			focusedInstanceId: newInstance.instanceId,
		};

		onGraphChange(updatedGraph);
		// Start editing immediately
		setTimeout(() => {
			setEditingInstanceId(newInstance.instanceId);
		}, 50);
	}, [graph, onGraphChange]);

	// Create a child node (Tab key)
	const handleCreateChild = useCallback(() => {
		if (!graph.focusedInstanceId) return;

		const parentInstance = graph.instances.find(
			(inst) => inst.instanceId === graph.focusedInstanceId
		);
		if (!parentInstance) return;

		const newNode = createNode();
		const existingChildren = getChildrenInstances(
			parentInstance.instanceId,
			graph.instances
		);

		// Create new instance with temporary position (will be recalculated)
		const newInstance = createNodeInstance(
			newNode.nodeId,
			{ x: 0, y: 0 }, // Temporary position
			parentInstance.instanceId,
			parentInstance.depth + 1,
			existingChildren.length
		);

		// Add the new instance
		const instancesWithNew = [...graph.instances, newInstance];

		// Apply d3 layout to calculate proper positions
		const layoutedInstances = recalculateLayout(instancesWithNew, {
			...graph.nodes,
			[newNode.nodeId]: newNode,
		});

		// Create edge from parent to child
		const newEdge = createEdge(
			parentInstance.instanceId,
			newInstance.instanceId
		);

		const updatedGraph: MindGraph = {
			...graph,
			nodes: { ...graph.nodes, [newNode.nodeId]: newNode },
			instances: layoutedInstances,
			edges: [...graph.edges, newEdge],
			focusedInstanceId: newInstance.instanceId,
		};

		onGraphChange(updatedGraph);
		// Start editing immediately
		setTimeout(() => {
			setEditingInstanceId(newInstance.instanceId);
		}, 50);
	}, [graph, onGraphChange]);

	// Handle selection change
	const handleSelectionChange = useCallback(
		({ nodes: selectedNodes }: { nodes: Node[] }) => {
			const selectedIds = new Set(selectedNodes.map((node) => node.id));
			setSelectedNodeIds(selectedIds);
		},
		[]
	);

	// Handle node click to focus (or edit if already focused)
	const handleNodeClick = useCallback(
		(_event: React.MouseEvent, node: Node) => {
			// If clicking on already focused node, enter edit mode
			if (graph.focusedInstanceId === node.id) {
				setEditingInstanceId(node.id);
				return;
			}

			// Otherwise, just focus the node
			onGraphChange({
				...graph,
				focusedInstanceId: node.id,
			});

			// Ensure React Flow container gets focus for keyboard navigation
			// Use requestAnimationFrame for better timing with React's rendering cycle
			requestAnimationFrame(() => {
				const reactFlowElement = document.querySelector(".react-flow");
				if (reactFlowElement instanceof HTMLElement) {
					reactFlowElement.focus();
				}
			});
		},
		[graph, onGraphChange]
	);

	// Handle node double-click to start editing
	const handleNodeDoubleClick = useCallback(
		(_event: React.MouseEvent, node: Node) => {
			setEditingInstanceId(node.id);
		},
		[]
	);

	// Handle ReactFlow initialization
	const onInit = useCallback(
		(instance: ReactFlowInstance<Node<MindNodeData>, Edge>) => {
			reactFlowInstance.current = instance;
		},
		[]
	);

	// Arrow key navigation handlers - only move if valid target exists
	const handleNavigateLeft = useCallback(() => {
		if (!graph.focusedInstanceId) return;

		const parentInstance = getParentInstance(
			graph.focusedInstanceId,
			graph.instances
		);
		// Only move if parent exists - otherwise focus stays where it is
		if (parentInstance) {
			onGraphChange({
				...graph,
				focusedInstanceId: parentInstance.instanceId,
			});
		}
	}, [graph, onGraphChange]);

	const handleNavigateRight = useCallback(() => {
		if (!graph.focusedInstanceId) return;

		const firstChild = getFirstChildInstance(
			graph.focusedInstanceId,
			graph.instances
		);
		// Only move if child exists - otherwise focus stays where it is
		if (firstChild) {
			onGraphChange({
				...graph,
				focusedInstanceId: firstChild.instanceId,
			});
		}
	}, [graph, onGraphChange]);

	const handleNavigateDown = useCallback(() => {
		if (!graph.focusedInstanceId) return;

		const nextSibling = getNextSiblingInstance(
			graph.focusedInstanceId,
			graph.instances
		);
		// Only move if next sibling exists - otherwise focus stays where it is
		if (nextSibling) {
			onGraphChange({
				...graph,
				focusedInstanceId: nextSibling.instanceId,
			});
		}
	}, [graph, onGraphChange]);

	const handleNavigateUp = useCallback(() => {
		if (!graph.focusedInstanceId) return;

		const previousSibling = getPreviousSiblingInstance(
			graph.focusedInstanceId,
			graph.instances
		);
		// Only move if previous sibling exists - otherwise focus stays where it is
		if (previousSibling) {
			onGraphChange({
				...graph,
				focusedInstanceId: previousSibling.instanceId,
			});
		}
	}, [graph, onGraphChange]);

	// Helper: Perform the actual deletion after confirmation
	const performDeletion = useCallback(
		(instancesToDelete: Set<string>) => {
			console.log(
				"[DEBUG] performDeletion called with",
				instancesToDelete.size,
				"instances"
			);

			// Filter out deleted instances
			const remainingInstances = graph.instances.filter(
				(inst) => !instancesToDelete.has(inst.instanceId)
			);

			// Filter out edges connected to deleted instances
			const remainingEdges = graph.edges.filter(
				(edge) =>
					!instancesToDelete.has(edge.source) &&
					!instancesToDelete.has(edge.target)
			);

			// Find which nodes are being deleted (no longer referenced by any remaining instance)
			const remainingNodeIds = new Set(
				remainingInstances.map((inst) => inst.nodeId)
			);

			// Get nodeIds that will be deleted
			const nodeIdsToDelete = new Set<string>();
			Object.keys(graph.nodes).forEach((nodeId) => {
				if (!remainingNodeIds.has(nodeId)) {
					nodeIdsToDelete.add(nodeId);
				}
			});

			// Convert hyperlinked nodes into regular copies (break the hyperlink)
			const updatedNodes: Record<string, TreeNode> = {};
			Object.entries(graph.nodes).forEach(([nodeId, node]) => {
				if (remainingNodeIds.has(nodeId)) {
					// Check if this node is hyperlinked to a deleted node
					const isHyperlinkedToDeleted =
						node.hyperlinkTargetId &&
						nodeIdsToDelete.has(node.hyperlinkTargetId);

					if (isHyperlinkedToDeleted) {
						// Remove the hyperlink, converting it to a regular node copy
						const { hyperlinkTargetId, ...nodeWithoutHyperlink } = node;
						updatedNodes[nodeId] = {
							...nodeWithoutHyperlink,
							updatedAt: Date.now(),
						};
					} else {
						updatedNodes[nodeId] = node;
					}
				}
			});

			// Recalculate layout for remaining nodes
			const layoutedInstances = recalculateLayout(
				remainingInstances,
				updatedNodes
			);

			// Update graph
			const updatedGraph = {
				...graph,
				nodes: updatedNodes,
				instances: layoutedInstances,
				edges: remainingEdges,
				focusedInstanceId:
					graph.focusedInstanceId &&
					instancesToDelete.has(graph.focusedInstanceId)
						? null
						: graph.focusedInstanceId,
			};

			onGraphChange(updatedGraph);

			// Clear editing state if deleted node was being edited
			if (editingInstanceId && instancesToDelete.has(editingInstanceId)) {
				setEditingInstanceId(null);
			}
		},
		[graph, onGraphChange, editingInstanceId, findHyperlinkedNodes]
	);

	// Delete selected nodes and their subtrees
	const handleDeleteNodes = useCallback(() => {
		// Use our tracked selection state
		if (selectedNodeIds.size === 0) {
			return;
		}

		// Prevent deletion if dialog is already showing
		if (showConfirmDialog) {
			console.log(
				"[DEBUG] handleDeleteNodes called but dialog already open, aborting"
			);
			return;
		}

		console.log("[DEBUG] handleDeleteNodes: Starting deletion check");

		const selectedInstanceIds = Array.from(selectedNodeIds);

		// Find all descendants of selected nodes
		const instancesToDelete = new Set<string>();
		selectedInstanceIds.forEach((instanceId) => {
			instancesToDelete.add(instanceId);
			const descendants = getAllDescendants(instanceId, graph.instances);
			descendants.forEach((d) => instancesToDelete.add(d.instanceId));
		});

		// Find which nodes will be deleted (no longer referenced by any remaining instance)
		const remainingInstances = graph.instances.filter(
			(inst) => !instancesToDelete.has(inst.instanceId)
		);
		const remainingNodeIds = new Set(
			remainingInstances.map((inst) => inst.nodeId)
		);

		// Get nodeIds that will be deleted
		const nodeIdsToDelete = new Set<string>();
		Object.keys(graph.nodes).forEach((nodeId) => {
			if (!remainingNodeIds.has(nodeId)) {
				nodeIdsToDelete.add(nodeId);
			}
		});

		// Check if any nodes have hyperlinks pointing to nodes being deleted
		const hyperlinkedNodes = findHyperlinkedNodes(nodeIdsToDelete);

		if (hyperlinkedNodes.length > 0) {
			// Show confirmation dialog
			const nodeCount = nodeIdsToDelete.size;
			const hyperlinkCount = hyperlinkedNodes.length;
			const message = `You are about to delete ${nodeCount} node${
				nodeCount > 1 ? "s" : ""
			}.\n\nWarning: ${hyperlinkCount} hyperlinked node${
				hyperlinkCount > 1 ? "s" : ""
			} refer${hyperlinkCount > 1 ? "" : "s"} the current node${
				nodeCount > 1 ? "s" : ""
			} being deleted.\n\nThese hyperlinked nodes will be converted to regular copies to maintain tree integrity.\n\nDo you want to proceed?`;

			console.log("[DEBUG] Showing dialog, storing pending deletion");
			pendingDeletionRef.current = instancesToDelete;
			setConfirmDialogData({
				title: "Delete Node with Hyperlinks",
				message,
				onConfirm: () => {
					console.log("[DEBUG] User confirmed deletion");
					if (pendingDeletionRef.current) {
						performDeletion(pendingDeletionRef.current);
						pendingDeletionRef.current = null;
					}
					setShowConfirmDialog(false);
					setConfirmDialogData(null);
				},
			});
			setShowConfirmDialog(true);
		} else {
			// No hyperlinks, proceed with deletion directly
			console.log("[DEBUG] No hyperlinks, deleting directly");
			performDeletion(instancesToDelete);
		}
	}, [
		selectedNodeIds,
		graph,
		findHyperlinkedNodes,
		performDeletion,
		showConfirmDialog,
	]);

	// Global keyboard event listener for React Flow v12 compatibility
	// Note: React Flow v12 changed how onKeyDown events are handled internally.
	// The onKeyDown prop no longer works reliably, so we use a global event listener instead.
	useEffect(() => {
		const handleGlobalKeyDown = (e: KeyboardEvent) => {
			// Only handle if React Flow container has focus or if a node is focused
			const reactFlowElement = document.querySelector(".react-flow");
			if (!reactFlowElement || !document.activeElement) return;

			// Check if focus is within React Flow or if we have a focused node
			const isWithinReactFlow =
				reactFlowElement.contains(document.activeElement) ||
				document.activeElement === reactFlowElement ||
				graph.focusedInstanceId;

			if (!isWithinReactFlow) return;

			// Ignore if typing in input/textarea or if we're currently editing
			if (
				editingInstanceId ||
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLButtonElement ||
				e.target instanceof HTMLSelectElement
			) {
				return;
			}

			// Ignore if hyperlink dropdown is open (let SearchDropdown handle keyboard events)
			if (isHyperlinkMode) {
				return;
			}

			// Ignore if confirmation dialog is open
			if (showConfirmDialog) {
				return;
			}

			// Delete selected nodes: Delete or Backspace (handle this first, regardless of focus)
			if (e.key === "Delete" || e.key === "Backspace") {
				e.preventDefault();
				handleDeleteNodes();
				return;
			}

			// Arrow key navigation - only handle if we have a focused node
			if (graph.focusedInstanceId) {
				if (e.key === "ArrowLeft") {
					e.preventDefault();
					e.stopPropagation();
					handleNavigateLeft();
				} else if (e.key === "ArrowRight") {
					e.preventDefault();
					e.stopPropagation();
					handleNavigateRight();
				} else if (e.key === "ArrowDown") {
					e.preventDefault();
					e.stopPropagation();
					handleNavigateDown();
				} else if (e.key === "ArrowUp") {
					e.preventDefault();
					e.stopPropagation();
					handleNavigateUp();
				} else if (e.key === "Enter") {
					e.preventDefault();
					e.stopPropagation();
					// Create sibling when node is focused
					handleCreateSibling();
				} else if (e.key === "Tab") {
					e.preventDefault();
					e.stopPropagation();
					// Create child when node is focused
					handleCreateChild();
				}
			}
			// Create sibling: Enter (when no node is focused)
			else if (e.key === "Enter") {
				e.preventDefault();
				handleCreateSibling();
			}
			// Create child: Tab (when no node is focused)
			else if (e.key === "Tab") {
				e.preventDefault();
				handleCreateChild();
			}
		};

		window.addEventListener("keydown", handleGlobalKeyDown);
		return () => window.removeEventListener("keydown", handleGlobalKeyDown);
	}, [
		graph,
		handleNavigateLeft,
		handleNavigateRight,
		handleNavigateDown,
		handleNavigateUp,
		handleCreateSibling,
		handleCreateChild,
		handleDeleteNodes,
		editingInstanceId,
		isHyperlinkMode,
		showConfirmDialog,
	]);

	// Handle node drag start
	const handleNodeDragStart = useCallback(
		(_event: React.MouseEvent, node: Node) => {
			setDraggingNodeId(node.id);
			setTargetDropOrder(null);
			setDragStartPos({ x: node.position.x, y: node.position.y });
			setIsDraggingForReparent(false);
			setPotentialDropParentId(null);
		},
		[]
	);

	// Handle node drag - determine target drop position or reparent target
	const handleNodeDrag = useCallback(
		(_event: React.MouseEvent, node: Node) => {
			if (!reactFlowInstance.current || !draggingNodeId || !dragStartPos)
				return;

			const draggingInstance = graph.instances.find(
				(inst) => inst.instanceId === draggingNodeId
			);
			if (!draggingInstance) return;

			// Root nodes can be freely positioned - no reorder/reparent logic needed
			if (draggingInstance.parentInstanceId === null) {
				setIsDraggingForReparent(false);
				setPotentialDropParentId(null);
				setTargetDropOrder(null);
				return;
			}

			// Calculate movements from start position
			const horizontalMovement = Math.abs(node.position.x - dragStartPos.x);
			const verticalMovement = Math.abs(node.position.y - dragStartPos.y);

			// IMPROVED LOGIC: Check if we're hovering over a potential drop target
			// Need to be smart about depth 1+ where nodes are vertically close
			let hoveringOverValidTarget = false;

			// Check if we're near any node that's NOT a sibling
			graph.instances.forEach((instance) => {
				// Skip self
				if (instance.instanceId === draggingNodeId) return;

				// Skip if it would create circular dependency
				if (wouldCreateCircularDependency(draggingNodeId, instance.instanceId))
					return;

				// Skip siblings (same parent) - we want to reorder those, not reparent
				if (instance.parentInstanceId === draggingInstance.parentInstanceId)
					return;

				const targetNode = reactFlowInstance.current?.getNode(
					instance.instanceId
				);
				if (!targetNode) return;

				// Calculate horizontal and vertical distances separately
				const horizontalDist = Math.abs(
					targetNode.position.x - node.position.x
				);
				const verticalDist = Math.abs(targetNode.position.y - node.position.y);
				const totalDistance = Math.sqrt(
					Math.pow(horizontalDist, 2) + Math.pow(verticalDist, 2)
				);

				// For nodes at the same depth (potential cousins), require horizontal movement
				// to avoid false reparent detection when just reordering siblings
				const isSameDepth = instance.depth === draggingInstance.depth;
				const HOVER_THRESHOLD = 150;
				const SAME_DEPTH_HORIZONTAL_THRESHOLD = 80; // Need to move horizontally to reparent cousins

				if (isSameDepth) {
					// At same depth: only consider reparenting if there's significant horizontal movement
					if (
						totalDistance < HOVER_THRESHOLD &&
						horizontalDist > SAME_DEPTH_HORIZONTAL_THRESHOLD
					) {
						hoveringOverValidTarget = true;
					}
				} else {
					// Different depth: normal hover detection
					if (totalDistance < HOVER_THRESHOLD) {
						hoveringOverValidTarget = true;
					}
				}
			});

			// DETECTION LOGIC:
			// 1. If hovering over a valid non-sibling target with appropriate movement -> REPARENT MODE
			// 2. Else if significant horizontal movement (not just vertical) -> REPARENT MODE
			// 3. Else -> REORDER MODE (vertical reordering of siblings)
			const REPARENT_THRESHOLD = 100;

			// Prefer reorder mode if movement is primarily vertical
			const isPrimarylyVertical = verticalMovement > horizontalMovement * 2;
			const hasSignificantHorizontalMovement =
				horizontalMovement > REPARENT_THRESHOLD;

			const isReparentMode =
				(hoveringOverValidTarget && !isPrimarylyVertical) ||
				hasSignificantHorizontalMovement;
			setIsDraggingForReparent(isReparentMode);

			if (isReparentMode) {
				// REPARENT MODE: Find closest valid parent node
				let closestParent: string | null = null;
				let closestDistance = Infinity;

				graph.instances.forEach((instance) => {
					// Skip self and invalid targets
					if (
						instance.instanceId === draggingNodeId ||
						wouldCreateCircularDependency(draggingNodeId, instance.instanceId)
					) {
						return;
					}

					const targetNode = reactFlowInstance.current?.getNode(
						instance.instanceId
					);
					if (!targetNode) return;

					// Calculate distance from dragged node to this potential parent
					const distance = Math.sqrt(
						Math.pow(targetNode.position.x - node.position.x, 2) +
							Math.pow(targetNode.position.y - node.position.y, 2)
					);

					// Update closest if this is nearer and within reasonable range
					const MAX_DROP_DISTANCE = 300; // Increased range to make targeting easier
					if (distance < closestDistance && distance < MAX_DROP_DISTANCE) {
						closestDistance = distance;
						closestParent = instance.instanceId;
					}
				});

				setPotentialDropParentId(closestParent);
				setTargetDropOrder(null); // Clear reorder target
			} else {
				// REORDER MODE: Determine vertical position among siblings
				setPotentialDropParentId(null); // Clear reparent target

				// Get all siblings (excluding the dragging node) sorted by their current siblingOrder
				const otherSiblings = graph.instances
					.filter(
						(inst) =>
							inst.parentInstanceId === draggingInstance.parentInstanceId &&
							inst.instanceId !== draggingNodeId
					)
					.map((inst) => {
						const rfNode = reactFlowInstance.current?.getNode(inst.instanceId);
						return {
							instance: inst,
							yPos: rfNode?.position.y ?? 0,
							order: inst.siblingOrder,
						};
					})
					.sort((a, b) => a.yPos - b.yPos);

				// Find where the dragged node should be inserted based on Y position
				const draggedY = node.position.y;
				let newOrder = 0;

				// Find the first sibling whose Y position is greater than dragged Y
				for (let i = 0; i < otherSiblings.length; i++) {
					const sibling = otherSiblings[i];
					if (draggedY < sibling.yPos) {
						// Insert before this sibling
						newOrder = i;
						break;
					}
					// If we've checked all siblings and dragged Y is below all of them
					if (i === otherSiblings.length - 1) {
						newOrder = otherSiblings.length;
					}
				}

				// If there are no other siblings, order should be 0
				if (otherSiblings.length === 0) {
					newOrder = 0;
				}

				setTargetDropOrder(newOrder);
			}
		},
		[
			graph.instances,
			draggingNodeId,
			dragStartPos,
			wouldCreateCircularDependency,
		]
	);

	// Handle node drag stop - reorder siblings OR reparent if needed
	const handleNodeDragStop = useCallback(
		(_event: React.MouseEvent, node: Node) => {
			// Get the dragging instance before clearing state
			const draggingInstance = graph.instances.find(
				(inst) => inst.instanceId === draggingNodeId
			);

			// Capture current state before clearing
			const isReparenting = isDraggingForReparent;
			const dropParentId = potentialDropParentId;
			const dropOrder = targetDropOrder;

			// Clear drag state
			setDraggingNodeId(null);
			setTargetDropOrder(null);
			setDragStartPos(null);
			setIsDraggingForReparent(false);
			setPotentialDropParentId(null);

			// Validate we have all required data
			if (!draggingInstance) {
				return;
			}

			// ROOT NODE: Just update position, no reordering needed
			if (draggingInstance.parentInstanceId === null && draggingNodeId) {
				const updatedInstances = graph.instances.map((inst) => {
					if (inst.instanceId === draggingNodeId) {
						return {
							...inst,
							position: {
								x: node.position.x,
								y: node.position.y,
							},
						};
					}
					return inst;
				});

				// Update all descendants positions relative to the root's new position
				const descendants = getAllDescendants(draggingNodeId, graph.instances);
				const deltaX = node.position.x - draggingInstance.position.x;
				const deltaY = node.position.y - draggingInstance.position.y;

				const finalInstances = updatedInstances.map((inst) => {
					if (descendants.some((d) => d.instanceId === inst.instanceId)) {
						return {
							...inst,
							position: {
								x: inst.position.x + deltaX,
								y: inst.position.y + deltaY,
							},
						};
					}
					return inst;
				});

				onGraphChange({
					...graph,
					instances: finalInstances,
				});
				return;
			}

			// REPARENT MODE
			if (isReparenting && dropParentId) {
				console.log("🔄 Reparenting:", {
					node: graph.nodes[draggingInstance.nodeId]?.title,
					newParent:
						graph.nodes[
							graph.instances.find((i) => i.instanceId === dropParentId)
								?.nodeId || ""
						]?.title,
				});

				// Remove old edge
				const updatedEdges = graph.edges.filter(
					(edge) => edge.target !== draggingInstance.instanceId
				);

				// Add new edge from new parent
				const newEdge = createEdge(dropParentId, draggingInstance.instanceId);
				updatedEdges.push(newEdge);

				// Get the new parent's children to determine sibling order
				const newParentChildren = getChildrenInstances(
					dropParentId,
					graph.instances
				);
				const newSiblingOrder = newParentChildren.length; // Add as last child

				// Get the new parent to determine new depth
				const newParentInstance = graph.instances.find(
					(i) => i.instanceId === dropParentId
				);
				const newDepth = newParentInstance ? newParentInstance.depth + 1 : 0;

				// Update the dragged node and all its descendants
				const descendants = getAllDescendants(
					draggingInstance.instanceId,
					graph.instances
				);
				const depthDelta = newDepth - draggingInstance.depth;

				const updatedInstances = graph.instances.map((inst) => {
					// Update the dragged node itself
					if (inst.instanceId === draggingInstance.instanceId) {
						return {
							...inst,
							parentInstanceId: dropParentId,
							depth: newDepth,
							siblingOrder: newSiblingOrder,
						};
					}

					// Update all descendants' depths
					if (descendants.some((d) => d.instanceId === inst.instanceId)) {
						return {
							...inst,
							depth: inst.depth + depthDelta,
						};
					}

					return inst;
				});

				// Recalculate layout
				const layoutedInstances = recalculateLayout(
					updatedInstances,
					graph.nodes
				);

				// Update graph
				onGraphChange({
					...graph,
					instances: layoutedInstances,
					edges: updatedEdges,
					focusedInstanceId: null,
				});

				return;
			}

			// REORDER MODE
			if (!isReparenting && dropOrder !== null) {
				const oldOrder = draggingInstance.siblingOrder;
				const newOrder = dropOrder;

				// No change needed
				if (oldOrder === newOrder) {
					return;
				}

				console.log("🔄 Reordering:", {
					node: graph.nodes[draggingInstance.nodeId]?.title,
					from: oldOrder,
					to: newOrder,
				});

				// Update sibling orders - simple approach
				const updatedInstances = graph.instances.map((inst) => {
					// Only affect siblings of the same parent
					if (inst.parentInstanceId !== draggingInstance.parentInstanceId) {
						return inst;
					}

					// The dragged node gets the new order
					if (inst.instanceId === draggingInstance.instanceId) {
						return { ...inst, siblingOrder: newOrder };
					}

					// Adjust other siblings' orders
					const currentOrder = inst.siblingOrder;

					if (oldOrder < newOrder) {
						// Moving down: shift nodes between old and new position up
						if (currentOrder > oldOrder && currentOrder <= newOrder) {
							return { ...inst, siblingOrder: currentOrder - 1 };
						}
					} else {
						// Moving up: shift nodes between new and old position down
						if (currentOrder >= newOrder && currentOrder < oldOrder) {
							return { ...inst, siblingOrder: currentOrder + 1 };
						}
					}

					return inst;
				});

				// Recalculate layout
				const layoutedInstances = recalculateLayout(
					updatedInstances,
					graph.nodes
				);

				console.log(
					"✅ New order:",
					layoutedInstances
						.filter(
							(i) => i.parentInstanceId === draggingInstance.parentInstanceId
						)
						.sort((a, b) => a.siblingOrder - b.siblingOrder)
						.map((i) => ({
							order: i.siblingOrder,
							title: graph.nodes[i.nodeId]?.title,
						}))
				);

				// Update graph
				onGraphChange({
					...graph,
					instances: layoutedInstances,
					focusedInstanceId: null, // Clear focus after drag operation
				});
			}
		},
		[
			graph,
			draggingNodeId,
			targetDropOrder,
			isDraggingForReparent,
			potentialDropParentId,
			onGraphChange,
		]
	);

	return (
		<ReactFlow
			nodes={nodes}
			edges={edges}
			onNodesChange={onNodesChange}
			onEdgesChange={onEdgesChange}
			onConnect={onConnect}
			onNodeClick={handleNodeClick}
			onNodeDoubleClick={handleNodeDoubleClick}
			onNodeDragStart={handleNodeDragStart}
			onNodeDrag={handleNodeDrag}
			onNodeDragStop={handleNodeDragStop}
			onSelectionChange={handleSelectionChange}
			onInit={onInit}
			nodeTypes={nodeTypes}
			minZoom={0.1}
			maxZoom={2}
			fitView
			defaultEdgeOptions={{
				type: "default",
				animated: false,
			}}
			connectOnClick={false}
			panOnDrag={false}
			panOnScroll={true}
			selectionOnDrag={true}
			panActivationKeyCode="Space"
			multiSelectionKeyCode="Shift"
			selectionMode={SelectionMode.Partial}
			nodesDraggable={false}
			nodesConnectable={false}
			elementsSelectable={true}
			nodesFocusable={true}
			edgesFocusable={false}
			disableKeyboardA11y={false}
			deleteKeyCode={null}
			tabIndex={0}
		>
			<Background variant={BackgroundVariant.Dots} />
			<Controls />
			{/* <MiniMap /> */}

			{/* Hyperlink search dropdown */}
			{isHyperlinkMode && (
				<SearchDropdown
					query={hyperlinkQuery}
					suggestions={hyperlinkSuggestions}
					position={dropdownPosition}
					onSelect={handleHyperlinkSelect}
					onClose={closeHyperlinkDropdown}
					nodes={graph.nodes}
					instances={graph.instances}
					childCountsMap={childCountsMap}
					instanceMap={instanceMap}
				/>
			)}

			{/* Confirmation dialog for hyperlink deletion */}
			{showConfirmDialog && confirmDialogData && (
				<ConfirmDialog
					isOpen={showConfirmDialog}
					title={confirmDialogData.title}
					message={confirmDialogData.message}
					onConfirm={confirmDialogData.onConfirm}
					onCancel={() => {
						console.log("[DEBUG] User cancelled deletion");
						setShowConfirmDialog(false);
						setConfirmDialogData(null);
						pendingDeletionRef.current = null;
					}}
					confirmText="Delete"
					cancelText="Cancel"
				/>
			)}

			{/* Context menu for root node */}
			{contextMenu && (
				<ContextMenu
					items={[
						{
							label: "Copy as Image",
							icon: "📋",
							onClick: handleCopyAsImage,
						},
					]}
					position={contextMenu.position}
					onClose={handleCloseContextMenu}
				/>
			)}
		</ReactFlow>
	);
}
