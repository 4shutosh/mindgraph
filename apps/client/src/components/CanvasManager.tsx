import { useState, useRef } from "react";
import { CanvasData } from "../types";
import ConfirmDialog from "./ConfirmDialog";
import { downloadGraphAsFile } from "../utils/importExport";
import "./CanvasManager.css";

interface CanvasManagerProps {
	canvases: CanvasData[];
	activeCanvasId: string | null;
	onCanvasSelect: (canvasId: string) => void;
	onCanvasCreate: () => void;
	onCanvasRename: (canvasId: string, newName: string) => void;
	onCanvasDelete: (canvasId: string) => void;
	onCanvasReorder: (fromIndex: number, toIndex: number) => void;
}

export default function CanvasManager({
	canvases,
	activeCanvasId,
	onCanvasSelect,
	onCanvasCreate,
	onCanvasRename,
	onCanvasDelete,
	onCanvasReorder,
}: CanvasManagerProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [editingCanvasId, setEditingCanvasId] = useState<string | null>(null);
	const [editingName, setEditingName] = useState("");
	const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
	const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [canvasToDelete, setCanvasToDelete] = useState<CanvasData | null>(null);
	const [showLastCanvasWarning, setShowLastCanvasWarning] = useState(false);
	const editInputRef = useRef<HTMLInputElement>(null);

	const handleRenameStart = (canvas: CanvasData) => {
		setEditingCanvasId(canvas.id);
		setEditingName(canvas.name);
		setTimeout(() => editInputRef.current?.focus(), 0);
	};

	const handleRenameSubmit = () => {
		if (editingCanvasId && editingName.trim()) {
			onCanvasRename(editingCanvasId, editingName.trim());
		}
		setEditingCanvasId(null);
		setEditingName("");
	};

	const handleRenameCancel = () => {
		setEditingCanvasId(null);
		setEditingName("");
	};

	const handleDeleteClick = (canvas: CanvasData) => {
		if (canvases.length === 1) {
			setShowLastCanvasWarning(true);
			return;
		}
		
		// If canvas is empty, delete immediately without confirmation
		if (canvas.graph.instances.length === 0) {
			onCanvasDelete(canvas.id);
			return;
		}
		
		// Otherwise, show confirmation dialog
		setCanvasToDelete(canvas);
		setDeleteDialogOpen(true);
	};

	const handleDeleteConfirm = () => {
		if (canvasToDelete) {
			onCanvasDelete(canvasToDelete.id);
		}
		setDeleteDialogOpen(false);
		setCanvasToDelete(null);
	};

	const handleDeleteCancel = () => {
		setDeleteDialogOpen(false);
		setCanvasToDelete(null);
	};

	const handleExportBeforeDelete = () => {
		if (canvasToDelete) {
			try {
				downloadGraphAsFile(canvasToDelete.graph);
				// After export, proceed with deletion
				onCanvasDelete(canvasToDelete.id);
			} catch (error) {
				console.error("Failed to export canvas:", error);
				alert("Failed to export canvas. The canvas was not deleted.");
			}
		}
		setDeleteDialogOpen(false);
		setCanvasToDelete(null);
	};

	const handleDragStart = (index: number) => {
		setDraggedIndex(index);
	};

	const handleDragOver = (e: React.DragEvent, index: number) => {
		e.preventDefault();
		setDragOverIndex(index);
	};

	const handleDragEnd = () => {
		if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
			onCanvasReorder(draggedIndex, dragOverIndex);
		}
		setDraggedIndex(null);
		setDragOverIndex(null);
	};

	const handleDragLeave = () => {
		setDragOverIndex(null);
	};

	return (
		<>
			{/* Toggle Button */}
			<button
				className="canvas-manager-toggle"
				onClick={() => setIsOpen(!isOpen)}
				title="Canvas Manager"
				aria-label="Toggle Canvas Manager"
			>
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<rect x="3" y="3" width="7" height="7" />
					<rect x="14" y="3" width="7" height="7" />
					<rect x="14" y="14" width="7" height="7" />
					<rect x="3" y="14" width="7" height="7" />
				</svg>
			</button>

			{/* Sidebar */}
			<div className={`canvas-manager ${isOpen ? "open" : ""}`}>
				<div className="canvas-manager-header">
					<h2>Canvases</h2>
					<button
						className="canvas-manager-close"
						onClick={() => setIsOpen(false)}
						aria-label="Close Canvas Manager"
					>
						×
					</button>
				</div>

				<button className="canvas-create-btn" onClick={onCanvasCreate}>
					<span className="plus-icon">+</span> New Canvas
				</button>

				<div className="canvas-list">
					{canvases.map((canvas, index) => (
						<div
							key={canvas.id}
							className={`canvas-item ${
								canvas.id === activeCanvasId ? "active" : ""
							} ${draggedIndex === index ? "dragging" : ""} ${
								dragOverIndex === index ? "drag-over" : ""
							}`}
							draggable={editingCanvasId !== canvas.id}
							onDragStart={() => handleDragStart(index)}
							onDragOver={(e) => handleDragOver(e, index)}
							onDragEnd={handleDragEnd}
							onDragLeave={handleDragLeave}
						>
							<div className="canvas-item-content">
								<span className="drag-handle" title="Drag to reorder">
									⋮⋮
								</span>

								<div
									className="canvas-name-wrapper"
									onClick={() => {
										if (editingCanvasId !== canvas.id) {
											onCanvasSelect(canvas.id);
										}
									}}
								>
									{editingCanvasId === canvas.id ? (
										<input
											ref={editInputRef}
											type="text"
											className="canvas-name-input"
											value={editingName}
											onChange={(e) => setEditingName(e.target.value)}
											onBlur={handleRenameSubmit}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													handleRenameSubmit();
												} else if (e.key === "Escape") {
													handleRenameCancel();
												}
											}}
											onClick={(e) => e.stopPropagation()}
										/>
									) : (
										<span className="canvas-name">{canvas.name}</span>
									)}
								</div>

								{editingCanvasId !== canvas.id && (
									<div className="canvas-item-actions">
										<button
											className="canvas-action-btn"
											onClick={(e) => {
												e.stopPropagation();
												handleRenameStart(canvas);
											}}
											title="Rename"
											aria-label="Rename canvas"
										>
											✏️
										</button>
										<button
											className="canvas-action-btn delete"
											onClick={(e) => {
												e.stopPropagation();
												handleDeleteClick(canvas);
											}}
											title="Delete"
											aria-label="Delete canvas"
										>
											🗑️
										</button>
									</div>
								)}
							</div>
						</div>
					))}
				</div>

				<div className="canvas-manager-footer">
					<span className="canvas-count">
						{canvases.length} {canvases.length === 1 ? "canvas" : "canvases"}
					</span>
				</div>
			</div>

			{/* Overlay */}
			{isOpen && <div className="canvas-manager-overlay" onClick={() => setIsOpen(false)} />}

			{/* Last Canvas Warning Dialog */}
			<ConfirmDialog
				isOpen={showLastCanvasWarning}
				title="Cannot Delete Canvas"
				message="You cannot delete the last canvas. You need at least one canvas in your workspace."
				onConfirm={() => setShowLastCanvasWarning(false)}
				onCancel={() => setShowLastCanvasWarning(false)}
				confirmText="Got it"
				cancelText=""
			/>

			{/* Delete Confirmation Dialog */}
			{canvasToDelete && (
				<ConfirmDialog
					isOpen={deleteDialogOpen}
					title="Delete Canvas"
					message={
						canvasToDelete.graph.instances.length > 0
							? `"${canvasToDelete.name}" contains ${canvasToDelete.graph.instances.length} node(s). All your graphs in this canvas will be permanently deleted. Would you like to export this canvas before deleting?`
							: `Are you sure you want to delete "${canvasToDelete.name}"?`
					}
					onConfirm={handleDeleteConfirm}
					onCancel={handleDeleteCancel}
					confirmText={canvasToDelete.graph.instances.length > 0 ? "Delete Without Export" : "Delete"}
					cancelText="Cancel"
					thirdAction={
						canvasToDelete.graph.instances.length > 0
							? {
									text: "Export & Delete",
									onClick: handleExportBeforeDelete,
									className: "confirm-dialog-button-third",
							  }
							: undefined
					}
				/>
			)}
		</>
	);
}
