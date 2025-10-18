import html2canvas from "html2canvas";

/**
 * Captures the React Flow tree (nodes and edges) as an image and copies it to the clipboard
 * This function waits a moment to ensure the DOM is clean before capturing
 * @param options - Optional configuration for the capture
 * @returns Promise that resolves when the image is copied to clipboard
 */
export async function copyTreeAsImage(options?: {
	backgroundColor?: string | null;
	scale?: number;
}): Promise<void> {
	// Wait for any UI elements (like context menus) to close
	await new Promise((resolve) => setTimeout(resolve, 100));

	try {
		console.log("📸 Starting tree capture...");

		// Find the React Flow wrapper - the outermost container
		const reactFlowWrapper = document.querySelector(
			".react-flow__renderer"
		) as HTMLElement;

		if (!reactFlowWrapper) {
			console.error("❌ React Flow renderer not found");
			throw new Error("React Flow renderer not found");
		}

		console.log("✅ Found React Flow renderer");

		// Get viewport
		const viewport = reactFlowWrapper.querySelector(
			".react-flow__viewport"
		) as HTMLElement;
		
		if (!viewport) {
			console.error("❌ React Flow viewport not found");
			throw new Error("React Flow viewport not found");
		}

		console.log("✅ Found viewport");

		// Get all nodes to calculate bounding box
		const nodeElements = viewport.querySelectorAll(".react-flow__node");
		
		console.log(`📊 Found ${nodeElements.length} nodes`);
		
		if (nodeElements.length === 0) {
			console.error("❌ No nodes found to capture");
			throw new Error("No nodes found to capture");
		}

		// Calculate bounding box of all nodes in screen coordinates
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		const wrapperRect = reactFlowWrapper.getBoundingClientRect();

		nodeElements.forEach((node) => {
			const rect = (node as HTMLElement).getBoundingClientRect();
			
			// Calculate position relative to wrapper
			const x = rect.left - wrapperRect.left;
			const y = rect.top - wrapperRect.top;
			
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x + rect.width);
			maxY = Math.max(maxY, y + rect.height);
		});

		// Add padding
		const padding = 40;
		minX = Math.max(0, minX - padding);
		minY = Math.max(0, minY - padding);
		maxX += padding;
		maxY += padding;

		const width = maxX - minX;
		const height = maxY - minY;

		console.log(`📐 Capture bounds: ${width}x${height} at (${minX}, ${minY})`);

		// Simplified capture options - capture the entire renderer
		const captureOptions = {
			backgroundColor: options?.backgroundColor ?? null,
			scale: options?.scale ?? 2,
			useCORS: true,
			allowTaint: true,
			logging: false,
			// Don't specify x, y, width, height - capture full element
			foreignObjectRendering: false, // Disable foreign object rendering
			ignoreElements: (element: Element) => {
				const className = element.className;
				if (typeof className !== "string") return false;

				// Ignore UI controls and background
				return (
					className.includes("react-flow__controls") ||
					className.includes("react-flow__minimap") ||
					className.includes("react-flow__attribution") ||
					className.includes("react-flow__panel") ||
					className.includes("react-flow__background") ||
					className.includes("context-menu")
				);
			},
		};

		console.log("🎨 Starting html2canvas on renderer...");
		
		// Capture the renderer element (which contains viewport)
		const fullCanvas = await html2canvas(reactFlowWrapper, captureOptions);

		console.log(`✅ Full canvas created: ${fullCanvas.width}x${fullCanvas.height}`);
		
		if (fullCanvas.width === 0 || fullCanvas.height === 0) {
			throw new Error("Canvas has zero dimensions");
		}

		// Crop the canvas to just the content area
		console.log("✂️ Cropping canvas to content...");
		const scale = options?.scale ?? 2;
		const croppedCanvas = document.createElement("canvas");
		croppedCanvas.width = width * scale;
		croppedCanvas.height = height * scale;
		
		const ctx = croppedCanvas.getContext("2d");
		if (!ctx) {
			throw new Error("Failed to get canvas context");
		}

		// Draw the cropped portion
		ctx.drawImage(
			fullCanvas,
			minX * scale,
			minY * scale,
			width * scale,
			height * scale,
			0,
			0,
			width * scale,
			height * scale
		);

		console.log(`✅ Cropped canvas: ${croppedCanvas.width}x${croppedCanvas.height}`);
		console.log("🔄 Converting canvas to blob...");
		
		// Convert canvas to blob
		const blob = await new Promise<Blob>((resolve, reject) => {
			croppedCanvas.toBlob(
				(blob) => {
					if (blob) {
						console.log(`✅ Blob created: ${blob.size} bytes`);
						resolve(blob);
					} else {
						reject(new Error("Failed to convert canvas to blob"));
					}
				},
				"image/png",
				1.0
			);
		});

		console.log("📋 Copying to clipboard...");
		
		// Check if clipboard API is available
		if (!navigator.clipboard || !navigator.clipboard.write) {
			throw new Error("Clipboard API not available. Make sure you're using HTTPS or localhost.");
		}

		// Copy to clipboard
		await navigator.clipboard.write([
			new ClipboardItem({
				"image/png": blob,
			}),
		]);

		console.log("✅ Image copied to clipboard successfully");
	} catch (error) {
		console.error("❌ Failed to copy image to clipboard:", error);
		if (error instanceof Error) {
			console.error("Error details:", {
				name: error.name,
				message: error.message,
				stack: error.stack,
			});
		}
		throw error;
	}
}

/**
 * Finds the tree root element for a given node instance ID
 * This function traverses up the DOM to find the React Flow viewport
 * @returns The viewport element containing the entire tree
 */
export function getTreeViewportElement(): HTMLElement | null {
	const viewport = document.querySelector(
		".react-flow__viewport"
	) as HTMLElement;
	return viewport;
}

/**
 * Finds the root node element in the tree
 * @returns The root node element
 */
export function getRootNodeElement(): HTMLElement | null {
	// Look for the node marked as root
	const rootNodes = document.querySelectorAll('[data-is-root="true"]');
	if (rootNodes.length > 0) {
		return rootNodes[0] as HTMLElement;
	}
	return null;
}
