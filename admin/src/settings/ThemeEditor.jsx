import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Save, ArrowLeft, Loader2, Code } from 'lucide-react';
import FileTree from './FileTree';
import { toast } from 'sonner';

export default function ThemeEditor() {
  const { themeName } = useParams();
  const navigate = useNavigate();
  
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const textareaRef = useRef(null);

  useEffect(() => {
    loadFiles();
  }, [themeName]);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const data = await api.get(`/themes/${themeName}/files`);
      setFiles(data || []);
    } catch (err) {
      setError('Failed to load theme files');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFile = async (path) => {
    if (selectedFile && content !== originalContent) {
      if (!confirm('You have unsaved changes. Discard them?')) return;
    }

    try {
      setLoadingFile(true);
      setSelectedFile(path);
      const data = await api.get(`/themes/${themeName}/files/${path}`);
      setContent(data.content || '');
      setOriginalContent(data.content || '');
    } catch (err) {
      toast.error('Failed to load file content');
      console.error(err);
    } finally {
      setLoadingFile(false);
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;

    try {
      setSaving(true);
      await api.post(`/themes/${themeName}/files/${selectedFile}`, { content });
      setOriginalContent(content);
      toast.success('File saved successfully');
    } catch (err) {
      toast.error('Failed to save file');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Handle Tab indentation in textarea
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;

      setContent(
        content.substring(0, start) + '  ' + content.substring(end)
      );

      // Restore focus
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2;
      }, 0);
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
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/themes')} className="btn btn-ghost">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Code className="w-5 h-5 text-gray-500" />
              {themeName}
            </h1>
            {selectedFile && (
              <p className="text-xs text-gray-500 font-mono">{selectedFile}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !selectedFile || content === originalContent}
            className="btn btn-primary"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col">
          <div className="p-3 border-b border-gray-200 bg-gray-50">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Files</h3>
          </div>
          <FileTree files={files} onSelect={handleSelectFile} selectedPath={selectedFile} />
        </div>

        {/* Editor */}
        <div className="flex-1 bg-white relative flex flex-col">
          {selectedFile ? (
            loadingFile ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin mb-2" />
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full h-full p-4 font-mono text-sm resize-none focus:outline-none"
                spellCheck="false"
                style={{ fontFamily: '"Fira Code", "JetBrains Mono", Consolas, monospace', lineHeight: '1.5' }}
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Code className="w-16 h-16 mb-4 opacity-20" />
              <p>Select a file to edit</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
