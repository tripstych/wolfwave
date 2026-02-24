import React, { useState } from 'react';
import { X, CheckCircle, RotateCcw, AlertTriangle, Eye, FileText, Database } from 'lucide-react';

export default function HistoryPreviewModal({ 
  isOpen, 
  onClose, 
  version, 
  currentContent,
  regions,
  onRestore 
}) {
  if (!isOpen || !version) return null;

  const versionData = version.data || {};
  const [selectedFields, setSelectedFields] = useState(new Set(Object.keys(versionData)));
  const [restoreMetadata, setRestoreMetadata] = useState(true);

  const toggleField = (field) => {
    const next = new Set(selectedFields);
    if (next.has(field)) next.delete(field);
    else next.add(field);
    setSelectedFields(next);
  };

  const handleApply = () => {
    const fieldsToRestore = {};
    selectedFields.forEach(f => {
      fieldsToRestore[f] = versionData[f];
    });

    // Automatically include mixins if present in the version data
    if (versionData.__product) fieldsToRestore.__product = versionData.__product;
    if (versionData.__page) fieldsToRestore.__page = versionData.__page;

    onRestore({
      content: fieldsToRestore,
      title: restoreMetadata ? version.title : null,
      slug: restoreMetadata ? version.slug : null
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-primary-600" />
              Preview Version {version.version_number}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Saved on {new Date(version.created_at).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <div className="bg-amber-50 border border-amber-100 p-4 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              Select the fields you want to restore. This will overwrite your current unsaved changes in the editor.
            </div>
          </div>

          {/* Metadata Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Identity & SEO
            </h3>
            <div 
              className={`p-4 rounded-lg border transition-all cursor-pointer ${restoreMetadata ? 'border-primary-500 bg-primary-50/30 ring-1 ring-primary-500' : 'border-gray-200 bg-white hover:border-gray-300'}`}
              onClick={() => setRestoreMetadata(!restoreMetadata)}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400">Title</label>
                    <p className="text-sm font-medium text-gray-900">{version.title || '(Untitled)'}</p>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400">Slug</label>
                    <p className="text-xs font-mono text-gray-500">{version.slug || '(No slug)'}</p>
                  </div>
                </div>
                <div className={`mt-1 rounded-full p-1 ${restoreMetadata ? 'text-primary-600' : 'text-gray-300'}`}>
                  <CheckCircle className={`w-5 h-5 ${restoreMetadata ? 'fill-primary-100' : ''}`} />
                </div>
              </div>
            </div>
          </div>

          {/* Product/Page Mixin Preview */}
          {(versionData.__product || versionData.__page) && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                <Database className="w-4 h-4" /> 
                {versionData.__product ? 'Product Specifications' : 'Page Settings'}
              </h3>
              <div className="p-4 rounded-lg border border-primary-100 bg-primary-50/10 grid grid-cols-2 gap-4">
                {versionData.__product && (
                  <>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-400">Price</label>
                      <p className="text-sm font-bold text-green-600">${versionData.__product.price}</p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-400">SKU</label>
                      <p className="text-sm font-mono">{versionData.__product.sku || '(None)'}</p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-400">Stock</label>
                      <p className="text-sm">{versionData.__product.inventory_quantity} in stock</p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-400">Status</label>
                      <p className="text-sm capitalize">{versionData.__product.status}</p>
                    </div>
                  </>
                )}
                {versionData.__page && (
                  <>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-400">Status</label>
                      <p className="text-sm capitalize">{versionData.__page.status}</p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-400">Robots</label>
                      <p className="text-sm">{versionData.__page.robots}</p>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] uppercase font-bold text-gray-400">Meta Description</label>
                      <p className="text-xs text-gray-600 line-clamp-2">{versionData.__page.meta_description || '(None)'}</p>
                    </div>
                  </>
                )}
                <div className="col-span-2 pt-2 border-t border-primary-50">
                  <p className="text-[10px] text-primary-600 italic font-medium flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> 
                    These core settings will be restored automatically.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Regions Section */}
          <div className="space-y-4 pb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <Eye className="w-4 h-4" /> Content Regions
            </h3>
            <div className="grid grid-cols-1 gap-4">
              {regions.map(region => {
                const isSelected = selectedFields.has(region.name);
                const historicalValue = versionData[region.name];
                const hasValue = historicalValue !== undefined && historicalValue !== null && historicalValue !== '';

                return (
                  <div 
                    key={region.name}
                    className={`p-4 rounded-lg border transition-all ${isSelected ? 'border-primary-500 bg-primary-50/30 ring-1 ring-primary-500' : 'border-gray-200 bg-white'} ${!hasValue ? 'opacity-60 grayscale' : 'cursor-pointer hover:border-gray-300'}`}
                    onClick={() => hasValue && toggleField(region.name)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold uppercase text-gray-400">{region.label}</span>
                          <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{region.type}</span>
                        </div>
                        
                        <div className="bg-white border rounded p-3 max-h-32 overflow-hidden relative">
                          {!hasValue ? (
                            <span className="text-xs text-gray-400 italic">No data in this version</span>
                          ) : region.type === 'image' ? (
                            <img src={historicalValue} className="h-20 object-contain rounded" alt="" />
                          ) : (
                            <div 
                              className="text-xs text-gray-600 line-clamp-4 prose-sm"
                              dangerouslySetInnerHTML={{ __html: String(historicalValue).substring(0, 500) }}
                            />
                          )}
                          {hasValue && <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent" />}
                        </div>
                      </div>
                      
                      {hasValue && (
                        <div className={`mt-1 rounded-full p-1 ${isSelected ? 'text-primary-600' : 'text-gray-300'}`}>
                          <CheckCircle className={`w-5 h-5 ${isSelected ? 'fill-primary-100' : ''}`} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button 
            onClick={handleApply} 
            disabled={selectedFields.size === 0 && !restoreMetadata}
            className="btn btn-primary px-8"
          >
            Restore Selected
          </button>
        </div>
      </div>
    </div>
  );
}
