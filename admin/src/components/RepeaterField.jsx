import React from 'react';
import { Plus, Trash2, Image as ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';
import DynamicField from './DynamicField';

export default function RepeaterField({ 
  region, 
  value = [], 
  onChange, 
  openMediaPicker 
}) {
  const items = Array.isArray(value) ? value : [];

  // Determine subfields (either from region definition or inferred)
  const explicitFields = Array.isArray(region.fields) && region.fields.length > 0 ? region.fields : null;
  const inferredFields = !explicitFields && items[0] && typeof items[0] === 'object' && !Array.isArray(items[0])
    ? Object.keys(items[0])
        .filter((key) => key !== 'id')
        .map((name) => ({
          name,
          label: name
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase()),
          type: (() => {
            const n = name.toLowerCase();
            if (n.includes('description')) return 'textarea';
            if (n.includes('image') || n === 'src' || n.endsWith('_src') || n.endsWith('-src')) return 'image';
            return 'text';
          })()
        }))
    : [];

  const fields = explicitFields || inferredFields;

  const handleAdd = () => {
    const newItem = {};
    fields.forEach(f => newItem[f.name] = f.type === 'number' ? 0 : '');
    onChange(region.name, [...items, newItem]);
  };

  const handleRemove = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    onChange(region.name, newItems);
  };

  const handleItemChange = (index, fieldName, fieldValue) => {
    const newItems = items.map((item, i) =>
      i === index ? { ...item, [fieldName]: fieldValue } : item
    );
    onChange(region.name, newItems);
  };

  const handleMove = (index, direction) => {
    const newItems = [...items];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newItems.length) return;
    [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
    onChange(region.name, newItems);
  };

  return (
    <div className="space-y-4">
      {(!explicitFields && items.length > 0) && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          Repeater field schema missing. Fields inferred from existing data.
        </div>
      )}
      
      {items.map((item, index) => (
        <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-4 bg-white shadow-sm relative group">
          <div className="flex justify-between items-center pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-400">#{index + 1}</span>
              <div className="flex flex-col">
                <button 
                  type="button"
                  onClick={() => handleMove(index, -1)}
                  disabled={index === 0}
                  className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button 
                  type="button"
                  onClick={() => handleMove(index, 1)}
                  disabled={index === items.length - 1}
                  className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleRemove(index)}
              className="text-gray-400 hover:text-red-500 transition-colors p-1"
              title="Remove item"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {fields.map((field) => (
              <div key={field.name}>
                <label className="label text-xs mb-1 uppercase tracking-wider text-gray-500 font-bold">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                <DynamicField
                  region={field}
                  value={item[field.name]}
                  onChange={(_, val) => handleItemChange(index, field.name, val)}
                  openMediaPicker={(target) => openMediaPicker(`content.${region.name}.${index}.${target}`)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={handleAdd}
        className="btn btn-secondary w-full border-dashed border-2 py-4 hover:border-primary-500 hover:bg-primary-50 transition-all group"
      >
        <Plus className="w-5 h-5 mr-2 text-gray-400 group-hover:text-primary-500" />
        <span className="text-gray-500 group-hover:text-primary-700 font-bold">Add Item to {region.label}</span>
      </button>
    </div>
  );
}
