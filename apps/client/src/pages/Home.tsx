import { useEffect, useCallback, useState } from "react";
import Canvas from "../components/Canvas";
import Header from "../components/Header";
import ShortcutsModal from "../components/ShortcutsModal";
import CanvasManager from "../components/CanvasManager";
import { MindGraph, AppState, CanvasData } from "../types";
import {
	loadAppState,
	saveAppState,
	createDefaultAppState,
	createEmptyCanvas,
} from "../utils/storage";
import { useHistory } from "../utils/useHistory";
import { createNode, createNodeInstance } from "../utils/nodeHelpers";
import {
	downloadGraphAsFile,
	importGraphFromFile,
	mergeGraphs,
} from "../utils/importExport";
import { downloadTreeAsImage } from "../utils/imageExport";

function Home() {
	const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
	const [instanceToEdit, setInstanceToEdit] = useState<string | null>(null);

	// Initialize app state with history management
	const {
		state: appState,
		setState: setAppState,
		undo,
		redo,
		canUndo,
		canRedo,
	} = useHistory<AppState>(loadAppState() || createDefaultAppState(), {
		maxHistorySize: 50,
	});

	// Get the active canvas
	const activeCanvas = appState.canvases.find(
		(c) => c.id === appState.activeCanvasId
	);
	const graph = activeCanvas?.graph || {
		nodes: {},
		instances: [],
		edges: [],
		rootNodeId: null,
		focusedInstanceId: null,
	};

	// Auto-save to localStorage
	useEffect(() => {
		saveAppState(appState);
	}, [appState]);

	const handleGraphChange = useCallback(
		(newGraph: MindGraph) => {
			if (!activeCanvas) return;

			const updatedCanvas: CanvasData = {
				...activeCanvas,
				graph: newGraph,
				updatedAt: Date.now(),
			};

			const updatedCanvases = appState.canvases.map((c) =>
				c.id === activeCanvas.id ? updatedCanvas : c
			);

			setAppState(
				{
					...appState,
					canvases: updatedCanvases,
				},
				true
			); // true = save to history
		},
		[appState, activeCanvas, setAppState]
	);

	// Create a new node
	const handleCreateNode = useCallback(() => {
		const newNode = createNode();

		// Find all existing root nodes (depth 0) and calculate position for new root
		const existingRoots = graph.instances.filter((inst) => inst.depth === 0);
		let newX = 100; // Default starting X position
		let newY = 100; // Default starting Y position

		if (existingRoots.length > 0) {
			// Find the rightmost root node
			const rightmostRoot = existingRoots.reduce(
				(max, inst) => (inst.position.x > max.position.x ? inst : max),
				existingRoots[0]
			);

			// Place new root 600px to the right of the rightmost root
			// This gives enough space for the tree to expand without overlap
			newX = rightmostRoot.position.x + 600;
			newY = rightmostRoot.position.y; // Keep same Y position for alignment
		}

		const instance = createNodeInstance(
			newNode.nodeId,
			{
				x: newX,
				y: newY,
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

	// Handle download as image
	const handleCopyAsImage = useCallback(async () => {
		try {
			// Get canvas name, default to "MindGraph" if no active canvas
			const canvasName = activeCanvas?.name || "MindGraph";
			// Sanitize filename: remove invalid characters
			const filename = canvasName
				.replace(/[^a-z0-9\s-]/gi, "")
				.trim()
				.replace(/\s+/g, "-");

			await downloadTreeAsImage(filename, { backgroundColor: "#FFFFFF" });
			console.log(`Image downloaded as ${filename}.png`);
			alert(`✅ Image downloaded as ${filename}.png!`);
		} catch (error) {
			console.error("Failed to download image:", error);
			alert("❌ Failed to download image. Check console for details.");
		}
	}, [activeCanvas]);

	// Canvas management functions
	const handleCanvasSelect = useCallback(
		(canvasId: string) => {
			setAppState(
				{
					...appState,
					activeCanvasId: canvasId,
				},
				false
			); // false = don't save to history (just navigation)
		},
		[appState, setAppState]
	);

	const handleCanvasCreate = useCallback(() => {
		const newCanvas = createEmptyCanvas(
			`Canvas ${appState.canvases.length + 1}`
		);
		setAppState(
			{
				canvases: [...appState.canvases, newCanvas],
				activeCanvasId: newCanvas.id,
			},
			true
		); // true = save to history
	}, [appState, setAppState]);

	const handleCanvasRename = useCallback(
		(canvasId: string, newName: string) => {
			const updatedCanvases = appState.canvases.map((c) =>
				c.id === canvasId ? { ...c, name: newName, updatedAt: Date.now() } : c
			);
			setAppState(
				{
					...appState,
					canvases: updatedCanvases,
				},
				true
			); // true = save to history
		},
		[appState, setAppState]
	);

	const handleCanvasDelete = useCallback(
		(canvasId: string) => {
			const updatedCanvases = appState.canvases.filter(
				(c) => c.id !== canvasId
			);

			// If we're deleting the active canvas, switch to another one
			let newActiveCanvasId = appState.activeCanvasId;
			if (canvasId === appState.activeCanvasId && updatedCanvases.length > 0) {
				newActiveCanvasId = updatedCanvases[0].id;
			}

			setAppState(
				{
					canvases: updatedCanvases,
					activeCanvasId: newActiveCanvasId,
				},
				true
			); // true = save to history
		},
		[appState, setAppState]
	);

	const handleCanvasReorder = useCallback(
		(fromIndex: number, toIndex: number) => {
			const updatedCanvases = [...appState.canvases];
			const [removed] = updatedCanvases.splice(fromIndex, 1);
			updatedCanvases.splice(toIndex, 0, removed);

			setAppState(
				{
					...appState,
					canvases: updatedCanvases,
				},
				true
			); // true = save to history
		},
		[appState, setAppState]
	);

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
				onCopyAsImage={handleCopyAsImage}
			/>

			<CanvasManager
				canvases={appState.canvases}
				activeCanvasId={appState.activeCanvasId}
				onCanvasSelect={handleCanvasSelect}
				onCanvasCreate={handleCanvasCreate}
				onCanvasRename={handleCanvasRename}
				onCanvasDelete={handleCanvasDelete}
				onCanvasReorder={handleCanvasReorder}
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
