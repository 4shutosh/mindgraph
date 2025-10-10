import { memo, useRef, useEffect, useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { TreeNode } from "../types";

export interface MindNodeData extends Record<string, unknown> {
	node: TreeNode;
	isEditing: boolean;
	isRoot: boolean;
	onFinishEdit: (nodeId: string, newTitle: string, widthDelta: number) => void;
	onCancelEdit: (nodeId: string) => void;
	onWidthChange?: (nodeId: string, widthDelta: number) => void;
	isDragging?: boolean;
	isDragOver?: boolean;
	isValidDropTarget?: boolean;
	isDropTargetHovered?: boolean;
	isCollapsed?: boolean;
	collapsedCount?: number;
	hasChildren?: boolean;
	onToggleCollapse?: (instanceId: string) => void;
}

/**
 * Custom node component for the mindgraph with inline editing using contentEditable
 */
function MindNode({ data, selected, id }: NodeProps) {
	const {
		node,
		isEditing,
		isRoot,
		onFinishEdit,
		onCancelEdit,
		onWidthChange,
		isDragging,
		isDragOver,
		isValidDropTarget,
		isDropTargetHovered,
		isCollapsed,
		collapsedCount,
		hasChildren,
		onToggleCollapse,
	} = data as MindNodeData;
	const contentRef = useRef<HTMLDivElement>(null);
	const originalValueRef = useRef<string>(node.title);
	const initialWidthRef = useRef<number>(0);
	const nodeRef = useRef<HTMLDivElement>(null);
	const currentWidthRef = useRef<number>(0);
	const [isHovered, setIsHovered] = useState(false);

	const handleToggleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		e.preventDefault();
		if (onToggleCollapse) {
			onToggleCollapse(id);
		}
	};

	// Focus and select text when editing starts
	useEffect(() => {
		if (isEditing && contentRef.current && nodeRef.current) {
			contentRef.current.focus();

			// Select all text
			const range = document.createRange();
			range.selectNodeContents(contentRef.current);
			const selection = window.getSelection();
			if (selection) {
				selection.removeAllRanges();
				selection.addRange(range);
			}

			// Store original value and initial width
			originalValueRef.current = node.title;
			initialWidthRef.current = nodeRef.current.offsetWidth;
			currentWidthRef.current = nodeRef.current.offsetWidth;
		}
	}, [isEditing, node.title]);

	const handleFinishEdit = () => {
		if (!contentRef.current || !nodeRef.current) return;
		const trimmedValue = contentRef.current.textContent?.trim() || "";

		// Calculate width delta after a small delay to ensure DOM has updated
		setTimeout(() => {
			if (nodeRef.current) {
				const finalWidth = nodeRef.current.offsetWidth;
				const widthDelta = finalWidth - initialWidthRef.current;
				onFinishEdit(node.nodeId, trimmedValue, widthDelta);
			}
		}, 0);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			e.stopPropagation(); // Prevent event from bubbling to Canvas
			handleFinishEdit();
		} else if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation(); // Prevent event from bubbling to Canvas

			const currentValue = contentRef.current?.textContent?.trim() || "";

			// If input is empty (including just created nodes), delete the node
			if (currentValue === "") {
				onCancelEdit(node.nodeId);
			} else {
				// Restore original value - no width change since we're reverting
				if (contentRef.current) {
					contentRef.current.textContent = originalValueRef.current;
				}
				onFinishEdit(node.nodeId, originalValueRef.current, 0);
			}
		} else if (e.key === "Tab") {
			// Allow Tab to work normally (will be handled by Canvas)
			// Don't prevent default or stop propagation
			return;
		}
	};

	const handleInput = () => {
		// Prevent any newlines from being inserted
		if (contentRef.current) {
			const text = contentRef.current.textContent || "";
			if (text.includes("\n")) {
				contentRef.current.textContent = text.replace(/\n/g, "");
				// Move cursor to end
				const range = document.createRange();
				const selection = window.getSelection();
				range.selectNodeContents(contentRef.current);
				range.collapse(false);
				if (selection) {
					selection.removeAllRanges();
					selection.addRange(range);
				}
			}
		}

		// Track width changes in real-time
		if (nodeRef.current && onWidthChange) {
			const newWidth = nodeRef.current.offsetWidth;
			const widthDelta = newWidth - currentWidthRef.current;

			if (widthDelta !== 0) {
				currentWidthRef.current = newWidth;
				onWidthChange(node.nodeId, widthDelta);
			}
		}
	};

	return (
		<div
			ref={nodeRef}
			className={`mind-node ${isRoot ? "root-node" : "child-node"} ${
				selected ? "selected" : ""
			} ${isEditing ? "editing" : ""} ${isDragging ? "dragging" : ""} ${
				isDragOver ? "drag-over" : ""
			} ${isValidDropTarget ? "drop-target" : ""} ${
				isDropTargetHovered ? "drop-target-hovered" : ""
			} ${isCollapsed ? "collapsed" : ""}`}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* Handle positioning: center for root, sides for children */}
			<Handle
				type="target"
				position={Position.Left}
				style={
					isRoot
						? {
								left: "50%",
								top: "50%",
								transform: "translate(-50%, -50%)",
								opacity: 0,
								pointerEvents: "none",
						  }
						: {
								left: "-4px",
								top: "50%",
								transform: "translateY(-50%)",
								opacity: 0,
								pointerEvents: "none",
						  }
				}
			/>

			<div
				ref={contentRef}
				className="node-title"
				contentEditable={isEditing}
				suppressContentEditableWarning
				onBlur={isEditing ? handleFinishEdit : undefined}
				onKeyDown={isEditing ? handleKeyDown : undefined}
				onInput={isEditing ? handleInput : undefined}
				spellCheck={false}
			>
				{node.title}
			</div>
			
			{/* Collapse/Expand button - shown on hover or when collapsed */}
			{hasChildren && (isHovered || isCollapsed) && (
				<div 
					className="collapse-button"
					onClick={handleToggleClick}
					onMouseDown={(e) => e.stopPropagation()}
				>
					<div className={`collapse-button-circle ${isCollapsed ? 'collapsed' : ''}`}>
						{isCollapsed && collapsedCount}
					</div>
				</div>
			)}
			
			<Handle
				type="source"
				position={Position.Right}
				style={
					isRoot
						? {
								left: "50%",
								top: "50%",
								transform: "translate(-50%, -50%)",
								opacity: 0,
								pointerEvents: "none",
						  }
						: {
								right: "-4px",
								top: "50%",
								transform: "translateY(-50%)",
								opacity: 0,
								pointerEvents: "none",
						  }
				}
			/>
		</div>
	);
}

export default memo(MindNode);
