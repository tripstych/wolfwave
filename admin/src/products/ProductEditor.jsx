import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { getSiteUrl } from '../lib/urls';

// Shared Components
import TitleSlugSection from '../components/TitleSlugSection';
import AccessControlSection from '../components/AccessControlSection';
import SEOSection from '../components/SEOSection';
import DynamicField from '../components/DynamicField';
import MediaPicker from '../components/MediaPicker';
import ContentGroupsWidget from '../components/ContentGroupsWidget';
import VisualPickerModal from '../components/VisualPickerModal';
import CodeEditor from '../components/CodeEditor';

// Hooks
import useContentEditor from '../hooks/useContentEditor';

// Icons
import { 
  Save, ArrowLeft, ExternalLink, Plus, X, Trash2, DownloadCloud, Loader2, Globe, Maximize2, Image as ImageIcon, Code 
} from 'lucide-react';
import { toast } from 'sonner';

export default function ProductEditor() {
  const navigate = useNavigate();

  const {
    id,
    isNew,
    data: product,
    setData: setProduct,
    templates,
    subscriptionPlans,
    regions,
    loading,
    saving,
    handleFieldChange,
    handleContentChange,
    handleTemplateChange,
    handleSave,
  } = useContentEditor({
    contentType: 'products',
    endpoint: '/products',
    initialData: {
      content_type: 'products',
      sku: '',
      price: 0,
      inventory_tracking: true,
      status: 'draft',
      variants: []
    }
  });

  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState(null);
  const [options, setOptions] = useState([]);
  const [importing, setImporting] = useState(false);

  // Visual Picker State
  const [showPicker, setShowPicker] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [selectorMap, setSelectorMap] = useState({});

  useEffect(() => {
    if (!loading && product.variants?.length > 0 && options.length === 0) {
      setOptions(deriveOptionsFromVariants(product.variants));
    }
  }, [loading, product.variants]);

  // Variant helpers
  const cartesian = (arrays) => {
    if (arrays.length === 0) return [];
    return arrays.reduce((acc, arr) =>
      acc.flatMap(combo => arr.map(val => [...combo, val])),
      [[]]
    );
  };

  const deriveOptionsFromVariants = (variants) => {
    const opts = [];
    if (!variants || variants.length === 0) return [];
    for (let i = 1; i <= 3; i++) {
      const name = variants[0]?.[`option${i}_name`];
      if (name) {
        const values = [...new Set(variants.map(v => v[`option${i}_value`]).filter(Boolean))];
        opts.push({ name, values });
      }
    }
    return opts;
  };

  const generateVariantsFromOptions = (opts, existingVariants = []) => {
    const filteredOpts = opts.filter(o => o.name && o.values.length > 0);
    if (filteredOpts.length === 0) return [];
    const combos = cartesian(filteredOpts.map(o => o.values));
    return combos.map((combo, i) => {
      const existing = existingVariants.find(v =>
        filteredOpts.every((opt, j) => v[`option${j + 1}_value`] === combo[j])
      );
      const variant = {
        ...(existing ? {
          id: existing.id,
          sku: existing.sku,
          price: existing.price,
          compare_at_price: existing.compare_at_price,
          inventory_quantity: existing.inventory_quantity,
          image: existing.image
        } : {}),
        title: combo.join(' / '),
        position: i,
      };
      filteredOpts.forEach((opt, j) => {
        variant[`option${j + 1}_name`] = opt.name;
        variant[`option${j + 1}_value`] = combo[j];
      });
      for (let j = filteredOpts.length + 1; j <= 3; j++) {
        variant[`option${j}_name`] = null;
        variant[`option${j}_value`] = null;
      }
      return variant;
    });
  };

  const openMediaPicker = (target) => {
    setMediaPickerTarget(target);
    setMediaPickerOpen(true);
  };

  const handleMediaSelect = (media) => {
    if (mediaPickerTarget === 'og_image') {
      handleFieldChange('og_image', media.url);
    } else if (mediaPickerTarget?.startsWith('variant.')) {
      const vIndex = parseInt(mediaPickerTarget.split('.')[1]);
      const newVariants = [...product.variants];
      newVariants[vIndex] = { ...newVariants[vIndex], image: media.url };
      handleFieldChange('variants', newVariants);
    } else {
      handleContentChange(mediaPickerTarget, media.url);
    }
    setMediaPickerOpen(false);
  };

  const handleExtractContent = async () => {
    if (!scrapeUrl || Object.keys(selectorMap).length === 0) return;
    setImporting(true);
    try {
      const res = await api.post('/import/extract', { url: scrapeUrl, selector_map: selectorMap });
      if (res.success && res.data) {
        const extracted = res.data;
        setProduct(prev => {
          const newContent = { ...prev.content };
          const updates = {};
          Object.keys(extracted).forEach(key => {
            if (key === 'title') updates.title = extracted[key];
            else if (key === 'price') updates.price = parseFloat(extracted[key].replace(/[^\d.]/g, '')) || prev.price;
            else if (key === 'sku') updates.sku = extracted[key];
            else if (key === 'description') newContent.description = extracted[key];
            else newContent[key] = extracted[key];
          });
          return { ...prev, ...updates, content: newContent };
        });
        toast.success('Content extracted!');
      }
    } catch (err) {
      toast.error('Extraction failed: ' + err.message);
    } finally {
      setImporting(false);
      setShowPicker(false);
    }
  };

  const handleImport = async () => {
    const url = window.prompt('Enter a product URL to import from (Shopify, WooCommerce, etc):');
    if (!url) return;
    setImporting(true);
    try {
      const response = await api.post('/import/url', { url });
      if (response.success && response.data) {
        const data = response.data;
        setProduct(prev => ({
          ...prev,
          title: data.title || prev.title,
          content: { ...prev.content, description: data.description || '' },
          price: data.price ? parseFloat(data.price) : prev.price,
          sku: data.sku || prev.sku,
          og_image: data.images ? data.images[0] : prev.og_image
        }));
        toast.success('Product data imported!');
      }
    } catch (err) {
      toast.error('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const addOption = () => {
    if (options.length >= 3) return;
    setOptions([...options, { name: '', values: [] }]);
  };

  const removeOption = (index) => {
    const newOptions = options.filter((_, i) => i !== index);
    setOptions(newOptions);
    handleFieldChange('variants', generateVariantsFromOptions(newOptions, product.variants));
  };

  const updateOptionName = (index, name) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], name };
    setOptions(newOptions);
    handleFieldChange('variants', generateVariantsFromOptions(newOptions, product.variants));
  };

  const addOptionValue = (optionIndex, value) => {
    if (!value.trim()) return;
    const newOptions = [...options];
    if (newOptions[optionIndex].values.includes(value.trim())) return;
    newOptions[optionIndex] = { ...newOptions[optionIndex], values: [...newOptions[optionIndex].values, value.trim()] };
    setOptions(newOptions);
    handleFieldChange('variants', generateVariantsFromOptions(newOptions, product.variants));
  };

  const removeOptionValue = (optionIndex, valueIndex) => {
    const newOptions = [...options];
    newOptions[optionIndex] = { ...newOptions[optionIndex], values: newOptions[optionIndex].values.filter((_, i) => i !== valueIndex) };
    setOptions(newOptions);
    handleFieldChange('variants', generateVariantsFromOptions(newOptions, product.variants));
  };

  const handleVariantChange = (vIndex, field, value) => {
    const newVariants = [...product.variants];
    newVariants[vIndex] = { ...newVariants[vIndex], [field]: value };
    handleFieldChange('variants', newVariants);
  };

  if (loading) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary-600" /></div>;

  return (
    <div className="content-container">
      <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-200 sticky top-16 bg-white z-20 -mx-6 px-6 pt-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/products')} className="btn btn-ghost"><ArrowLeft className="w-4 h-4" /></button>
          <h1>{isNew ? 'New Product' : 'Edit Product'}</h1>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={handleImport} disabled={importing || saving}>
            {importing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DownloadCloud className="w-4 h-4 mr-2" />}
            Import URL
          </button>
          {!isNew && product.slug && (
            <a href={getSiteUrl(product.slug)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary inline-flex items-center gap-2">
              <ExternalLink className="w-4 h-4" /> View
            </a>
          )}
          <button className="btn btn-primary" onClick={() => handleSave()} disabled={saving}>
            {saving ? 'Saving...' : 'Save Product'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <TitleSlugSection
            title={product.title}
            slug={product.slug}
            onTitleChange={(val) => handleFieldChange('title', val)}
            onSlugChange={(val) => handleFieldChange('slug', val)}
          />

          <div className="card p-6">
            <h2 className="mt-0 mb-4 text-lg font-bold">Pricing & Identification</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="label">SKU *</label>
                <input type="text" value={product.sku || ''} onChange={(e) => handleFieldChange('sku', e.target.value)} className="input" placeholder="WB-001" />
              </div>
              <div>
                <label className="label">Base Price *</label>
                <input type="number" step="0.01" value={product.price ?? ''} onChange={(e) => handleFieldChange('price', parseFloat(e.target.value) || 0)} className="input" />
              </div>
              <div>
                <label className="label">Compare at Price</label>
                <input type="number" step="0.01" value={product.compare_at_price ?? ''} onChange={(e) => handleFieldChange('compare_at_price', parseFloat(e.target.value) || null)} className="input" />
              </div>
              <div>
                <label className="label">Inventory Quantity</label>
                <input type="number" value={product.inventory_quantity ?? ''} onChange={(e) => handleFieldChange('inventory_quantity', parseInt(e.target.value) || 0)} className="input" disabled={product.variants?.length > 0} placeholder={product.variants?.length > 0 ? 'Managed by variants' : ''} />
              </div>
            </div>
            <div className="mt-4 flex gap-6">
               <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={product.inventory_tracking} onChange={(e) => handleFieldChange('inventory_tracking', e.target.checked)} />
                <span className="text-sm">Track Inventory</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={product.allow_backorder} onChange={(e) => handleFieldChange('allow_backorder', e.target.checked)} />
                <span className="text-sm">Allow Backorder</span>
              </label>
            </div>
          </div>

          {regions.length > 0 && (
            <div className="card p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="mt-0 mb-0 text-lg font-bold">Product Content</h2>
                <button
                  type="button"
                  onClick={() => setShowSource(!showSource)}
                  className={`btn btn-sm ${showSource ? 'btn-primary' : 'btn-ghost text-gray-500'} flex items-center gap-2`}
                  title={showSource ? "Switch to Visual Editor" : "Edit Raw JSON Source"}
                >
                  <Code className="w-4 h-4" />
                  {showSource ? 'View Editor' : 'Edit Source'}
                </button>
              </div>

              {showSource ? (
                <div className="space-y-2">
                  <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-100">
                    <strong>Warning:</strong> Editing raw JSON can break the visual editor if the structure doesn't match the template regions.
                  </p>
                  <CodeEditor
                    mode="json"
                    value={JSON.stringify(product.content, null, 2)}
                    onChange={(val) => {
                      try {
                        const parsed = JSON.parse(val);
                        handleFieldChange('content', parsed);
                      } catch (e) {
                        // Invalid JSON, don't update state yet to prevent crashes
                      }
                    }}
                    height="500px"
                  />
                </div>
              ) : (
                <div className="space-y-6">
                  {regions.map((region) => (
                    <div key={region.name}>
                      <label className="label">{region.label}</label>
                      <DynamicField
                        region={region}
                        value={product.content[region.name]}
                        onChange={handleContentChange}
                        openMediaPicker={openMediaPicker}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="card p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="m-0 text-lg font-bold">Options & Variants</h2>
              {options.length < 3 && <button onClick={addOption} className="btn btn-secondary text-sm"><Plus className="w-4 h-4 mr-2" /> Add Option</button>}
            </div>
            {options.map((option, optIndex) => (
              <div key={optIndex} className="border p-4 rounded-md mb-4 bg-gray-50">
                <div className="flex gap-2 items-center mb-2">
                  <input type="text" value={option.name} onChange={(e) => updateOptionName(optIndex, e.target.value)} placeholder="e.g. Color" className="input flex-1" />
                  <button onClick={() => removeOption(optIndex)} className="text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {option.values.map((v, vIndex) => (
                    <span key={vIndex} className="bg-white border px-2 py-1 rounded text-sm flex items-center gap-1">
                      {v} <button onClick={() => removeOptionValue(optIndex, vIndex)}><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
                <input type="text" placeholder="Add value..." onKeyDown={(e) => { if(e.key === 'Enter') { addOptionValue(optIndex, e.target.value); e.target.value = ''; } }} className="input text-sm" />
              </div>
            ))}

            {product.variants?.length > 0 && (
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left"><th>Variant</th><th>SKU</th><th>Price</th><th>Stock</th><th>Image</th></tr></thead>
                  <tbody>
                    {product.variants.map((v, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-2">{v.title}</td>
                        <td className="py-2"><input type="text" value={v.sku || ''} onChange={(e) => handleVariantChange(i, 'sku', e.target.value)} className="input py-1" /></td>
                        <td className="py-2"><input type="number" value={v.price ?? ''} onChange={(e) => handleVariantChange(i, 'price', parseFloat(e.target.value))} className="input py-1 w-24" /></td>
                        <td className="py-2"><input type="number" value={v.inventory_quantity ?? 0} onChange={(e) => handleVariantChange(i, 'inventory_quantity', parseInt(e.target.value))} className="input py-1 w-20" /></td>
                        <td className="py-2">
                           <div className="flex items-center gap-1">
                             {v.image && <img src={v.image} className="w-8 h-8 rounded" />}
                             <button onClick={() => openMediaPicker(`variant.${i}`)} className="p-1 border rounded"><ImageIcon className="w-4 h-4" /></button>
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6 space-y-4 border-amber-200 bg-amber-50/30">
            <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase"><Globe className="w-4 h-4" /> Live Visual Scrape</div>
            <input type="url" placeholder="URL..." value={scrapeUrl} onChange={e => setScrapeUrl(e.target.value)} className="input text-sm" />
            <button onClick={() => setShowPicker(true)} className="btn btn-secondary w-full py-2 text-xs"><Maximize2 className="w-3 h-3 mr-2" /> Visual Scrape</button>
          </div>

          <div className="card p-6 space-y-4">
            <div>
              <label className="label">Status</label>
              <select value={product.status || 'draft'} onChange={(e) => handleFieldChange('status', e.target.value)} className="input">
                <option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="label">Template *</label>
              <select value={product.template_id || ''} onChange={(e) => handleTemplateChange(e.target.value)} className="input">
                <option value="">Select template</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          <AccessControlSection
            accessRules={product.access_rules}
            subscriptionPlans={subscriptionPlans}
            onChange={(rules) => handleFieldChange('access_rules', rules)}
          />

          <SEOSection
            data={product}
            onChange={(newData) => setProduct(newData)}
            openMediaPicker={openMediaPicker}
          />
        </div>
      </div>

      {product.id && <ContentGroupsWidget contentId={product.content_id || product.id} />}

      {mediaPickerOpen && <MediaPicker onSelect={handleMediaSelect} onClose={() => setMediaPickerOpen(false)} />}
      
      <VisualPickerModal
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        url={scrapeUrl}
        fields={[
          { id: 'title', label: 'Title' }, { id: 'price', label: 'Price' }, { id: 'sku', label: 'SKU' },
          ...regions.map(r => ({ id: r.name, label: r.label || r.name }))
        ]}
        selectorMap={selectorMap}
        onSelectorPicked={(field, selector) => setSelectorMap(prev => ({ ...prev, [field]: selector }))}
        onDone={handleExtractContent}
      />
    </div>
  );
}
