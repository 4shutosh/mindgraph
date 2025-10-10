# MindGraph - WIP

I was building a knowledge based decision tree, where a set of decisions kept re appearing - in which copying the entire subtree for each was not viable. I could not find any tool which does linking of nodes in a clean fashion.

Here is my attempt to solve that usecase. This will be a keyboard first mindgraph - a mindmap where you can hyperlink nodes - so a graph :)

![mindgraph](demo.png)

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

## Usage

### Keyboard Shortcuts (Whimsical-style!)

- **⌘/Ctrl + N**: Create a new root node
- **Enter**: Create a sibling node (same depth as current) + auto-edit
- **Tab**: Create a child node (one level deeper) + auto-edit
- **Delete/Backspace**: Delete selected nodes and their entire subtrees
- **Double-click node**: Edit node inline
- **Click node**: Focus node for keyboard navigation
- **Drag node**: Rearrange vertical position of sibling nodes
- **Space + Drag**: Pan the canvas
- **Click + Drag**: Multi-select nodes (box selection)
- **Shift + Click**: Add to selection

## Tech Stack

- **React** + **TypeScript**
- **React Flow** for canvas rendering
- **Vite** for build tooling
- **localStorage** for persistence

---
