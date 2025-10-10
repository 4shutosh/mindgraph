import { useCallback, useEffect, useState, useRef } from "react";
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

import { MindGraph } from "../types";
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

const nodeTypes: NodeTypes = {
	mindNode: MindNode,
};

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

	// Effect to trigger editing mode from parent
	useEffect(() => {
		if (instanceToEditId) {
			setEditingInstanceId(instanceToEditId);
		}
	}, [instanceToEditId]);

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

	// Delete node and all its instances/edges
	const deleteNode = useCallback(
		(nodeId: string) => {
			// Find all instances with this nodeId
			const instancesToDelete = graph.instances.filter(
				(inst) => inst.nodeId === nodeId
			);

			if (instancesToDelete.length === 0) {
				setEditingInstanceId(null);
				return;
			}

			// Get all instances to delete (the instance itself + all descendants)
			const allInstancesToDelete = instancesToDelete.flatMap((inst) => [
				inst, // Include the instance itself
				...getAllDescendants(inst.instanceId, graph.instances), // Plus all descendants
			]);
			const instanceIdsToDelete = new Set(
				allInstancesToDelete.map((inst) => inst.instanceId)
			);

			// Filter out deleted instances and their edges
			const remainingInstances = graph.instances.filter(
				(inst) => !instanceIdsToDelete.has(inst.instanceId)
			);
			const remainingEdges = graph.edges.filter(
				(edge) =>
					!instanceIdsToDelete.has(edge.source) &&
					!instanceIdsToDelete.has(edge.target)
			);

			// Remove nodes that are no longer referenced
			const remainingNodeIds = new Set(
				remainingInstances.map((inst) => inst.nodeId)
			);
			const remainingNodes: Record<string, (typeof graph.nodes)[string]> = {};
			Object.entries(graph.nodes).forEach(([nodeId, node]) => {
				if (remainingNodeIds.has(nodeId)) {
					remainingNodes[nodeId] = node;
				}
			});

			// Recalculate layout for remaining nodes
			const layoutedInstances = recalculateLayout(
				remainingInstances,
				remainingNodes
			);

			onGraphChange({
				...graph,
				nodes: remainingNodes,
				instances: layoutedInstances,
				edges: remainingEdges,
				focusedInstanceId: null,
			});
			setEditingInstanceId(null);
		},
		[graph, onGraphChange]
	); // Check if a node has any children instances
	const nodeHasChildren = useCallback(
		(nodeId: string): boolean => {
			// Find all instances of this node
			const nodeInstances = graph.instances.filter(
				(inst) => inst.nodeId === nodeId
			);
			// Check if any instance has children
			return nodeInstances.some((instance) => {
				const children = getChildrenInstances(
					instance.instanceId,
					graph.instances
				);
				return children.length > 0;
			});
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

	// Finish editing and save changes
	const handleFinishEdit = useCallback(
		(nodeId: string, newTitle: string, _widthDelta: number = 0) => {
			// If title is empty, only delete if node has no children
			if (newTitle.trim() === "") {
				if (!nodeHasChildren(nodeId)) {
					deleteNode(nodeId);
					return;
				}
				// If node has children, keep it with empty title
				// (User can manually delete it later if needed)
			}

			const updatedNode = {
				...graph.nodes[nodeId],
				title: newTitle.trim() || "(empty)", // Show placeholder for empty nodes with children
				updatedAt: Date.now(),
			};

			// Find the instance that was being edited to maintain focus
			const editingInstance = graph.instances.find(
				(inst) => inst.instanceId === editingInstanceId
			);

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
		[graph, onGraphChange, deleteNode, nodeHasChildren, editingInstanceId]
	);

	// Cancel editing - only delete if node is empty AND has no children
	const handleCancelEdit = useCallback(
		(nodeId: string) => {
			const node = graph.nodes[nodeId];
			// Only delete if the node is empty/new and has no children
			if (!node.title || node.title.trim() === "") {
				if (!nodeHasChildren(nodeId)) {
					deleteNode(nodeId);
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
		[graph.nodes, deleteNode, nodeHasChildren]
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
			});
		},
		[graph, onGraphChange]
	);

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
						instance.parentInstanceId === draggingInstance.parentInstanceId
					) {
						// Highlight the node that's currently at the target drop position
						isDragOver = instance.siblingOrder === targetDropOrder;
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
					},
					selected: isFocused,
					draggable: !isEditing && !isRoot, // Allow dragging non-root nodes when not editing
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

	// Delete selected nodes and their subtrees
	const handleDeleteNodes = useCallback(() => {
		// Use our tracked selection state
		if (selectedNodeIds.size === 0) {
			return;
		}

		const selectedInstanceIds = Array.from(selectedNodeIds);

		// Find all descendants of selected nodes
		const instancesToDelete = new Set<string>();
		selectedInstanceIds.forEach((instanceId) => {
			instancesToDelete.add(instanceId);
			const descendants = getAllDescendants(instanceId, graph.instances);
			descendants.forEach((d) => instancesToDelete.add(d.instanceId));
		});

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

		// Find which nodes are no longer referenced by any instance
		const remainingNodeIds = new Set(
			remainingInstances.map((inst) => inst.nodeId)
		);
		const remainingNodes: Record<string, (typeof graph.nodes)[string]> = {};
		Object.entries(graph.nodes).forEach(([nodeId, node]) => {
			if (remainingNodeIds.has(nodeId)) {
				remainingNodes[nodeId] = node;
			}
		});

		// Recalculate layout for remaining nodes
		const layoutedInstances = recalculateLayout(
			remainingInstances,
			remainingNodes
		);

		// Update graph
		const updatedGraph = {
			...graph,
			nodes: remainingNodes,
			instances: layoutedInstances,
			edges: remainingEdges,
			focusedInstanceId:
				graph.focusedInstanceId &&
				instancesToDelete.has(graph.focusedInstanceId)
					? null
					: graph.focusedInstanceId,
		};

		onGraphChange(updatedGraph); // Clear editing state if deleted node was being edited
		if (editingInstanceId && instancesToDelete.has(editingInstanceId)) {
			setEditingInstanceId(null);
		}
	}, [selectedNodeIds, graph, onGraphChange, editingInstanceId]);

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

			// Calculate movements from start position
			const horizontalMovement = Math.abs(node.position.x - dragStartPos.x);

			// NEW LOGIC: Check if we're hovering over a potential drop target
			// This allows sibling-to-child reparenting even with vertical movement
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

				// Check if we're hovering near this node
				const distance = Math.sqrt(
					Math.pow(targetNode.position.x - node.position.x, 2) +
						Math.pow(targetNode.position.y - node.position.y, 2)
				);

				const HOVER_THRESHOLD = 150; // Distance to consider "hovering over"
				if (distance < HOVER_THRESHOLD) {
					hoveringOverValidTarget = true;
				}
			});

			// DETECTION LOGIC:
			// 1. If hovering over a valid non-sibling target -> REPARENT MODE
			// 2. Else if significant horizontal movement -> REPARENT MODE (for general reparenting)
			// 3. Else -> REORDER MODE (vertical reordering of siblings)
			const REPARENT_THRESHOLD = 100;
			const isReparentMode =
				hoveringOverValidTarget || horizontalMovement > REPARENT_THRESHOLD;
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

				// Get all siblings (including the dragging node) sorted by their Y position
				const allSiblings = graph.instances
					.filter(
						(inst) =>
							inst.parentInstanceId === draggingInstance.parentInstanceId
					)
					.map((inst) => {
						const rfNode = reactFlowInstance.current?.getNode(inst.instanceId);
						return { instance: inst, yPos: rfNode?.position.y ?? 0 };
					})
					.sort((a, b) => a.yPos - b.yPos);

				// Find where the dragged node would be inserted based on its current Y position
				const draggedY = node.position.y;
				let newOrder = 0;

				for (let i = 0; i < allSiblings.length; i++) {
					const sibling = allSiblings[i];

					// Skip the dragging node itself in the comparison
					if (sibling.instance.instanceId === draggingNodeId) continue;

					// If dragged position is below this sibling, increment target order
					if (draggedY > sibling.yPos) {
						newOrder++;
					}
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
		(_event: React.MouseEvent, _node: Node) => {
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
			tabIndex={0}
		>
			<Background variant={BackgroundVariant.Dots} />
			<Controls />
			{/* <MiniMap /> */}
		</ReactFlow>
	);
}
