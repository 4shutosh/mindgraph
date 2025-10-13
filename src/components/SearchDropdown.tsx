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
	childCountsMap: Map<string, number>;
	instanceMap: Map<string, NodeInstance>;
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
	childCountsMap,
	instanceMap,
}: SearchDropdownProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const dropdownRef = useRef<HTMLDivElement>(null);
	
	// Use refs to avoid stale closures
	const onSelectRef = useRef(onSelect);
	const onCloseRef = useRef(onClose);

	// Update refs when props change
	useEffect(() => {
		onSelectRef.current = onSelect;
		onCloseRef.current = onClose;
	});

	// Don't auto-focus dropdown - keep contentEditable focused so user can continue typing
	// Instead, we'll capture keyboard events globally but only when dropdown is visible

	// Reset selected index when suggestions change
	useEffect(() => {
		setSelectedIndex(0);
	}, [suggestions]);

	// Handle keyboard navigation globally while dropdown is mounted
	// We need global listener because contentEditable keeps focus for typing
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (suggestions.length === 0) return;

			// Only handle if we're not typing regular text
			// Let normal typing through, only intercept navigation keys
			if (e.key === "ArrowDown") {
				e.preventDefault();
				e.stopPropagation();
				setSelectedIndex((prev) =>
					prev < suggestions.length - 1 ? prev + 1 : prev
				);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				e.stopPropagation();
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
			} else if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault();
				e.stopPropagation();
				if (suggestions[selectedIndex]) {
					onSelectRef.current(suggestions[selectedIndex]);
				}
			} else if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onCloseRef.current();
			}
		};

		// Add listener to document instead of window for better scoping
		document.addEventListener("keydown", handleKeyDown, true);
		return () => document.removeEventListener("keydown", handleKeyDown, true);
	}, [suggestions, selectedIndex]);

	// Handle direct keyboard events on the dropdown element (for accessibility)
	const handleDirectKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		// This is a fallback for when dropdown somehow gets focus
		if (suggestions.length === 0) return;

		if (e.key === "ArrowDown") {
			e.preventDefault();
			e.stopPropagation();
			setSelectedIndex((prev) =>
				prev < suggestions.length - 1 ? prev + 1 : prev
			);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			e.stopPropagation();
			setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
		} else if (e.key === "Enter" || e.key === "Tab") {
			e.preventDefault();
			e.stopPropagation();
			if (suggestions[selectedIndex]) {
				onSelectRef.current(suggestions[selectedIndex]);
			}
		} else if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			onCloseRef.current();
		}
	};

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

	// Format path with immediate parent and child count - optimized with pre-computed maps
	const formatNodeContext = (
		node: TreeNode,
		path: string[]
	): { parent: string; childCount: number } => {
		// Get immediate parent (second to last in path, since last is the node itself)
		const parent = path.length > 1 ? path[path.length - 2] : "";

		// Get child count using pre-computed map - O(1) instead of O(n)
		let childCount = 0;
		
		// Find the first instance of this node
		const nodeInstance = Array.from(instanceMap.values()).find(
			(inst) => inst.nodeId === node.nodeId
		);
		
		if (nodeInstance) {
			childCount = childCountsMap.get(nodeInstance.instanceId) || 0;
		}

		return { parent, childCount };
	};

	return (
		<div
			ref={dropdownRef}
			className="search-dropdown"
			style={{ left: position.x, top: position.y }}
			onMouseDown={(e) => e.preventDefault()} // Prevent blur from contentEditable
			onKeyDown={handleDirectKeyDown}
			tabIndex={-1} // Make focusable but not in tab order
		>
			{suggestions.map((node, index) => {
				const path = getNodePath(node.nodeId, nodes, instances, instanceMap);
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
