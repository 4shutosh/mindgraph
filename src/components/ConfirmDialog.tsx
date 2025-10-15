import "./ConfirmDialog.css";

interface ConfirmDialogProps {
	isOpen: boolean;
	title: string;
	message: string;
	onConfirm: () => void;
	onCancel: () => void;
	confirmText?: string;
	cancelText?: string;
}

/**
 * Reusable confirmation dialog component
 */
export default function ConfirmDialog({
	isOpen,
	title,
	message,
	onConfirm,
	onCancel,
	confirmText = "OK",
	cancelText = "Cancel",
}: ConfirmDialogProps) {
	if (!isOpen) return null;

	return (
		<div className="confirm-dialog-overlay">
			<div className="confirm-dialog">
				<h2 className="confirm-dialog-title">{title}</h2>
				<p className="confirm-dialog-message">{message}</p>
				<div className="confirm-dialog-buttons">
					<button
						className="confirm-dialog-button confirm-dialog-button-cancel"
						onClick={onCancel}
					>
						{cancelText}
					</button>
					<button
						className="confirm-dialog-button confirm-dialog-button-confirm"
						onClick={onConfirm}
					>
						{confirmText}
					</button>
				</div>
			</div>
		</div>
	);
}
