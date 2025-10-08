import { useState, useCallback, useRef } from "react";

/**
 * Configuration for history management
 */
interface HistoryConfig {
	/** Maximum number of states to keep in history */
	maxHistorySize?: number;
}

/**
 * History state with past, present, and future
 */
interface HistoryState<T> {
	past: T[];
	present: T;
	future: T[];
}

/**
 * Return type for useHistory hook
 */
interface UseHistoryReturn<T> {
	/** Current state */
	state: T;
	/** Update state and add to history */
	setState: (newState: T, shouldSaveToHistory?: boolean) => void;
	/** Undo to previous state */
	undo: () => void;
	/** Redo to next state */
	redo: () => void;
	/** Check if undo is available */
	canUndo: boolean;
	/** Check if redo is available */
	canRedo: boolean;
	/** Clear all history */
	clearHistory: () => void;
}

/**
 * Custom hook for managing state with undo/redo functionality
 *
 * This hook implements a history stack pattern where:
 * - past: array of previous states
 * - present: current state
 * - future: array of states available for redo
 *
 * When a new state is set, it's added to past and future is cleared.
 * Undo moves present to future and pops from past.
 * Redo moves present to past and pops from future.
 */
export function useHistory<T>(
	initialState: T,
	config: HistoryConfig = {}
): UseHistoryReturn<T> {
	const { maxHistorySize = 50 } = config;

	// Track if the last action was undo/redo to prevent saving it
	const isUndoRedoAction = useRef(false);

	// Initialize history state
	const [history, setHistory] = useState<HistoryState<T>>({
		past: [],
		present: initialState,
		future: [],
	});

	/**
	 * Update state with optional history saving
	 * @param newState - The new state to set
	 * @param shouldSaveToHistory - Whether to save this change to history (default: true)
	 */
	const setState = useCallback(
		(newState: T, shouldSaveToHistory = true) => {
			setHistory((currentHistory) => {
				// If we shouldn't save to history, just update present
				if (!shouldSaveToHistory) {
					return {
						...currentHistory,
						present: newState,
					};
				}

				// Skip if state hasn't actually changed
				if (
					JSON.stringify(currentHistory.present) === JSON.stringify(newState)
				) {
					return currentHistory;
				}

				// Add current state to past
				const newPast = [...currentHistory.past, currentHistory.present];

				// Limit history size
				const trimmedPast =
					newPast.length > maxHistorySize
						? newPast.slice(newPast.length - maxHistorySize)
						: newPast;

				// Clear future when a new action is performed
				return {
					past: trimmedPast,
					present: newState,
					future: [],
				};
			});

			isUndoRedoAction.current = false;
		},
		[maxHistorySize]
	);

	/**
	 * Undo to previous state
	 */
	const undo = useCallback(() => {
		setHistory((currentHistory) => {
			if (currentHistory.past.length === 0) {
				return currentHistory;
			}

			const previous = currentHistory.past[currentHistory.past.length - 1];
			const newPast = currentHistory.past.slice(0, -1);

			isUndoRedoAction.current = true;

			return {
				past: newPast,
				present: previous,
				future: [currentHistory.present, ...currentHistory.future],
			};
		});
	}, []);

	/**
	 * Redo to next state
	 */
	const redo = useCallback(() => {
		setHistory((currentHistory) => {
			if (currentHistory.future.length === 0) {
				return currentHistory;
			}

			const next = currentHistory.future[0];
			const newFuture = currentHistory.future.slice(1);

			isUndoRedoAction.current = true;

			return {
				past: [...currentHistory.past, currentHistory.present],
				present: next,
				future: newFuture,
			};
		});
	}, []);

	/**
	 * Clear all history (useful for reset)
	 */
	const clearHistory = useCallback(() => {
		setHistory((currentHistory) => ({
			past: [],
			present: currentHistory.present,
			future: [],
		}));
		isUndoRedoAction.current = false;
	}, []);

	return {
		state: history.present,
		setState,
		undo,
		redo,
		canUndo: history.past.length > 0,
		canRedo: history.future.length > 0,
		clearHistory,
	};
}
