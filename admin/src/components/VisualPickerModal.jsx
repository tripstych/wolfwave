import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export default function VisualPickerModal({ 
  isOpen, 
  onClose, 
  url, 
  fields, 
  onSelectorPicked, 
  onDone,
  selectorMap = {}
}) {
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data.type === 'WOLFWAVE_SELECTOR_PICKED') {
        onSelectorPicked(e.data.field, e.data.selector);
      }
      if (e.data.type === 'WOLFWAVE_PICKER_DONE') {
        onDone();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSelectorPicked, onDone]);

  const handlePickerLoad = () => {
    const iframe = document.getElementById('wolfwave-picker-iframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'WOLFWAVE_SET_FIELDS',
        fields: fields
      }, '*');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black bg-opacity-75 flex flex-col !mt-0 !top-0">
      <div className="bg-white p-4 flex justify-between items-center border-b shadow-md">
        <div className="flex items-center gap-4 flex-1">
          <h2 className="font-bold shrink-0">Live Visual Picker</h2>
          <div className="text-xs text-gray-500 truncate font-mono bg-gray-100 px-2 py-1 rounded max-w-md">
            Source: {url}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {Object.entries(selectorMap).map(([field, selector]) => (
              <span key={field} className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-mono rounded border border-green-200 whitespace-nowrap">
                {field} mapped
              </span>
            ))}
          </div>
        </div>
        <button onClick={onClose} className="btn btn-ghost ml-4">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 bg-white">
        <iframe 
          id="wolfwave-picker-iframe"
          src={`/api/import/proxy?url=${encodeURIComponent(url)}`} 
          onLoad={handlePickerLoad}
          className="w-full h-full border-none"
          title="Visual Picker"
        />
      </div>
    </div>
  );
}
