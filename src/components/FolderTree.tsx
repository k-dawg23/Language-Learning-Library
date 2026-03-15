import type { FolderNode } from "../types/library";

type FolderTreeProps = {
  node: FolderNode;
  selectedFolderPath: string;
  onSelect: (folderPath: string) => void;
};

export function FolderTree({ node, selectedFolderPath, onSelect }: FolderTreeProps) {
  return (
    <ul className="folder-tree">
      <FolderBranch node={node} selectedFolderPath={selectedFolderPath} onSelect={onSelect} />
    </ul>
  );
}

type FolderBranchProps = FolderTreeProps;

function FolderBranch({ node, selectedFolderPath, onSelect }: FolderBranchProps) {
  const isSelected = node.fullPath === selectedFolderPath;

  return (
    <li>
      <button
        className={isSelected ? "folder-btn selected" : "folder-btn"}
        type="button"
        onClick={() => onSelect(node.fullPath)}
      >
        {node.name}
      </button>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <FolderBranch
              key={child.id}
              node={child}
              selectedFolderPath={selectedFolderPath}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
