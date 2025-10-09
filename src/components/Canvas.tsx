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
	getSiblingInstances,
	calculateSiblingPosition,
	calculateChildPosition,
	getAllDescendants,
	getParentInstance,
	getFirstChildInstance,
	getNextSiblingInstance,
	getPreviousSiblingInstance,
	updateSiblingPositions,
} from "../utils/nodeHelpers";
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
	const reactFlowInstance = useRef<ReactFlowInstance<
		Node<MindNodeData>,
		Edge
	> | null>(null);
	const hasInitialFit = useRef(false);

	// Effect to trigger editing mode from parent
	useEffect(() => {
		if (instanceToEditId) {
			setEditingInstanceId(instanceToEditId);
		}
	}, [instanceToEditId]);

	// Start editing a node
	const handleStartEdit = useCallback((instanceId: string) => {
		setEditingInstanceId(instanceId);
	}, []);

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

			onGraphChange({
				...graph,
				nodes: remainingNodes,
				instances: remainingInstances,
				edges: remainingEdges,
				focusedInstanceId: null,
			});

			setEditingInstanceId(null);
		},
		[graph, onGraphChange]
	);

	// Check if a node has any children instances
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

	// Finish editing and save changes
	const handleFinishEdit = useCallback(
		(nodeId: string, newTitle: string) => {
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

	// Convert graph data to React Flow format
	const syncGraphToFlow = useCallback(() => {
		const flowNodes: Node<MindNodeData>[] = graph.instances
			.filter((instance) => {
				// Only include instances that have a valid node
				return graph.nodes[instance.nodeId] !== undefined;
			})
			.map((instance) => {
				const treeNode = graph.nodes[instance.nodeId];
				const isFocused = instance.instanceId === graph.focusedInstanceId;
				const isEditing = instance.instanceId === editingInstanceId;
				const isRoot = instance.parentInstanceId === null;

				return {
					id: instance.instanceId,
					type: "mindNode",
					position: instance.position,
					data: {
						node: treeNode,
						isEditing,
						isRoot,
						onStartEdit: () => handleStartEdit(instance.instanceId),
						onFinishEdit: handleFinishEdit,
						onCancelEdit: handleCancelEdit,
					},
					selected: isFocused,
					draggable: true,
				};
			});

		const flowEdges: Edge[] = graph.edges.map((edge) => ({
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

		setNodes(flowNodes);
		setEdges(flowEdges);
	}, [
		graph,
		editingInstanceId,
		handleStartEdit,
		handleFinishEdit,
		handleCancelEdit,
		setNodes,
		setEdges,
	]);

	useEffect(() => {
		syncGraphToFlow();
	}, [syncGraphToFlow]);

	// Initial fit view once nodes are loaded
	useEffect(() => {
		if (
			!hasInitialFit.current &&
			nodes.length > 0 &&
			reactFlowInstance.current
		) {
			hasInitialFit.current = true;
			// Use requestAnimationFrame to ensure nodes are rendered
			requestAnimationFrame(() => {
				if (reactFlowInstance.current) {
					reactFlowInstance.current.fitView({
						padding: 0.2,
						maxZoom: 1,
						duration: 0,
					});
				}
			});
		}
	}, [nodes]);

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

	// Update graph when nodes are moved
	const handleNodesChange = useCallback(
		(changes: any) => {
			onNodesChange(changes);

			// Update positions in graph
			const positionChanges = changes.filter(
				(c: any) => c.type === "position" && c.position
			);
			if (positionChanges.length > 0) {
				const updatedInstances = graph.instances.map((instance) => {
					const change = positionChanges.find(
						(c: any) => c.id === instance.instanceId
					);
					if (change && change.position) {
						return { ...instance, position: change.position };
					}
					return instance;
				});

				onGraphChange({
					...graph,
					instances: updatedInstances,
				});
			}
		},
		[graph, onGraphChange, onNodesChange]
	);

	// Disable manual edge connections - edges are created automatically
	const onConnect = useCallback((_connection: Connection) => {
		// Manual connections disabled - all edges created automatically via Tab/Enter
		console.log(
			"Manual edge creation disabled. Use Tab/Enter to create connected nodes."
		);
	}, []);

	// Create a sibling node (Enter key)
	const handleCreateSibling = useCallback(() => {
		if (!graph.focusedInstanceId) return;

		const currentInstance = graph.instances.find(
			(inst) => inst.instanceId === graph.focusedInstanceId
		);
		if (!currentInstance) return;

		const newNode = createNode();
		const siblings = getSiblingInstances(
			currentInstance.instanceId,
			graph.instances
		);
		const position = calculateSiblingPosition(currentInstance, siblings);

		const newInstance = createNodeInstance(
			newNode.nodeId,
			position,
			currentInstance.parentInstanceId,
			currentInstance.depth,
			currentInstance.siblingOrder + 1 // Insert right after current instance
		);

		// Update positions of siblings that come after the current one
		const updatedInstances = updateSiblingPositions(
			currentInstance,
			graph.instances
		);

		// Add the new instance
		const finalInstances = [...updatedInstances, newInstance];

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
			instances: finalInstances,
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
		const position = calculateChildPosition(parentInstance, existingChildren);

		const newInstance = createNodeInstance(
			newNode.nodeId,
			position,
			parentInstance.instanceId,
			parentInstance.depth + 1,
			existingChildren.length
		);

		// Create edge from parent to child
		const newEdge = createEdge(
			parentInstance.instanceId,
			newInstance.instanceId
		);

		const updatedGraph: MindGraph = {
			...graph,
			nodes: { ...graph.nodes, [newNode.nodeId]: newNode },
			instances: [...graph.instances, newInstance],
			edges: [...graph.edges, newEdge],
			focusedInstanceId: newInstance.instanceId,
		};

		onGraphChange(updatedGraph);
		// Start editing immediately
		setTimeout(() => {
			setEditingInstanceId(newInstance.instanceId);
		}, 50);
	}, [graph, onGraphChange]);

	// Handle node click to focus
	const handleNodeClick = useCallback(
		(_event: React.MouseEvent, node: Node) => {
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
		// Get selected nodes from React Flow
		const selectedNodes = nodes.filter((node) => node.selected);
		if (selectedNodes.length === 0) return;

		const selectedInstanceIds = new Set(selectedNodes.map((n) => n.id));

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

		// Update graph
		const updatedGraph = {
			...graph,
			nodes: remainingNodes,
			instances: remainingInstances,
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
	}, [nodes, graph, onGraphChange, editingInstanceId]);

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

	return (
		<ReactFlow
			nodes={nodes}
			edges={edges}
			onNodesChange={handleNodesChange}
			onEdgesChange={onEdgesChange}
			onConnect={onConnect}
			onNodeClick={handleNodeClick}
			onInit={onInit}
			nodeTypes={nodeTypes}
			minZoom={0.1}
			maxZoom={2}
			fitViewOptions={{
				padding: 0.2,
				includeHiddenNodes: false,
				minZoom: 0.1,
				maxZoom: 1,
				duration: 400,
			}}
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
			nodesDraggable={true}
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
