export interface FileTreeNode {
  name: string;
  path?: string;
  children: FileTreeNode[];
}

export function buildFileTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const path of [...paths].sort()) {
    const segments = path.split("/");
    let currentLevel = root;

    segments.forEach((segment, index) => {
      const isFile = index === segments.length - 1;
      let existing = currentLevel.find((node) => node.name === segment);

      if (!existing) {
        existing = {
          name: segment,
          path: isFile ? path : undefined,
          children: [],
        };
        currentLevel.push(existing);
      }

      if (!isFile) {
        currentLevel = existing.children;
      }
    });
  }

  return root;
}

function sortNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return [...nodes]
    .sort((a, b) => {
      const aIsFile = Boolean(a.path);
      const bIsFile = Boolean(b.path);
      if (aIsFile !== bIsFile) {
        return aIsFile ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    })
    .map((node) => ({
      ...node,
      children: sortNodes(node.children),
    }));
}

export function normalizeFileTree(nodes: FileTreeNode[]): FileTreeNode[] {
  return sortNodes(nodes);
}
