import { useEffect, useRef } from "react";
import "./ContextMenu.css";

export interface ContextMenuItem {
	label: string;
	icon?: string;
	onClick: () => void;
	disabled?: boolean;
}

interface ContextMenuProps {
	items: ContextMenuItem[];
	position: { x: number; y: number };
	onClose: () => void;
}

/**
 * Context menu component that displays menu items at a specific position
 */
export default function ContextMenu({
	items,
	position,
	onClose,
}: ContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		// Adjust menu position if it goes off-screen
		if (menuRef.current) {
			const menu = menuRef.current;
			const rect = menu.getBoundingClientRect();
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;

			let { x, y } = position;

			// Adjust horizontal position
			if (rect.right > viewportWidth) {
				x = viewportWidth - rect.width - 10;
			}

			// Adjust vertical position
			if (rect.bottom > viewportHeight) {
				y = viewportHeight - rect.height - 10;
			}

			menu.style.left = `${x}px`;
			menu.style.top = `${y}px`;
		}
	}, [position]);

	const handleItemClick = (item: ContextMenuItem) => {
		if (!item.disabled) {
			item.onClick();
			onClose();
		}
	};

	return (
		<>
			<div className="context-menu-overlay" onClick={onClose} />
			<div
				ref={menuRef}
				className="context-menu"
				style={{
					left: position.x,
					top: position.y,
				}}
			>
				{items.map((item, index) => (
					<div
						key={index}
						className={`context-menu-item ${
							item.disabled ? "context-menu-item-disabled" : ""
						}`}
						onClick={() => handleItemClick(item)}
					>
						{item.icon && (
							<span className="context-menu-item-icon">{item.icon}</span>
						)}
						<span>{item.label}</span>
					</div>
				))}
			</div>
		</>
	);
}
