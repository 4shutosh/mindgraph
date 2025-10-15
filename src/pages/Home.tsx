import { useEffect, useCallback, useState } from "react";
import Canvas from "../components/Canvas";
import Header from "../components/Header";
import ShortcutsModal from "../components/ShortcutsModal";
import { MindGraph } from "../types";
import { loadGraph, saveGraph, createEmptyGraph } from "../utils/storage";
import { useHistory } from "../utils/useHistory";
import { createNode, createNodeInstance } from "../utils/nodeHelpers";
import {
	downloadGraphAsFile,
	importGraphFromFile,
	mergeGraphs,
} from "../utils/importExport";

function Home() {
	const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
	const [instanceToEdit, setInstanceToEdit] = useState<string | null>(null);

	// Initialize state with history management
	const {
		state: graph,
		setState: setGraph,
		undo,
		redo,
		canUndo,
		canRedo,
	} = useHistory<MindGraph>(loadGraph() || createEmptyGraph(), {
		maxHistorySize: 50,
	});

	// Auto-save to localStorage
	useEffect(() => {
		saveGraph(graph);
	}, [graph]);

	const handleGraphChange = useCallback(
		(newGraph: MindGraph) => {
			setGraph(newGraph, true); // true = save to history
		},
		[setGraph]
	);

	// Create a new node
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

		handleGraphChange(updatedGraph);
		// Trigger editing mode for the new node in Canvas
		setInstanceToEdit(instance.instanceId);
	}, [graph, handleGraphChange]);

	// Effect to clear the instanceToEdit trigger
	useEffect(() => {
		if (instanceToEdit) {
			// Clear after a short delay to ensure Canvas catches the prop change
			const timer = setTimeout(() => setInstanceToEdit(null), 50);
			return () => clearTimeout(timer);
		}
	}, [instanceToEdit]);

	// Handle export
	const handleExport = useCallback(() => {
		try {
			downloadGraphAsFile(graph);
			console.log("Graph exported successfully");
		} catch (error) {
			console.error("Failed to export graph:", error);
			alert("Failed to export graph. Check console for details.");
		}
	}, [graph]);

	// Handle import
	const handleImport = useCallback(async () => {
		try {
			const result = await importGraphFromFile();

			if (result.success && result.graph) {
				// Merge imported graph with current graph (non-destructive)
				const mergedGraph = mergeGraphs(graph, result.graph);

				handleGraphChange(mergedGraph);
				console.log("Graph imported and merged successfully");

				// Show success message with details
				const importedNodeCount = Object.keys(result.graph.nodes).length;
				const importedInstanceCount = result.graph.instances.length;
				alert(
					`✅ Graph imported successfully!\n\n` +
						`Added ${importedNodeCount} nodes and ${importedInstanceCount} instances.\n` +
						`The imported graph has been placed on the canvas as a separate tree.`
				);
			} else {
				console.error("Import failed:", result.error);
				alert(`❌ Failed to import graph:\n\n${result.error}`);
			}
		} catch (error) {
			console.error("Failed to import graph:", error);
			alert("❌ Failed to import graph. Check console for details.");
		}
	}, [graph, handleGraphChange]);

	// Keyboard shortcuts for undo/redo
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Cmd+Z (Mac) or Ctrl+Z (Windows/Linux) for undo
			if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
				e.preventDefault();
				if (canUndo) {
					undo();
				}
			}
			// Cmd+Shift+Z (Mac) or Ctrl+Shift+Z (Windows/Linux) for redo
			else if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
				e.preventDefault();
				if (canRedo) {
					redo();
				}
			}
			// Cmd+Y (Mac) or Ctrl+Y (Windows/Linux) as alternative for redo
			else if ((e.metaKey || e.ctrlKey) && e.key === "y") {
				e.preventDefault();
				if (canRedo) {
					redo();
				}
			}
			// Cmd + / to toggle shortcuts modal
			else if ((e.metaKey || e.ctrlKey) && e.key === "/") {
				e.preventDefault();
				setIsShortcutsModalOpen((prev) => !prev);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [undo, redo, canUndo, canRedo]);

	return (
		<div className="app">
			<Header
				onNewNode={handleCreateNode}
				onToggleShortcuts={() => setIsShortcutsModalOpen(true)}
				onExport={handleExport}
				onImport={handleImport}
			/>

			<Canvas
				graph={graph}
				onGraphChange={handleGraphChange}
				instanceToEditId={instanceToEdit}
			/>

			<ShortcutsModal
				isOpen={isShortcutsModalOpen}
				onClose={() => setIsShortcutsModalOpen(false)}
			/>
		</div>
	);
}

export default Home;
