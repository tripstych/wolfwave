import React, { useState } from 'react';
import { ChevronRight, ChevronDown, FileCode, Folder, FolderOpen } from 'lucide-react';

const buildTree = (files) => {
  // If files is already a tree structure, return it as-is
  if (!files || !Array.isArray(files)) return {};
  
  // Check if this is already a tree structure (has children)
  if (files.length > 0 && files[0].children) {
    return files.reduce((acc, item) => {
      acc[item.name] = item;
      return acc;
    }, {});
  }

  // Otherwise, build tree from flat file list
  const root = {};

  files.forEach(file => {
    if (!file || !file.path) return; // Skip invalid entries
    
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
  
  // Handle both API structure and internal structure
  const hasChildren = node.children && (
    (typeof node.children === 'object' && Object.keys(node.children).length > 0) ||
    (Array.isArray(node.children) && node.children.length > 0)
  );
  
  const isSelected = node.path === selectedPath || node.name === selectedPath;

  const handleClick = () => {
    if (node.type === 'directory' || node.type === 'folder') {
      setIsOpen(!isOpen);
    } else {
      // Use path if available, otherwise use name
      onSelect(node.path || node.name);
    }
  };

  // Convert children object to array if needed
  const childrenArray = node.children ? (
    Array.isArray(node.children) ? node.children : Object.values(node.children)
  ) : [];

  return (
    <div>
      <div 
        className={`flex items-center py-1 px-2 cursor-pointer hover:bg-gray-100 ${isSelected ? 'bg-primary-50 text-primary-700' : 'text-gray-700'}`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        <span className="mr-1 text-gray-400">
          {node.type === 'directory' || node.type === 'folder' ? (
            isOpen ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />
          ) : (
            <FileCode className="w-4 h-4" />
          )}
        </span>
        <span className="text-sm truncate">{node.label || node.name}</span>
      </div>
      {isOpen && hasChildren && (
        <div>
          {childrenArray
            .sort((a, b) => {
              // Directories/folders first, then files
              if (a.type !== b.type) {
                const aIsDir = a.type === 'directory' || a.type === 'folder';
                const bIsDir = b.type === 'directory' || b.type === 'folder';
                return aIsDir ? -1 : bIsDir ? 1 : 0;
              }
              return (a.label || a.name).localeCompare(b.label || b.name);
            })
            .map(child => (
              <TreeNode 
                key={child.path || child.name} 
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
