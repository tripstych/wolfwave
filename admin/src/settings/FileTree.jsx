import React, { useState } from 'react';
import { ChevronRight, ChevronDown, FileCode, Folder, FolderOpen } from 'lucide-react';

const buildTree = (files) => {
  const root = {};

  files.forEach(file => {
    const parts = file.path.split('/');
    let current = root;
    
    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] = {
          name: part,
          path: parts.slice(0, index + 1).join('/'),
          type: index === parts.length - 1 ? 'file' : 'folder',
          children: {}
        };
      }
      current = current[part].children;
    });
  });

  return root;
};

const TreeNode = ({ node, level = 0, onSelect, selectedPath }) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = Object.keys(node.children).length > 0;
  const isSelected = node.path === selectedPath;

  const handleClick = () => {
    if (node.type === 'folder') {
      setIsOpen(!isOpen);
    } else {
      onSelect(node.path);
    }
  };

  return (
    <div>
      <div 
        className={`flex items-center py-1 px-2 cursor-pointer hover:bg-gray-100 ${isSelected ? 'bg-primary-50 text-primary-700' : 'text-gray-700'}`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        <span className="mr-1 text-gray-400">
          {node.type === 'folder' ? (
            isOpen ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />
          ) : (
            <FileCode className="w-4 h-4" />
          )}
        </span>
        <span className="text-sm truncate">{node.name}</span>
      </div>
      {isOpen && hasChildren && (
        <div>
          {Object.values(node.children)
            .sort((a, b) => {
              // Folders first, then files
              if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
              return a.name.localeCompare(b.name);
            })
            .map(child => (
              <TreeNode 
                key={child.path} 
                node={child} 
                level={level + 1} 
                onSelect={onSelect}
                selectedPath={selectedPath}
              />
            ))}
        </div>
      )}
    </div>
  );
};

export default function FileTree({ files, onSelect, selectedPath }) {
  const tree = buildTree(files);

  return (
    <div className="overflow-y-auto h-full py-2">
      {Object.values(tree)
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .map(node => (
          <TreeNode 
            key={node.path} 
            node={node} 
            onSelect={onSelect}
            selectedPath={selectedPath}
          />
        ))}
    </div>
  );
}
