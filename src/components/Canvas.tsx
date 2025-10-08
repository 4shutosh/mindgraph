import { useCallback, useEffect, useState } from "react";
import ReactFlow, {
	Node,
	Edge,
	Background,
	Controls,
	MiniMap,
	useNodesState,
	useEdgesState,
	Connection,
	NodeTypes,
	BackgroundVariant,
	Panel,
	SelectionMode,
} from "reactflow";
import "reactflow/dist/style.css";

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
import { applyBalancedLayout } from "../utils/layoutHelpers";
import MindNode, { MindNodeData } from "./MindNode";

const nodeTypes: NodeTypes = {
	mindNode: MindNode,
};

interface CanvasProps {
	graph: MindGraph;
	onGraphChange: (graph: MindGraph) => void;
}

/**
 * Main canvas component using React Flow
 */
export default function Canvas({ graph, onGraphChange }: CanvasProps) {
	const [nodes, setNodes, onNodesChange] = useNodesState([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState([]);
	const [editingInstanceId, setEditingInstanceId] = useState<string | null>(
		null
	);

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

			onGraphChange({
				...graph,
				nodes: { ...graph.nodes, [nodeId]: updatedNode },
			});

			setEditingInstanceId(null);
		},
		[graph, onGraphChange, deleteNode, nodeHasChildren]
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

	// Create a new node (used for Cmd+N or button click)
	const handleCreateNode = useCallback(() => {
		const newNode = createNode();
		const instance = createNodeInstance(
			newNode.nodeId,
			{
				x: Math.random() * 400 + 100,
				y: Math.random() * 400 + 100,
			},
			null,
			0,
			0
		);

		const updatedGraph: MindGraph = {
			...graph,
			nodes: { ...graph.nodes, [newNode.nodeId]: newNode },
			instances: [...graph.instances, instance],
			rootNodeId: graph.rootNodeId || newNode.nodeId,
			focusedInstanceId: instance.instanceId,
		};

		onGraphChange(updatedGraph);
		// Start editing immediately
		setTimeout(() => setEditingInstanceId(instance.instanceId), 50);
	}, [graph, onGraphChange]);

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
		setTimeout(() => setEditingInstanceId(newInstance.instanceId), 50);
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
		setTimeout(() => setEditingInstanceId(newInstance.instanceId), 50);
	}, [graph, onGraphChange]);

	// Handle node click to focus
	const handleNodeClick = useCallback(
		(_event: React.MouseEvent, node: Node) => {
			onGraphChange({
				...graph,
				focusedInstanceId: node.id,
			});
		},
		[graph, onGraphChange]
	);

	// Apply auto-layout to balance the tree
	const handleAutoAlign = useCallback(() => {
		const balancedInstances = applyBalancedLayout(graph.instances);
		onGraphChange({
			...graph,
			instances: balancedInstances,
		});
	}, [graph, onGraphChange]);

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

	// Handle keyboard events through React Flow's onKeyDown
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			// Ignore if typing in input/textarea
			if (
				editingInstanceId ||
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
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
			// Create new node: Cmd/Ctrl + N
			else if ((e.metaKey || e.ctrlKey) && e.key === "n") {
				e.preventDefault();
				handleCreateNode();
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
			// Note: Space is now used for panning (Space + drag)
			// Edit via double-click only to prevent conflicts
		},
		[
			graph,
			handleNavigateLeft,
			handleNavigateRight,
			handleNavigateDown,
			handleNavigateUp,
			handleCreateNode,
			handleCreateSibling,
			handleCreateChild,
			handleDeleteNodes,
			editingInstanceId,
		]
	);

	return (
		<div className="canvas-container">
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={handleNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				onNodeClick={handleNodeClick}
				onKeyDown={handleKeyDown}
				nodeTypes={nodeTypes}
				fitView
				minZoom={0.1}
				maxZoom={2}
				defaultEdgeOptions={{
					type: "default",
					animated: false,
				}}
				connectOnClick={false}
				panOnDrag={false}
				selectionOnDrag={true}
				panActivationKeyCode="Space"
				multiSelectionKeyCode="Shift"
				selectionMode={SelectionMode.Partial}
				nodesDraggable={true}
				elementsSelectable={true}
			>
				<Background variant={BackgroundVariant.Dots} gap={16} size={1} />
				<Controls />
				<MiniMap />

				<Panel position="top-left" className="control-panel">
					<button className="btn btn-primary" onClick={handleCreateNode}>
						+ New Node (⌘N)
					</button>

					<button
						className="btn btn-secondary"
						onClick={handleAutoAlign}
						title="Auto-align and balance tree layout"
					>
						⚡ Auto-align
					</button>

					<div className="stats">
						<span>{Object.keys(graph.nodes).length} unique nodes</span>
						<span>{graph.instances.length} instances</span>
					</div>
					<div className="keyboard-hints">
						<div className="hint">
							<kbd>←</kbd> → Parent
						</div>
						<div className="hint">
							<kbd>→</kbd> → Child
						</div>
						<div className="hint">
							<kbd>↑</kbd> → Prev Sibling
						</div>
						<div className="hint">
							<kbd>↓</kbd> → Next Sibling
						</div>
						<div className="hint">
							<kbd>Enter</kbd> → Sibling
						</div>
						<div className="hint">
							<kbd>Tab</kbd> → Child
						</div>
						<div className="hint">
							<kbd>Del</kbd> → Delete
						</div>
						<div className="hint">
							<kbd>Space + Drag</kbd> → Pan
						</div>
						<div className="hint">
							<kbd>Click + Drag</kbd> → Select
						</div>
					</div>
				</Panel>
			</ReactFlow>
		</div>
	);
}
