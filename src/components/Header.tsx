import React from "react";

interface HeaderProps {
	onNewNode: () => void;
	onAutoAlign: () => void;
	onToggleShortcuts: () => void;
}

const Header: React.FC<HeaderProps> = ({
	onNewNode,
	onAutoAlign,
	onToggleShortcuts,
}) => {
	return (
		<header className="app-header">
			<div className="flex flex-col header-left">
				<h1>MindGraph</h1>
				<p className="subtitle">
					Build, study, and evolve your knowledge graph
				</p>
			</div>
			<div className="header-right">
				<div className="button-group">
					<button className="btn btn-primary" onClick={onNewNode}>
						+ New Root Node
					</button>
					<button
						className="btn btn-secondary"
						onClick={onAutoAlign}
						title="Auto-align and balance tree layout"
					>
						⚡ Auto-align
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
