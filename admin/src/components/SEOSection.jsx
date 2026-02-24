import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react';

export default function SEOSection({ data, onChange, openMediaPicker = () => {}, hideImage = false }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleFieldChange = (field, value) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between text-left"
      >
        <span className="font-semibold text-gray-900">SEO Settings</span>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        )}
      </button>
      {isOpen && (
        <div className="px-6 pb-6 space-y-4 border-t border-gray-200 pt-4">
          <div>
            <label className="label">Meta Title</label>
            <input
              id="input-meta-title"
              type="text"
              value={data.meta_title || ''}
              onChange={(e) => handleFieldChange('meta_title', e.target.value)}
              className="input"
              maxLength={60}
              placeholder="Search engine title"
            />
            <p className="text-xs text-gray-500 mt-1">
              {(data.meta_title || '').length}/60 characters
            </p>
          </div>
          <div>
            <label className="label">Meta Description</label>
            <textarea
              id="input-meta-description"
              value={data.meta_description || ''}
              onChange={(e) => handleFieldChange('meta_description', e.target.value)}
              className="input"
              rows={3}
              maxLength={160}
              placeholder="Brief summary for search results"
            />
            <p className="text-xs text-gray-500 mt-1">
              {(data.meta_description || '').length}/160 characters
            </p>
          </div>
          {!hideImage && (
            <div>
              <label className="label">OG Image</label>
              {data.og_image && (
                <img src={data.og_image} alt="" className="max-w-full rounded-lg border mb-2 h-32 object-cover" />
              )}
              <button
                id="btn-select-og-image"
                type="button"
                onClick={() => openMediaPicker('og_image')}
                className="btn btn-secondary w-full"
              >
                <ImageIcon className="w-4 h-4 mr-2" />
                {data.og_image ? 'Change' : 'Select'} OG Image
              </button>
            </div>
          )}
          {data.hasOwnProperty('robots') && (
            <div>
              <label className="label">Robots</label>
              <select
                id="select-robots"
                value={data.robots || 'index, follow'}
                onChange={(e) => handleFieldChange('robots', e.target.value)}
                className="input"
              >
                <option value="index, follow">Index, Follow</option>
                <option value="noindex, follow">No Index, Follow</option>
                <option value="index, nofollow">Index, No Follow</option>
                <option value="noindex, nofollow">No Index, No Follow</option>
              </select>
            </div>
          )}
          {data.hasOwnProperty('canonical_url') && (
            <div>
              <label className="label">Canonical URL</label>
              <input
                id="input-canonical-url"
                type="text"
                value={data.canonical_url || ''}
                onChange={(e) => handleFieldChange('canonical_url', e.target.value)}
                className="input"
                placeholder="https://example.com/canonical-url"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
