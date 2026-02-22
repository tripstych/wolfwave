import React from 'react';
import RichTextEditor from './RichTextEditor';
import { Image as ImageIcon, Sparkles, Loader2, X } from 'lucide-react';

export default function DynamicField({ 
  region, 
  value, 
  onChange, 
  openMediaPicker, 
  onImageGenerate,
  imageGenerating = false,
  aiPrompt = null
}) {
  const handleChange = (newValue) => {
    onChange(region.name, newValue);
  };

  switch (region.type) {
    case 'richtext':
      return (
        <RichTextEditor
          value={value || ''}
          onChange={handleChange}
        />
      );

    case 'textarea':
      return (
        <textarea
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          className="input min-h-[100px]"
          placeholder={region.placeholder}
        />
      );

    case 'image':
      return (
        <div className="space-y-2">
          {value && (
            <img src={value} alt="" className="max-w-xs rounded-lg border object-cover h-40" />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => openMediaPicker(region.name)}
              className="btn btn-secondary"
            >
              <ImageIcon className="w-4 h-4 mr-2" />
              {value ? 'Change Image' : 'Select Image'}
            </button>
            
            {onImageGenerate && (
              <button
                type="button"
                onClick={() => onImageGenerate(region.name)}
                disabled={imageGenerating === region.name}
                className={`btn ${aiPrompt ? 'btn-primary' : 'btn-secondary'} border-indigo-200 text-indigo-700`}
                title={aiPrompt ? "Generate from AI suggestion" : "Generate with AI"}
              >
                {imageGenerating === region.name ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                {aiPrompt ? 'Auto-Generate' : 'Generate'}
              </button>
            )}

            {value && (
              <button
                type="button"
                onClick={() => handleChange('')}
                className="btn btn-ghost text-red-600 p-2"
                title="Remove image"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {aiPrompt && (
            <p className="text-xs text-indigo-600 bg-indigo-50 p-2 rounded border border-indigo-100 mt-1">
              <strong>AI Suggestion:</strong> {aiPrompt}
            </p>
          )}
        </div>
      );

    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={value || false}
          onChange={(e) => handleChange(e.target.checked)}
          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
      );

    case 'select':
      return (
        <select
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          className="input"
        >
          <option value="">Select...</option>
          {region.options?.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'number':
      return (
        <input
          type="number"
          step="0.01"
          value={value ?? ''}
          onChange={(e) => handleChange(e.target.value ? parseFloat(e.target.value) : null)}
          className="input"
          placeholder={region.placeholder}
        />
      );

    case 'text':
    default:
      return (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => handleChange(e.target.value)}
          className="input"
          placeholder={region.placeholder}
        />
      );
  }
}
