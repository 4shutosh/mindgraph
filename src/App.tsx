import { useEffect, useCallback } from "react";
import Canvas from "./components/Canvas";
import { MindGraph } from "./types";
import { loadGraph, saveGraph, createEmptyGraph } from "./utils/storage";
import { useHistory } from "./utils/useHistory";
import "./App.css";

function App() {
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
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [undo, redo, canUndo, canRedo]);

	return (
		<div className="app">
			<header className="app-header">
				<h1>MindGraph</h1>
				<p className="subtitle">
					Build, study, and evolve your knowledge graph
				</p>
			</header>

			<Canvas
				graph={graph}
				onGraphChange={handleGraphChange}
				canUndo={canUndo}
				canRedo={canRedo}
				onUndo={undo}
				onRedo={redo}
			/>
		</div>
	);
}

export default App;
