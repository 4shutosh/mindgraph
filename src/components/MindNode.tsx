import { memo, useRef, useEffect } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { TreeNode } from "../types";

export interface MindNodeData extends Record<string, unknown> {
	node: TreeNode;
	isEditing: boolean;
	isRoot: boolean;
	onStartEdit: (nodeId: string) => void;
	onFinishEdit: (nodeId: string, newTitle: string) => void;
	onCancelEdit: (nodeId: string) => void;
}

/**
 * Custom node component for the mindgraph with inline editing using contentEditable
 */
function MindNode({ data, selected }: NodeProps) {
	const { node, isEditing, isRoot, onStartEdit, onFinishEdit, onCancelEdit } =
		data as MindNodeData;
	const contentRef = useRef<HTMLDivElement>(null);
	const originalValueRef = useRef<string>(node.title);

	// Focus and select text when editing starts
	useEffect(() => {
		if (isEditing && contentRef.current) {
			contentRef.current.focus();

			// Select all text
			const range = document.createRange();
			range.selectNodeContents(contentRef.current);
			const selection = window.getSelection();
			if (selection) {
				selection.removeAllRanges();
				selection.addRange(range);
			}

			// Store original value
			originalValueRef.current = node.title;
		}
	}, [isEditing, node.title]);

	const handleFinishEdit = () => {
		if (!contentRef.current) return;
		const trimmedValue = contentRef.current.textContent?.trim() || "";
		onFinishEdit(node.nodeId, trimmedValue);
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
				// Restore original value
				if (contentRef.current) {
					contentRef.current.textContent = originalValueRef.current;
				}
				onFinishEdit(node.nodeId, originalValueRef.current);
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
	};

	return (
		<div
			className={`mind-node ${isRoot ? "root-node" : "child-node"} ${
				selected ? "selected" : ""
			} ${isEditing ? "editing" : ""}`}
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
				onDoubleClick={() => !isEditing && onStartEdit(node.nodeId)}
				onBlur={isEditing ? handleFinishEdit : undefined}
				onKeyDown={isEditing ? handleKeyDown : undefined}
				onInput={isEditing ? handleInput : undefined}
				spellCheck={false}
			>
				{node.title}
			</div>

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
