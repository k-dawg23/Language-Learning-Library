import type { FolderNode } from "../types/library";
import type { FolderProgress } from "../lib/library-utils";

type FolderTreeProps = {
  node: FolderNode;
  selectedFolderPath: string;
  progressByPath: Map<string, FolderProgress>;
  onSelect: (folderPath: string) => void;
};

export function FolderTree({ node, selectedFolderPath, progressByPath, onSelect }: FolderTreeProps) {
  return (
    <ul className="folder-tree">
      <FolderBranch
        node={node}
        selectedFolderPath={selectedFolderPath}
        progressByPath={progressByPath}
        onSelect={onSelect}
      />
    </ul>
  );
}

type FolderBranchProps = FolderTreeProps;

function FolderBranch({ node, selectedFolderPath, progressByPath, onSelect }: FolderBranchProps) {
  const isSelected = node.fullPath === selectedFolderPath;
  const progress = progressByPath.get(node.fullPath);

  return (
    <li>
      <button
        className={isSelected ? "folder-btn selected" : "folder-btn"}
        type="button"
        onClick={() => onSelect(node.fullPath)}
      >
        <span>{node.name}</span>
        {progress && progress.total > 0 && (
          <small className="folder-progress">
            {progress.played}/{progress.total}
          </small>
        )}
      </button>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <FolderBranch
              key={child.id}
              node={child}
              selectedFolderPath={selectedFolderPath}
              progressByPath={progressByPath}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
