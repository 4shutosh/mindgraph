import React from "react";
import "./ShortcutsModal.css";

interface ShortcutsModalProps {
	isOpen: boolean;
	onClose: () => void;
}

const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
	if (!isOpen) {
		return null;
	}

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-content" onClick={(e) => e.stopPropagation()}>
				<h2>Keyboard Shortcuts</h2>
				<div className="keyboard-hints">
					<div className="hint">
						<kbd>⌘Z</kbd> → Undo
					</div>
					<div className="hint">
						<kbd>⌘⇧Z</kbd> → Redo
					</div>
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
				<button onClick={onClose} className="btn btn-primary">
					Close
				</button>
			</div>
		</div>
	);
};

export default ShortcutsModal;
