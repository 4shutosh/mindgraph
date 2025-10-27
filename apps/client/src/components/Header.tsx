import React from "react";
import { useNavigate } from "react-router-dom";

interface HeaderProps {
	onNewNode: () => void;
	onToggleShortcuts: () => void;
	onExport: () => void;
	onImport: () => void;
	onCopyAsImage?: () => void;
}

const Header: React.FC<HeaderProps> = ({
	onNewNode,
	onToggleShortcuts,
	onExport,
	onImport,
	onCopyAsImage,
}) => {
	const navigate = useNavigate();

	const handleTitleClick = () => {
		navigate("/landing");
	};

	return (
		<header className="app-header">
			<div
				className="flex flex-col header-left header-clickable"
				onClick={handleTitleClick}
			>
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
					{onCopyAsImage && (
						<button
							className="btn btn-secondary"
							onClick={onCopyAsImage}
							title="Download tree as PNG image"
						>
							Download as Image
						</button>
					)}
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
