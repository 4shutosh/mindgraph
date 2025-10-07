import { useState, useEffect } from "react";
import Canvas from "./components/Canvas";
import { MindGraph } from "./types";
import { loadGraph, saveGraph, createEmptyGraph } from "./utils/storage";
import "./App.css";

// Migrate old graph data to new format
function migrateGraph(graph: MindGraph): MindGraph {
	const migratedInstances = graph.instances.map((instance, index) => ({
		...instance,
		parentInstanceId: instance.parentInstanceId ?? null,
		depth: instance.depth ?? 0,
		siblingOrder: (instance as any).siblingOrder ?? index,
	}));

	return {
		...graph,
		instances: migratedInstances,
		focusedInstanceId: graph.focusedInstanceId ?? null,
	};
}

function App() {
	const [graph, setGraph] = useState<MindGraph>(() => {
		const loadedGraph = loadGraph();
		if (loadedGraph) {
			return migrateGraph(loadedGraph);
		}
		return createEmptyGraph();
	});

	// Auto-save to localStorage
	useEffect(() => {
		saveGraph(graph);
	}, [graph]);

	const handleGraphChange = (newGraph: MindGraph) => {
		setGraph(newGraph);
	};

	return (
		<div className="app">
			<header className="app-header">
				<h1>MindGraph</h1>
				<p className="subtitle">Build, study, and evolve your knowledge tree</p>
			</header>

			<Canvas graph={graph} onGraphChange={handleGraphChange} />
		</div>
	);
}

export default App;
