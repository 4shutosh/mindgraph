/**
 * Trie Node for fast prefix search
 */
class TrieNode {
	children: Map<string, TrieNode>;
	nodeIds: Set<string>; // Store all nodeIds that match this prefix
	isEndOfWord: boolean;

	constructor() {
		this.children = new Map();
		this.nodeIds = new Set();
		this.isEndOfWord = false;
	}
}

/**
 * Trie data structure for fast node title search
 * Optimized for autocomplete and prefix matching
 */
export class NodeSearchTrie {
	private root: TrieNode;

	constructor() {
		this.root = new TrieNode();
	}

	/**
	 * Normalize text for search (lowercase, trim)
	 */
	private normalize(text: string): string {
		return text.toLowerCase().trim();
	}

	/**
	 * Insert a node into the trie
	 */
	insert(nodeId: string, title: string): void {
		if (!title || title.trim() === "") return;

		const normalizedTitle = this.normalize(title);
		let current = this.root;

		// Insert the full title
		for (const char of normalizedTitle) {
			if (!current.children.has(char)) {
				current.children.set(char, new TrieNode());
			}
			current = current.children.get(char)!;
			current.nodeIds.add(nodeId);
		}

		current.isEndOfWord = true;

		// Also insert each word separately for word-based search
		const words = normalizedTitle.split(/\s+/);
		for (const word of words) {
			if (word.length === 0) continue;

			let wordCurrent = this.root;
			for (const char of word) {
				if (!wordCurrent.children.has(char)) {
					wordCurrent.children.set(char, new TrieNode());
				}
				wordCurrent = wordCurrent.children.get(char)!;
				wordCurrent.nodeIds.add(nodeId);
			}
			wordCurrent.isEndOfWord = true;
		}
	}

	/**
	 * Remove a node from the trie
	 */
	remove(nodeId: string, title: string): void {
		if (!title || title.trim() === "") return;

		const normalizedTitle = this.normalize(title);
		this.removeFromPath(nodeId, normalizedTitle);

		// Also remove from word-based paths
		const words = normalizedTitle.split(/\s+/);
		for (const word of words) {
			if (word.length > 0) {
				this.removeFromPath(nodeId, word);
			}
		}
	}

	/**
	 * Helper to remove nodeId from a specific path
	 */
	private removeFromPath(nodeId: string, path: string): void {
		let current = this.root;

		for (const char of path) {
			if (!current.children.has(char)) return;
			current = current.children.get(char)!;
			current.nodeIds.delete(nodeId);
		}
	}

	/**
	 * Search for nodes matching a prefix query
	 * Returns a set of nodeIds that match
	 */
	search(query: string, limit: number = 10): Set<string> {
		if (!query || query.trim() === "") {
			return new Set();
		}

		const normalizedQuery = this.normalize(query);
		let current = this.root;

		// Navigate to the end of the query prefix
		for (const char of normalizedQuery) {
			if (!current.children.has(char)) {
				return new Set(); // No matches
			}
			current = current.children.get(char)!;
		}

		// Return all nodeIds at this prefix
		const results = new Set<string>();
		let count = 0;

		// Use BFS to collect results (prioritize shorter/closer matches)
		const queue: TrieNode[] = [current];
		while (queue.length > 0 && count < limit) {
			const node = queue.shift()!;

			// Add all nodeIds at this node
			for (const nodeId of node.nodeIds) {
				if (count >= limit) break;
				results.add(nodeId);
				count++;
			}

			// Add children to queue
			for (const child of node.children.values()) {
				queue.push(child);
			}
		}

		return results;
	}

	/**
	 * Clear all data from the trie
	 */
	clear(): void {
		this.root = new TrieNode();
	}

	/**
	 * Rebuild the entire trie from a nodes map
	 */
	rebuild(nodes: Record<string, { nodeId: string; title: string }>): void {
		this.clear();
		Object.values(nodes).forEach((node) => {
			this.insert(node.nodeId, node.title);
		});
	}
}
