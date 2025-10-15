import React from "react";

interface HeaderProps {
	onNewNode: () => void;
	onToggleShortcuts: () => void;
	onExport: () => void;
	onImport: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
	onNewNode, 
	onToggleShortcuts,
	onExport,
	onImport 
}) => {
	return (
		<header className="app-header">
			<div className="flex flex-col header-left">
				<h1>ThinkItOut</h1>
				<p className="subtitle">
					Build, study, and evolve your knowledge graph
				</p>
			</div>
			<div className="header-right">
				<div className="button-group">
					<button className="btn btn-primary" onClick={onNewNode}>
						+ New Root Node
					</button>
				</div>
				<div className="button-group">
					<button 
						className="btn btn-secondary" 
						onClick={onImport}
						title="Import graph from JSON file"
					>
						Import
					</button>
					<button 
						className="btn btn-secondary" 
						onClick={onExport}
						title="Export graph to JSON file"
					>
						Export
					</button>
				</div>
				{/* <div className="button-group history-buttons">
					<button
						className="btn btn-history"
						onClick={onUndo}
						disabled={!canUndo}
						title="Undo (⌘Z)"
					>
						↶ Undo
					</button>
					<button
						className="btn btn-history"
						onClick={onRedo}
						disabled={!canRedo}
						title="Redo (⌘⇧Z)"
					>
						↷ Redo
					</button>
				</div> */}
				<div className="button-group">
					<button
						className="btn btn-secondary"
						onClick={onToggleShortcuts}
						title="Show shortcuts (⌘/)"
					>
						?
					</button>
				</div>
			</div>
		</header>
	);
};

export default Header;
