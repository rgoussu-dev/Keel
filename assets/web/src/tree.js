/**
 * Turning the flat change list into the tree a reader expects.
 *
 * `InstallReport.changes` is a sorted list of paths with a kind
 * (`create` / `modify` / `delete`), which is right for a terminal and
 * unreadable at 300 entries in a browser. This folds it into
 * directories, keeps every level sorted with folders first, and
 * leaves rendering to the caller.
 *
 * Pure, and separate from any element, so the folding is testable
 * without a DOM.
 */

/**
 * @typedef {{ name: string, path: string, kind?: string, children: TreeNode[] }} TreeNode
 */

/**
 * Folds `changes` into a nested tree.
 *
 * @param {{ path: string, kind: string }[]} changes
 * @returns {TreeNode[]} roots, folders before files, each level sorted
 */
export function foldTree(changes) {
  const root = { name: '', path: '', children: [] };
  for (const change of changes) {
    const segments = change.path.split('/').filter((segment) => segment !== '');
    let node = root;
    segments.forEach((segment, index) => {
      const leaf = index === segments.length - 1;
      const path = node.path === '' ? segment : `${node.path}/${segment}`;
      let child = node.children.find((candidate) => candidate.name === segment);
      if (!child) {
        child = { name: segment, path, children: [] };
        node.children.push(child);
      }
      if (leaf) child.kind = change.kind;
      node = child;
    });
  }
  return sort(root.children);
}

/** Folders first, then files, each group by name. */
function sort(nodes) {
  for (const node of nodes) sort(node.children);
  nodes.sort((a, b) => {
    const aDir = a.children.length > 0;
    const bDir = b.children.length > 0;
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

/**
 * Counts the changes by kind, for the plan's one-line summary.
 *
 * @param {{ kind: string }[]} changes
 * @returns {{ create: number, modify: number, delete: number }}
 */
export function countKinds(changes) {
  const counts = { create: 0, modify: 0, delete: 0 };
  for (const change of changes) {
    if (change.kind in counts) counts[change.kind] += 1;
  }
  return counts;
}
