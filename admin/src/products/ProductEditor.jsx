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
import MenuWidget from '../components/MenuWidget';
import VisualPickerModal from '../components/VisualPickerModal';
import HistoryPreviewModal from '../components/HistoryPreviewModal';
import CodeEditor from '../components/CodeEditor';

// Hooks
import useContentEditor from '../hooks/useContentEditor';
import { useTranslation } from '../context/TranslationContext';

// Icons
import { 
  Save, ArrowLeft, ExternalLink, Plus, X, Trash2, DownloadCloud, Loader2, Globe, Maximize2, Image as ImageIcon, Code, Eye, Sparkles, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

export default function ProductEditor() {
  const navigate = useNavigate();
  const { _ } = useTranslation();

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
    history,
    loadingHistory,
    handleFieldChange,
    handleContentChange,
    handleTemplateChange,
    handleSave,
    syncTemplates,
    restoreVersion,
    partialRestore
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
  const [activeTab, setActiveTab] = useState('editor');
  const [previewingVersion, setPreviewingVersion] = useState(null);
  const [mediaPickerTarget, setMediaPickerTarget] = useState(null);
  const [options, setOptions] = useState([]);
  const [importing, setImporting] = useState(false);

  // Visual Picker State
  const [showPicker, setShowPicker] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [selectorMap, setSelectorMap] = useState({});
  const [generating, setGenerating] = useState(false);
  const [aiPrompts, setAiPrompts] = useState({});
  const [imageGenerating, setImageGenerating] = useState(null);

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
    if (mediaPickerTarget === 'images') {
      const currentImages = product.images || [];
      handleFieldChange('images', [...currentImages, { url: media.url, alt: '', position: currentImages.length }]);
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
    const toastId = toast.loading(_('products.import.loading', 'Extracting content from live site...'));
    try {
      const field_types = Object.fromEntries(regions.map(r => [r.name, r.type]));
      field_types.title = 'text';
      field_types.price = 'text';
      field_types.sku = 'text';

      const res = await api.post('/import/extract', { 
        url: scrapeUrl, 
        selector_map: selectorMap,
        field_types
      });
      if (res.success && res.data) {
        const extracted = res.data;
        setProduct(prev => {
          const newContent = { ...prev.content };
          const updates = {};
          let newImages = [...(prev.images || [])];

          Object.keys(extracted).forEach(key => {
            if (key === 'title') updates.title = extracted[key];
            else if (key === 'price') updates.price = parseFloat(extracted[key].replace(/[^\d.]/g, '')) || prev.price;
            else if (key === 'sku') updates.sku = extracted[key];
            else if (key === 'images') {
              const urls = Array.isArray(extracted[key]) ? extracted[key] : [extracted[key]];
              const mapped = urls.map((url, i) => ({ url, alt: '', position: newImages.length + i }));
              newImages = [...newImages, ...mapped];
              if (!updates.image && !prev.image && mapped.length > 0) {
                updates.image = mapped[0].url;
              }
            }
            else if (key === 'videos') {
              const urls = Array.isArray(extracted[key]) ? extracted[key] : [extracted[key]];
              newContent.videos = [...(newContent.videos || []), ...urls];
            }
            else if (key === 'description') newContent.description = extracted[key];
            else newContent[key] = extracted[key];
          });
          return { ...prev, ...updates, content: newContent, images: newImages };
        });
        toast.success(_('products.import.success', 'Content extracted!'), { id: toastId });
      }
    } catch (err) {
      toast.error(_('products.import.error', 'Extraction failed: ') + err.message, { id: toastId });
    } finally {
      setImporting(false);
      setShowPicker(false);
    }
  };

  const handleImport = async () => {
    const url = window.prompt(_('products.import.prompt', 'Enter a product URL to import from (Shopify, WooCommerce, etc):'));
    if (!url) return;
    setImporting(true);
    try {
      const response = await api.post('/import/url', { url });
      if (response.success && response.data) {
        const data = response.data;
        const importedImages = (data.images || []).map((url, i) => ({ url, alt: '', position: i }));
        setProduct(prev => ({
          ...prev,
          title: data.title || prev.title,
          content: { ...prev.content, description: data.description || '' },
          price: data.price ? parseFloat(data.price) : prev.price,
          sku: data.sku || prev.sku,
          image: data.images ? data.images[0] : prev.image,
          images: importedImages
        }));
        toast.success(_('products.import.success_simple', 'Product data imported!'));
      }
    } catch (err) {
      toast.error(_('products.import.error_simple', 'Import failed: ') + err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!product.template_id) return toast.error(_('products.error.no_template', 'Select a template first'));
    const prompt = window.prompt(_('ai.generate.prompt', 'What content should we generate?'), product.title);
    if (!prompt) return;

    setGenerating(true);
    const toastId = toast.loading(_('ai.generate.loading', 'Generating content, please wait...'));
    try {
      const response = await api.post('/ai/generate-content', { templateId: product.template_id, prompt });
      if (response.success && response.data) {
        const textContent = {};
        const newAiPrompts = {};
        Object.keys(response.data).forEach(key => {
          const region = regions.find(r => r.name === key);
          if (region?.type === 'image') newAiPrompts[key] = response.data[key];
          else textContent[key] = response.data[key];
        });
        setProduct(p => ({ ...p, content: { ...p.content, ...textContent } }));
        setAiPrompts(prev => ({ ...prev, ...newAiPrompts }));
        toast.success(_('ai.generate.success', 'Content generated!'), { id: toastId });
      }
    } catch (err) {
      toast.error(_('ai.generate.error', 'Generation failed'), { id: toastId });
    } finally {
      setGenerating(false);
    }
  };

  const handleImageGenerate = async (regionName) => {
    const prompt = window.prompt(_('ai.image.prompt', 'Describe the image:'), aiPrompts[regionName] || `Image for ${product.title}`);
    if (!prompt) return;
    setImageGenerating(regionName);
    const toastId = toast.loading(_('ai.image.loading', 'Generating image, please wait...'));
    try {
      const response = await api.post('/ai/generate-image', { prompt });
      if (response.success && response.path) {
        handleContentChange(regionName, response.path);
        toast.success(_('ai.image.success', 'Image generated!'), { id: toastId });
      }
    } catch (err) {
      toast.error(_('ai.image.error', 'Image generation failed'), { id: toastId });
    } finally {
      setImageGenerating(null);
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

  const removeImage = (index) => {
    const newImages = (product.images || []).filter((_, i) => i !== index);
    handleFieldChange('images', newImages);
    // If we removed the primary image, update the main image field
    if (product.image === product.images?.[index]?.url) {
      handleFieldChange('image', newImages[0]?.url || null);
    }
  };

  const setPrimaryImage = (url) => {
    handleFieldChange('image', url);
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
          <h1>{isNew ? _('products.new_product', 'New Product') : _('products.edit_product', 'Edit Product')}</h1>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={handleImport} disabled={importing || saving}>
            {importing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DownloadCloud className="w-4 h-4 mr-2" />}
            {_('products.import_url', 'Import URL')}
          </button>
          {!isNew && product.slug && (
            <a href={getSiteUrl(product.slug)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary inline-flex items-center gap-2">
              <ExternalLink className="w-4 h-4" /> {_('common.view', 'View')}
            </a>
          )}
          <button className="btn btn-primary" onClick={() => handleSave()} disabled={saving}>
            {saving ? _('common.saving', 'Saving...') : _('products.save_product', 'Save Product')}
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

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('editor')}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  activeTab === 'editor'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {_('common.editor', 'Editor')}
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                  activeTab === 'history'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {_('common.history', 'History')} {history.length > 0 && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px]">{history.length}</span>}
              </button>
            </nav>
          </div>

          {activeTab === 'editor' ? (
            <>
              <div className="card p-6">
                <h2 className="mt-0 mb-4 text-lg font-bold">{_('products.pricing_title', 'Pricing & Identification')}</h2>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="label">{_('products.sku', 'SKU')} *</label>
                    <input type="text" value={product.sku || ''} onChange={(e) => handleFieldChange('sku', e.target.value)} className="input" placeholder="WB-001" />
                  </div>
                  <div>
                    <label className="label">{_('products.base_price', 'Base Price')} *</label>
                    <input type="number" step="0.01" value={product.price ?? ''} onChange={(e) => handleFieldChange('price', parseFloat(e.target.value) || 0)} className="input" />
                  </div>
                  <div>
                    <label className="label">{_('products.compare_price', 'Compare at Price')}</label>
                    <input type="number" step="0.01" value={product.compare_at_price ?? ''} onChange={(e) => handleFieldChange('compare_at_price', parseFloat(e.target.value) || null)} className="input" />
                  </div>
                  <div>
                    <label className="label">{_('products.inventory_qty', 'Inventory Quantity')}</label>
                    <input type="number" value={product.inventory_quantity ?? ''} onChange={(e) => handleFieldChange('inventory_quantity', parseInt(e.target.value) || 0)} className="input" disabled={product.variants?.length > 0} placeholder={product.variants?.length > 0 ? _('products.managed_by_variants', 'Managed by variants') : ''} />
                  </div>
                </div>
                <div className="mt-4 flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={product.inventory_tracking} onChange={(e) => handleFieldChange('inventory_tracking', e.target.checked)} />
                    <span className="text-sm">{_('products.track_inventory', 'Track Inventory')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={product.allow_backorder} onChange={(e) => handleFieldChange('allow_backorder', e.target.checked)} />
                    <span className="text-sm">{_('products.allow_backorder', 'Allow Backorder')}</span>
                  </label>
                </div>
              </div>

              {regions.length > 0 && (
                <div className="card p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="mt-0 mb-0 text-lg font-bold">{_('products.content_title', 'Product Content')}</h2>
                    <button
                      type="button"
                      onClick={() => setShowSource(!showSource)}
                      className={`btn btn-sm ${showSource ? 'btn-primary' : 'btn-ghost text-gray-500'} flex items-center gap-2`}
                      title={showSource ? _('common.switch_visual', "Switch to Visual Editor") : _('common.edit_source', "Edit Raw JSON Source")}
                    >
                      <Code className="w-4 h-4" />
                      {showSource ? _('common.view_editor', 'View Editor') : _('common.edit_source_label', 'Edit Source')}
                    </button>
                  </div>

                  {showSource ? (
                    <div className="space-y-2">
                      <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-100">
                        <strong>{_('common.warning', 'Warning')}:</strong> {_('products.json_warning', "Editing raw JSON can break the visual editor if the structure doesn't match the template regions.")}
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
                            onImageGenerate={handleImageGenerate}
                            imageGenerating={imageGenerating}
                            aiPrompt={aiPrompts[region.name]}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="card p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="m-0 text-lg font-bold">{_('products.options_title', 'Options & Variants')}</h2>
                  {options.length < 3 && <button onClick={addOption} className="btn btn-secondary text-sm"><Plus className="w-4 h-4 mr-2" /> {_('products.add_option', 'Add Option')}</button>}
                </div>
                {options.map((option, optIndex) => (
                  <div key={optIndex} className="border p-4 rounded-md mb-4 bg-gray-50">
                    <div className="flex gap-2 items-center mb-2">
                      <input type="text" value={option.name} onChange={(e) => updateOptionName(optIndex, e.target.value)} placeholder={_('products.option_placeholder', "e.g. Color")} className="input flex-1" />
                      <button onClick={() => removeOption(optIndex)} className="text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {option.values.map((v, vIndex) => (
                        <span key={vIndex} className="bg-white border px-2 py-1 rounded text-sm flex items-center gap-1">
                          {v} <button onClick={() => removeOptionValue(optIndex, vIndex)}><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                    <input type="text" placeholder={_('products.add_value', "Add value...")} onKeyDown={(e) => { if(e.key === 'Enter') { addOptionValue(optIndex, e.target.value); e.target.value = ''; } }} className="input text-sm" />
                  </div>
                ))}

                {product.variants?.length > 0 && (
                  <div className="overflow-x-auto mt-4">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-left"><th>{_('products.variant', 'Variant')}</th><th>{_('products.sku', 'SKU')}</th><th>{_('products.price', 'Price')}</th><th>{_('products.stock', 'Stock')}</th><th>{_('products.image', 'Image')}</th></tr></thead>
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
            </>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 font-bold text-gray-500 uppercase text-xs">{_('common.version', 'Version')}</th>
                    <th className="px-6 py-3 font-bold text-gray-500 uppercase text-xs">{_('common.date', 'Date')}</th>
                    <th className="px-6 py-3 font-bold text-gray-500 uppercase text-xs">{_('common.title', 'Title')}</th>
                    <th className="px-6 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((ver) => (
                    <tr key={ver.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium">v{ver.version_number}</td>
                      <td className="px-6 py-4 text-gray-500">{new Date(ver.created_at).toLocaleString()}</td>
                      <td className="px-6 py-4">{ver.title}</td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => setPreviewingVersion(ver)}
                          className="btn btn-xs btn-secondary"
                        >
                          <Eye className="w-3 h-3 mr-1" /> {_('common.preview_select', 'Preview & Select')}
                        </button>
                        <button
                          onClick={() => restoreVersion(ver.id)}
                          className="text-primary-600 hover:text-primary-900 font-medium text-xs"
                        >
                          {_('common.full_restore', 'Full Restore')}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan="4" className="px-6 py-12 text-center text-gray-400 italic">{_('common.no_history', 'No version history yet. Updates will create recovery points.')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="mt-0 mb-0 text-lg font-bold">{_('products.media_title', 'Product Media')}</h2>
              <button onClick={() => openMediaPicker('images')} className="btn btn-ghost btn-sm text-primary-600">
                <Plus className="w-4 h-4 mr-1" /> {_('common.add', 'Add')}
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              {(product.images || []).map((img, idx) => (
                <div key={idx} className={`relative group aspect-square rounded-lg border-2 overflow-hidden ${product.image === img.url ? 'border-primary-500' : 'border-gray-200'}`}>
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button 
                      onClick={() => setPrimaryImage(img.url)}
                      title={_('products.set_primary', "Set as primary")}
                      className={`p-1.5 rounded-full ${product.image === img.url ? 'bg-primary-500 text-white' : 'bg-white text-gray-700'}`}
                    >
                      <Save className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => removeImage(idx)}
                      title={_('common.remove_image', "Remove image")}
                      className="p-1.5 bg-white text-red-500 rounded-full"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {product.image === img.url && (
                    <div className="absolute top-1 left-1 bg-primary-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">
                      {_('common.primary', 'Primary')}
                    </div>
                  )}
                </div>
              ))}
              <button
                onClick={() => openMediaPicker('images')}
                className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-primary-500 hover:text-primary-500 transition-colors"
              >
                <Plus className="w-6 h-6" />
                <span className="text-[10px] font-medium uppercase">{_('common.add_media', 'Add Media')}</span>
              </button>
            </div>
            <p className="text-[10px] text-gray-500 text-center italic">{_('products.media_hint', 'The highlighted image is used as the primary display.')}</p>
          </div>

          <div className="card p-6 space-y-4 border-amber-200 bg-amber-50/30">
            <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase"><Globe className="w-4 h-4" /> {_('products.visual_scrape', 'Live Visual Scrape')}</div>
            <input type="url" placeholder={_('common.url_placeholder', "URL...")} value={scrapeUrl} onChange={e => setScrapeUrl(e.target.value)} className="input text-sm" />
            <button onClick={() => setShowPicker(true)} className="btn btn-secondary w-full py-2 text-xs"><Maximize2 className="w-3 h-3 mr-2" /> {_('products.visual_scrape_btn', 'Visual Scrape')}</button>
          </div>

          <div className="card p-6 space-y-4">
            <div>
              <label className="label">{_('products.status', 'Status')}</label>
              <select value={product.status || 'draft'} onChange={(e) => handleFieldChange('status', e.target.value)} className="input">
                <option value="draft">{_('status.draft', 'Draft')}</option><option value="active">{_('status.active', 'Active')}</option><option value="archived">{_('status.archived', 'Archived')}</option>
              </select>
            </div>
            <div>
              <label className="label">{_('products.template', 'Template')} *</label>
              <div className="flex gap-2">
                <select value={product.template_id || ''} onChange={(e) => handleTemplateChange(e.target.value)} className="input flex-1">
                  <option value="">{_('products.select_template', 'Select template')}</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button onClick={syncTemplates} className="btn btn-ghost px-3" title={_('common.sync_templates', "Sync templates")}>
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={handleAiGenerate}
                disabled={generating || !product.template_id}
                className="btn btn-secondary w-full mt-2 flex items-center justify-center gap-2 text-indigo-600 border-indigo-200"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {_('ai.auto_fill', 'Auto-Fill Content')}
              </button>
            </div>
          </div>

          <MenuWidget
            title={product.title}
            url={product.slug}
            contentType="products"
          />

          <AccessControlSection
            accessRules={product.access_rules}
            subscriptionPlans={subscriptionPlans}
            onChange={(rules) => handleFieldChange('access_rules', rules)}
          />

          <SEOSection
            data={product}
            onChange={(newData) => setProduct(newData)}
            hideImage={true}
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
          { id: 'images', label: 'Gallery Images' },
          { id: 'videos', label: 'Gallery Videos' },
          ...regions.map(r => ({ id: r.name, label: r.label || r.name }))
        ]}
        selectorMap={selectorMap}
        onSelectorPicked={(field, selector) => setSelectorMap(prev => ({ ...prev, [field]: selector }))}
        onDone={handleExtractContent}
      />

      <HistoryPreviewModal
        isOpen={!!previewingVersion}
        onClose={() => setPreviewingVersion(null)}
        version={previewingVersion}
        regions={regions}
        onRestore={partialRestore}
      />
    </div>
  );
}
