import { useState } from "react";
import { EdgeProps, getBezierPath, BaseEdge } from "@xyflow/react";

interface CollapsibleEdgeProps extends EdgeProps {
	data?: {
		isCollapsed: boolean;
		collapsedCount?: number;
		onToggleCollapse: (edgeId: string) => void;
	};
}

/**
 * Custom edge component with collapse/expand functionality
 * Shows a button on hover to toggle subtree visibility
 */
export default function CollapsibleEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	style = {},
	markerEnd,
	data,
}: CollapsibleEdgeProps) {
	const [isHovered, setIsHovered] = useState(false);

	const [edgePath, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
	});

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (data?.onToggleCollapse) {
			data.onToggleCollapse(id);
		}
	};

	const isCollapsed = data?.isCollapsed || false;
	const collapsedCount = data?.collapsedCount || 0;

	return (
		<g>
			<BaseEdge
				path={edgePath}
				markerEnd={markerEnd}
				style={style}
				interactionWidth={20}
			/>
			
			{/* Invisible wider path for better hover detection */}
			<path
				d={edgePath}
				fill="none"
				stroke="transparent"
				strokeWidth={20}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
				style={{ cursor: "pointer" }}
			/>

			{/* Collapse/Expand button - shown on hover or when collapsed */}
			{(isHovered || isCollapsed) && (
				<g transform={`translate(${labelX}, ${labelY})`}>
					{/* Button background */}
					<circle
						r={12}
						fill={isCollapsed ? "#8b5cf6" : "#ffffff"}
						stroke={isCollapsed ? "#7c3aed" : "#d1d5db"}
						strokeWidth={2}
						onClick={handleClick}
						style={{ cursor: "pointer" }}
					/>
					{/* Icon/Text */}
					<text
						x={0}
						y={0}
						textAnchor="middle"
						dominantBaseline="central"
						fill={isCollapsed ? "#ffffff" : "#4b5563"}
						fontSize={isCollapsed ? "10px" : "14px"}
						fontWeight="600"
						onClick={handleClick}
						style={{ cursor: "pointer", pointerEvents: "none", userSelect: "none" }}
					>
						{isCollapsed ? collapsedCount : "−"}
					</text>
				</g>
			)}
		</g>
	);
}
