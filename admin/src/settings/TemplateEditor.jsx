import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../lib/api';
import { Save, ArrowLeft, Loader2, Code } from 'lucide-react';
import FileTree from './FileTree';
import CodeEditor from '../components/CodeEditor';
import { toast } from 'sonner';

export default function TemplateEditor() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const init = async () => {
      const fetchedFiles = await loadFiles();
      
      const params = new URLSearchParams(location.search);
      const fileParam = params.get('file');
      if (fileParam && fetchedFiles && fetchedFiles.length > 0) {
        // Find the file in the tree that matches the filename
        const findFile = (items) => {
          if (!items || !Array.isArray(items)) return null;
          
          for (const item of items) {
            if (!item) continue;
            if (item.name === fileParam) return item.path || item.name;
            if (item.children && Array.isArray(item.children)) {
              const res = findFile(item.children);
              if (res) return res;
            }
          }
          return null;
        };
        
        const fullPath = findFile(fetchedFiles);
        if (fullPath) {
          handleSelectFile(fullPath);
        } else {
          // If not found in tree, try raw
          handleSelectFile(fileParam);
        }
      }
    };

    init();
  }, [location.search]);

  const loadFiles = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/templates/files');
      
      // Validate response structure
      if (!response || !Array.isArray(response)) {
        console.warn('Invalid template files response:', response);
        setFiles([]);
        return [];
      }
      
      setFiles(response);
      return response;
    } catch (err) {
      console.error('Failed to load template files:', err);
      setError(err.message || 'Failed to load template files');
      setFiles([]);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFile = async (filePath) => {
    if (!filePath) return;
    
    try {
      setLoadingFile(true);
      setError(null);
      
      const response = await api.get(`/templates/files/${encodeURIComponent(filePath)}`);
      setContent(response.content || '');
      setOriginalContent(response.content || '');
      setSelectedFile({
        name: response.filename,
        path: response.filename,
        id: response.id
      });
    } catch (err) {
      setError(err.message || 'Failed to load file');
      setContent('');
      setSelectedFile(null);
    } finally {
      setLoadingFile(false);
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    
    try {
      setSaving(true);
      setError(null);
      
      await api.post(`/templates/files/${encodeURIComponent(selectedFile.path)}`, {
        content: content
      });
      
      setOriginalContent(content);
      toast.success('Template saved successfully!');
    } catch (err) {
      setError(err.message || 'Failed to save file');
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const hasUnsavedChanges = content !== originalContent;

  const handleBack = () => {
    if (hasUnsavedChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to leave?')) {
        navigate('/templates');
      }
    } else {
      navigate('/templates');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="btn btn-ghost px-3"
              title="Back to Templates"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Template Editor</h1>
              {selectedFile && (
                <p className="text-sm text-gray-500">{selectedFile.name}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasUnsavedChanges && (
              <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                Unsaved changes
              </span>
            )}
            
            <button
              onClick={handleSave}
              disabled={!selectedFile || saving || !hasUnsavedChanges}
              className="btn btn-primary flex items-center gap-2"
              id="template-editor-save-button"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* File Tree */}
        <div className="w-64 border-r border-gray-200 bg-gray-50 overflow-y-auto">
          <FileTree
            files={files}
            selectedFile={selectedFile?.path}
            onSelectFile={handleSelectFile}
          />
        </div>

        {/* Code Editor */}
        <div className="flex-1 flex flex-col">
          {loadingFile ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : selectedFile ? (
            <div className="flex-1">
              <CodeEditor
                value={content}
                onChange={setContent}
                mode="nunjucks"
                height="100%"
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Code className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Select a template file to edit</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
