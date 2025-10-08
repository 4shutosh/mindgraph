import { memo, useState, useRef, useEffect } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { TreeNode } from "../types";

export interface MindNodeData {
	node: TreeNode;
	isEditing: boolean;
	isRoot: boolean;
	onStartEdit: (nodeId: string) => void;
	onFinishEdit: (nodeId: string, newTitle: string) => void;
	onCancelEdit: (nodeId: string) => void;
}

/**
 * Custom node component for the mindgraph with inline editing
 */
function MindNode({ data, selected }: NodeProps<MindNodeData>) {
	const { node, isEditing, isRoot, onStartEdit, onFinishEdit, onCancelEdit } =
		data;
	const [editValue, setEditValue] = useState(node.title);
	const inputRef = useRef<HTMLInputElement>(null);

	// Focus input when editing starts
	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	// Update edit value when node title changes or when editing starts
	useEffect(() => {
		setEditValue(node.title);
	}, [node.title]);

	// Reset edit value when editing starts (for new nodes)
	useEffect(() => {
		if (isEditing) {
			setEditValue(node.title);
		}
	}, [isEditing, node.title]);

	const handleFinishEdit = () => {
		const trimmedValue = editValue.trim();
		onFinishEdit(node.nodeId, trimmedValue);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			e.stopPropagation(); // Prevent event from bubbling to Canvas
			handleFinishEdit();
		} else if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation(); // Prevent event from bubbling to Canvas
			// If input is empty (including just created nodes), delete the node
			if (editValue.trim() === "") {
				onCancelEdit(node.nodeId);
			} else {
				setEditValue(node.title);
				onFinishEdit(node.nodeId, node.title);
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

			{isEditing ? (
				<input
					ref={inputRef}
					type="text"
					className="node-title-input"
					value={editValue}
					onChange={(e) => setEditValue(e.target.value)}
					onBlur={handleFinishEdit}
					onKeyDown={handleKeyDown}
				/>
			) : (
				<div
					className="node-title"
					onDoubleClick={() => onStartEdit(node.nodeId)}
				>
					{node.title}
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
