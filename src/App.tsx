import { useState, useEffect } from "react";
import Canvas from "./components/Canvas";
import { MindGraph } from "./types";
import { loadGraph, saveGraph, createEmptyGraph } from "./utils/storage";
import "./App.css";

function App() {
	const [graph, setGraph] = useState<MindGraph>(() => {
		const loadedGraph = loadGraph();
		return loadedGraph || createEmptyGraph();
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
				<p className="subtitle">
					Build, study, and evolve your knowledge graph
				</p>
			</header>

			<Canvas graph={graph} onGraphChange={handleGraphChange} />
		</div>
	);
}

export default App;
