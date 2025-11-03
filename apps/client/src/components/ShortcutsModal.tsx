import React, { useEffect } from "react";
import "./ShortcutsModal.css";

interface ShortcutsModalProps {
	isOpen: boolean;
	onClose: () => void;
}

const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
	// Handle Escape key to close modal
	useEffect(() => {
		if (!isOpen) return;

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};

		window.addEventListener("keydown", handleEscape);
		return () => window.removeEventListener("keydown", handleEscape);
	}, [isOpen, onClose]);

	if (!isOpen) {
		return null;
	}

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div
				className="modal-content shortcuts-modal"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="modal-header">
					<h2>Keyboard Shortcuts & Features</h2>
					<button
						onClick={onClose}
						className="modal-close-btn"
						aria-label="Close"
					>
						×
					</button>
				</div>

				<div className="shortcuts-content">
					<div className="shortcuts-grid">
						{/* Node Creation */}
						<section className="shortcut-section">
							<h3>Node Creation</h3>
							<div className="keyboard-hints">
								<div className="hint">
									<kbd>⌘</kbd> + <kbd>N</kbd>
									<span className="hint-description">New root node</span>
								</div>
								<div className="hint">
									<kbd>Enter</kbd>
									<span className="hint-description">Create sibling</span>
								</div>
								<div className="hint">
									<kbd>Tab</kbd>
									<span className="hint-description">Create child</span>
								</div>
								<div className="hint">
									<span className="hint-description">
										Click <strong>+</strong> button on focused node
									</span>
								</div>
							</div>
						</section>

						{/* Navigation */}
						<section className="shortcut-section">
							<h3>Navigation</h3>
							<div className="keyboard-hints">
								<div className="hint">
									<kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd>
									<span className="hint-description">
										Parent / Child / Siblings
									</span>
								</div>
								<div className="hint">
									<span className="hint-description">
										<strong>Click</strong> node to focus
									</span>
								</div>
							</div>
						</section>

						{/* Editing */}
						<section className="shortcut-section">
							<h3>Editing</h3>
							<div className="keyboard-hints">
								<div className="hint">
									<span className="hint-description">
										<strong>Double-click</strong> or <strong>click</strong>{" "}
										focused node
									</span>
								</div>
								<div className="hint">
									<kbd>Enter</kbd>
									<span className="hint-description">Finish edit</span>
								</div>
								<div className="hint">
									<kbd>Esc</kbd>
									<span className="hint-description">
										Cancel / delete empty
									</span>
								</div>
							</div>
						</section>

						{/* Hyperlinks */}
						<section className="shortcut-section">
							<h3>Hyperlinks</h3>
							<div className="keyboard-hints">
								<div className="hint">
									<kbd>/</kbd>
									<span className="hint-description">
										Type "/" at the start of the node text to create
									</span>
								</div>
								<div className="hint">
									<span className="hint-description">
										Click <strong>link icon</strong> to navigate
									</span>
								</div>
								<div className="hint">
									<span className="hint-description">
										<strong>Safe Deletion</strong> copies are created of linked
										nodes
									</span>
								</div>
							</div>
						</section>

						{/* Node Management */}
						<section className="shortcut-section">
							<h3>Node Management</h3>
							<div className="keyboard-hints">
								<div className="hint">
									<kbd>Delete</kbd> / <kbd>Backspace</kbd>
									<span className="hint-description">
										Delete selected & subtree
									</span>
								</div>
								<div className="hint">
									<span className="hint-description">
										<strong>Drag vertically</strong> → reorder siblings
									</span>
								</div>
								<div className="hint">
									<span className="hint-description">
										<strong>Drag horizontally</strong> → reparent (prevents
										cycles)
									</span>
								</div>
								<div className="hint">
									<span className="hint-description">
										<strong>Collapse button</strong> → expand/collapse subtree
									</span>
								</div>
							</div>
						</section>

						{/* Canvas Navigation */}
						<section className="shortcut-section">
							<h3>Canvas</h3>
							<div className="keyboard-hints">
								<div className="hint">
									<kbd>Space</kbd> + <kbd>Drag</kbd>
									<span className="hint-description">Pan</span>
								</div>
								<div className="hint">
									<span className="hint-description">
										<strong>Scroll</strong> → zoom
									</span>
								</div>
								<div className="hint">
									<span className="hint-description">
										<strong>Click + Drag</strong> → multi-select
									</span>
								</div>
								<div className="hint">
									<kbd>Shift</kbd> + <kbd>Click</kbd>
									<span className="hint-description">Add to selection</span>
								</div>
							</div>
						</section>

						{/* History & Actions */}
						<section className="shortcut-section">
							<h3>History</h3>
							<div className="keyboard-hints">
								<div className="hint">
									<kbd>⌘</kbd> + <kbd>Z</kbd>
									<span className="hint-description">Undo</span>
								</div>
								<div className="hint">
									<kbd>⌘</kbd> + <kbd>⇧</kbd> + <kbd>Z</kbd> / <kbd>Y</kbd>
									<span className="hint-description">Redo</span>
								</div>
								<div className="hint">
									<kbd>⌘</kbd> + <kbd>/</kbd>
									<span className="hint-description">Toggle shortcuts</span>
								</div>
							</div>
						</section>
					</div>

					{/* Tips & Features */}
					<section className="shortcut-section tips-section">
						<div className="tips-content">
							Auto-saves • Multiple canvases • Export/Import JSON • Download as
							PNG
						</div>
					</section>
				</div>

				<div className="modal-footer">
					<button onClick={onClose} className="btn btn-primary">
						Got it
					</button>
				</div>
			</div>
		</div>
	);
};

export default ShortcutsModal;
