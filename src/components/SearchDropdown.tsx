import { useEffect, useRef, useState } from "react";
import { TreeNode, NodeInstance } from "../types";
import { getNodePath } from "../utils/nodeHelpers";
import "./SearchDropdown.css";

interface SearchDropdownProps {
	query: string;
	suggestions: TreeNode[];
	position: { x: number; y: number };
	onSelect: (node: TreeNode) => void;
	onClose: () => void;
	nodes: Record<string, TreeNode>;
	instances: NodeInstance[];
}

/**
 * Dropdown component for showing hyperlink suggestions
 */
export default function SearchDropdown({
	query,
	suggestions,
	position,
	onSelect,
	onClose,
	nodes,
	instances,
}: SearchDropdownProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Reset selected index when suggestions change
	useEffect(() => {
		setSelectedIndex(0);
	}, [suggestions]);

	// Handle keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (suggestions.length === 0) return;

			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((prev) =>
					prev < suggestions.length - 1 ? prev + 1 : prev
				);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
			} else if (e.key === "Enter") {
				e.preventDefault();
				e.stopPropagation();
				if (suggestions[selectedIndex]) {
					onSelect(suggestions[selectedIndex]);
				}
			} else if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [suggestions, selectedIndex, onSelect, onClose]);

	// Auto-scroll selected item into view
	useEffect(() => {
		if (dropdownRef.current) {
			const selectedElement = dropdownRef.current.children[
				selectedIndex
			] as HTMLElement;
			if (selectedElement) {
				selectedElement.scrollIntoView({
					block: "nearest",
					behavior: "smooth",
				});
			}
		}
	}, [selectedIndex]);

	if (suggestions.length === 0) {
		return (
			<div
				className="search-dropdown"
				style={{ left: position.x, top: position.y }}
			>
				<div className="search-dropdown-item no-results">
					No matching nodes found
				</div>
			</div>
		);
	}

	// Highlight matching text
	const highlightMatch = (text: string, query: string) => {
		const normalizedText = text.toLowerCase();
		const normalizedQuery = query.toLowerCase();
		const index = normalizedText.indexOf(normalizedQuery);

		if (index === -1) {
			return <span>{text}</span>;
		}

		const before = text.slice(0, index);
		const match = text.slice(index, index + query.length);
		const after = text.slice(index + query.length);

		return (
			<span>
				{before}
				<strong className="highlight">{match}</strong>
				{after}
			</span>
		);
	};

	// Format path with immediate parent and child count
	const formatNodeContext = (
		node: TreeNode,
		path: string[]
	): { parent: string; childCount: number } => {
		// Get immediate parent (second to last in path, since last is the node itself)
		const parent = path.length > 1 ? path[path.length - 2] : "";

		// Count children by finding instances of this node and checking their children
		const nodeInstances = instances.filter(
			(inst) => inst.nodeId === node.nodeId
		);
		let childCount = 0;

		if (nodeInstances.length > 0) {
			// Use the first instance to count children
			const firstInstance = nodeInstances[0];
			childCount = instances.filter(
				(inst) => inst.parentInstanceId === firstInstance.instanceId
			).length;
		}

		return { parent, childCount };
	};

	return (
		<div
			ref={dropdownRef}
			className="search-dropdown"
			style={{ left: position.x, top: position.y }}
			onMouseDown={(e) => e.preventDefault()} // Prevent blur from contentEditable
		>
			{suggestions.map((node, index) => {
				const path = getNodePath(node.nodeId, nodes, instances);
				const { parent, childCount } = formatNodeContext(node, path);

				return (
					<div
						key={node.nodeId}
						className={`search-dropdown-item ${
							index === selectedIndex ? "selected" : ""
						}`}
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							onSelect(node);
						}}
						onMouseEnter={() => setSelectedIndex(index)}
					>
						<div className="dropdown-item-content">
							<div className="dropdown-item-title">
								{highlightMatch(node.title, query)}
							</div>
							<div className="dropdown-item-meta">
								{childCount > 0 ? `${childCount} children` : "No children"}
							</div>
						</div>
						{parent && <div className="dropdown-item-path">in {parent}</div>}
					</div>
				);
			})}
		</div>
	);
}
