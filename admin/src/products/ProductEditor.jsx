import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { slugify } from '../lib/slugify';
import { parseRegions } from '../lib/api';
import { getSiteUrl } from '../lib/urls';
import TitleSlugSection from '../components/TitleSlugSection';
import RichTextEditor from '../components/RichTextEditor';
import MediaPicker from '../components/MediaPicker';
import ContentGroupsWidget from '../components/ContentGroupsWidget';
import { Save, ArrowLeft, Image as ImageIcon, ExternalLink, Plus, X, Trash2, DownloadCloud, Loader2, Lock, Shield } from 'lucide-react';
import { toast } from 'sonner';

export default function ProductEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = !id || id === 'new';

  const [product, setProduct] = useState({
    template_id: '',
    title: '',
    slug: '',
    content_type: 'products',
    content: {},
    meta_title: '',
    meta_description: '',
    og_image: '',
    canonical_url: '',
    sku: '',
    price: 0,
    compare_at_price: null,
    cost: null,
    inventory_quantity: null,
    inventory_tracking: true,
    allow_backorder: false,
    weight: null,
    weight_unit: 'lb',
    requires_shipping: true,
    taxable: true,
    status: 'draft',
    is_digital: false,
    download_url: '',
    download_limit: 5,
    download_expiry_days: 30,
    variants: [],
    access_rules: {
      auth: 'any',
      subscription: 'any',
      plans: []
    }
  });

  const [templates, setTemplates] = useState([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState(null);
  const [options, setOptions] = useState([]);
  const [slugEdited, setSlugEdited] = useState(false);
  const [importing, setImporting] = useState(false);

  // Import Handler
  const handleImport = async () => {
    const url = window.prompt('Enter a product URL to import from (Shopify, WooCommerce, etc):');
    if (!url) return;

    try {
      setImporting(true);
      const response = await fetch('/api/import/url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ url })
      });

      if (!response.ok) throw new Error('Import failed');
      const { data } = await response.json();

      if (data.type !== 'product') {
        toast.warning('This URL looks like a page, not a product. Importing what we can.');
      }

      setProduct(prev => ({
        ...prev,
        title: data.title || prev.title,
        content: { ...prev.content, description: data.description || '' },
        price: data.price ? parseFloat(data.price) : prev.price,
        sku: data.sku || prev.sku,
        og_image: data.images[0] || prev.og_image
      }));

      toast.success('Product data imported! Review and save.');
    } catch (err) {
      toast.error('Failed to import from URL: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

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

  // Product module default fields
  const productDefaultFields = [
    { name: 'sku', label: 'SKU', type: 'text', required: true, section: 'inventory' },
    { name: 'price', label: 'Price', type: 'number', required: true, section: 'pricing' },
    { name: 'compare_at_price', label: 'Compare at Price', type: 'number', section: 'pricing' },
    { name: 'cost', label: 'Cost of Goods', type: 'number', section: 'pricing' },
    { name: 'inventory_quantity', label: 'Inventory Quantity', type: 'number', section: 'inventory' },
    { name: 'inventory_tracking', label: 'Track Inventory', type: 'checkbox', section: 'inventory' },
    { name: 'allow_backorder', label: 'Allow Backorder', type: 'checkbox', section: 'inventory' },
    { name: 'weight', label: 'Weight', type: 'number', section: 'shipping' },
    { name: 'weight_unit', label: 'Weight Unit', type: 'select', options: ['lb', 'kg', 'oz', 'g'], section: 'shipping' },
    { name: 'requires_shipping', label: 'Requires Shipping', type: 'checkbox', section: 'shipping' },
    { name: 'is_digital', label: 'Digital Product', type: 'checkbox', section: 'digital' },
    { name: 'download_url', label: 'Download URL', type: 'text', section: 'digital' },
    { name: 'download_limit', label: 'Download Limit', type: 'number', section: 'digital' },
    { name: 'download_expiry_days', label: 'Download Expiry (Days)', type: 'number', section: 'digital' },
    { name: 'taxable', label: 'Taxable', type: 'checkbox', section: 'tax' },
    { name: 'status', label: 'Status', type: 'select', options: ['draft', 'active', 'archived'], section: 'basic' }
  ];

  useEffect(() => {
    console.log('[ProductEditor] Mounting, isNew:', isNew);
    loadTemplates();
    loadSubscriptionPlans();
    if (!isNew) {
      fetchProduct();
      setSlugEdited(true);
    }
  }, [id]);

  const loadSubscriptionPlans = async () => {
    try {
      const response = await fetch('/api/subscription-plans', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to load plans');
      const data = await response.json();
      setSubscriptionPlans(data.data || []);
    } catch (err) {
      console.error('Failed to load subscription plans:', err);
    }
  };

  // Auto-sync slug from title only if not manually edited
  useEffect(() => {
    console.log('[ProductEditor] Sync Check:', { isNew, slugEdited, title: product.title });
    if (!slugEdited && product.title) {
      const newSlug = slugify(product.title, 'products');
      console.log('[ProductEditor] Auto-generating slug:', newSlug);
      handleUnifiedChange('slug', newSlug);
    }
  }, [product.title, slugEdited]);

  const loadTemplates = async () => {
    try {
      console.log('[ProductEditor] Loading templates...');
      const response = await fetch('/api/templates/content_type/products', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) throw new Error('Failed to load templates');
      const data = await response.json();
      console.log('[ProductEditor] Templates loaded:', data);
      setTemplates(data.data || []);
    } catch (err) {
      console.error('[ProductEditor] Failed to load templates:', err);
      setError('Failed to load templates');
    }
  };

  const getMergedFields = () => {
    const merged = [];
    const seen = new Set();

    // These are handled by specific UI components (Title, Slug, Image sections)
    // We only skip them in the generic "Product Details" list,
    // but the synchronization logic will still apply.
    const globallyHandled = new Set([
      'title',
      'slug',
      'og_image',
      'meta_title',
      'meta_description',
      'canonical_url',
      'inventory_quantity',
      'inventory_tracking',
      'allow_backorder',
      'sku',
      'product_details' // This is a special complex region
    ]);

    // 1. Process standard product fields
    productDefaultFields.forEach(f => {
      if (globallyHandled.has(f.name)) return;
      merged.push({ ...f, isProductField: true });
      seen.add(f.name);
    });

    // 2. Process template regions
    regions.forEach(r => {
      if (globallyHandled.has(r.name)) return;

      const existing = merged.find(f => f.name.toLowerCase() === r.name.toLowerCase());
      if (existing) {
        // Overlap! Mark it as template region too
        existing.isTemplateRegion = true;
        // Use template properties if they provide more info (like labels)
        if (r.label) existing.label = r.label;
        if (r.placeholder) existing.placeholder = r.placeholder;
      } else {
        merged.push({ ...r, isTemplateRegion: true });
      }
    });

    return merged;
  };

  const handleTemplateChange = (templateId) => {
    const numId = parseInt(templateId);
    const template = templates.find(t => t.id === numId);
    setProduct(p => ({ ...p, template_id: numId }));
    setRegions(parseRegions(template?.regions));
  };

  const fetchProduct = async () => {
    try {
      const response = await fetch(`/api/products/${id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) throw new Error('Failed to load product');

      const data = await response.json();
      console.log('[ProductEditor] Fetched product:', data);
      
      // Ensure access_rules exists
      if (!data.access_rules) {
        data.access_rules = { auth: 'any', subscription: 'any', plans: [] };
      } else if (!data.access_rules.plans) {
        data.access_rules.plans = [];
      }
      
      setProduct(data);
      setSlugEdited(true); // Mark as edited so sync doesn't overwrite fetched slug

      // Derive options from existing variants
      if (data.variants && data.variants.length > 0) {
        setOptions(deriveOptionsFromVariants(data.variants));
      }

      // Load template regions if product has a template
      if (data.template_id) {
        const template = templates.find(t => t.id === data.template_id);
        setRegions(parseRegions(template?.regions));
      }
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnifiedChange = (fieldName, value) => {
    console.log(`[ProductEditor] UnifiedChange: ${fieldName} =`, value);
    setProduct(prev => {
      // Check if this is a product field
      const isProductField = productDefaultFields.some(f => f.name === fieldName) ||
                            ['title', 'slug', 'og_image', 'meta_title', 'meta_description', 'canonical_url'].includes(fieldName);

      // Check if this is a template region
      const isTemplateRegion = regions.some(r => r.name === fieldName);

      const updates = {};
      if (isProductField) updates[fieldName] = value;
      if (isTemplateRegion) {
        updates.content = { ...prev.content, [fieldName]: value };
      }

      const newState = { ...prev, ...updates };
      console.log('[ProductEditor] New State Slug:', newState.slug);
      return newState;
    });
  };

  const openMediaPicker = (target) => {
    setMediaPickerTarget(target);
    setMediaPickerOpen(true);
  };

  const handleMediaSelect = (media) => {
    if (mediaPickerTarget === 'og_image') {
      handleUnifiedChange('og_image', media.url);
    } else if (mediaPickerTarget?.startsWith('variant.')) {
      const vIndex = parseInt(mediaPickerTarget.split('.')[1]);
      handleVariantChange(vIndex, 'image', media.url);
    } else {
      // Extract field name from target (e.g., "content.image" -> "image")
      const fieldName = mediaPickerTarget.split('.')[1];
      handleUnifiedChange(fieldName, media.url);
    }
    setMediaPickerOpen(false);
    setMediaPickerTarget(null);
  };

  // Option & variant handlers
  const addOption = () => {
    if (options.length >= 3) return;
    setOptions([...options, { name: '', values: [] }]);
  };

  const removeOption = (index) => {
    const newOptions = options.filter((_, i) => i !== index);
    setOptions(newOptions);
    setProduct(p => ({ ...p, variants: generateVariantsFromOptions(newOptions, p.variants) }));
  };

  const updateOptionName = (index, name) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], name };
    setOptions(newOptions);
    setProduct(p => ({ ...p, variants: generateVariantsFromOptions(newOptions, p.variants) }));
  };

  const addOptionValue = (optionIndex, value) => {
    if (!value.trim()) return;
    const newOptions = [...options];
    if (newOptions[optionIndex].values.includes(value.trim())) return;
    newOptions[optionIndex] = {
      ...newOptions[optionIndex],
      values: [...newOptions[optionIndex].values, value.trim()]
    };
    setOptions(newOptions);
    setProduct(p => ({ ...p, variants: generateVariantsFromOptions(newOptions, p.variants) }));
  };

  const removeOptionValue = (optionIndex, valueIndex) => {
    const newOptions = [...options];
    newOptions[optionIndex] = {
      ...newOptions[optionIndex],
      values: newOptions[optionIndex].values.filter((_, i) => i !== valueIndex)
    };
    setOptions(newOptions);
    setProduct(p => ({ ...p, variants: generateVariantsFromOptions(newOptions, p.variants) }));
  };

  const handleVariantChange = (variantIndex, field, value) => {
    setProduct(p => {
      const variants = [...p.variants];
      variants[variantIndex] = { ...variants[variantIndex], [field]: value };
      return { ...p, variants };
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      if (!product.sku?.trim()) {
        setError('SKU is required');
        setSaving(false);
        return;
      }

      if (product.price === undefined || product.price === '') {
        setError('Price is required');
        setSaving(false);
        return;
      }

      if (!product.template_id) {
        setError('Please select a product template');
        setSaving(false);
        return;
      }

      const method = isNew ? 'POST' : 'PUT';
      const url = isNew ? '/api/products' : `/api/products/${id}`;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(product)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save product');
      }

      const saved = await response.json();
      navigate(`/products/${saved.id}`);
    } catch (err) {
      setError(err.message);
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field) => {
    // Check if this is a template region OR product field
    const isTemplateRegion = field.isTemplateRegion;
    const isProductField = field.isProductField;

    const value = isProductField
      ? product[field.name]
      : (product.content[field.name] || '');

    const handleChange = (newValue) => {
      handleUnifiedChange(field.name, newValue);
    };

    switch (field.type) {
      case 'richtext':
        return (
          <RichTextEditor
            value={value}
            onChange={handleChange}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            className="input min-h-[100px]"
            placeholder={field.placeholder}
          />
        );

      case 'image':
        return (
          <div className="flex flex-col gap-2">
            {value && (
              <img src={value} alt="" className="max-w-[200px] rounded border border-gray-300" />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => openMediaPicker(`content.${field.name}`)}
                className="btn btn-secondary"
              >
                <ImageIcon className="w-4 h-4 mr-2" />
                {value ? 'Change Image' : 'Select Image'}
              </button>
              {value && (
                <button
                  type="button"
                  onClick={() => handleChange('')}
                  className="btn btn-ghost text-red-500"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        );

      case 'checkbox':
        return (
          <input
            type="checkbox"
            checked={value || false}
            onChange={(e) => handleChange(e.target.checked)}
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
            {field.options?.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );

      case 'number':
        return (
          <input
            type="number"
            step="0.01"
            value={value || ''}
            onChange={(e) => handleChange(e.target.value ? parseFloat(e.target.value) : null)}
            className="input"
          />
        );

      case 'text':
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            className="input"
            placeholder={field.placeholder}
          />
        );
    }
  };

  if (loading) {
    console.log('[ProductEditor] Still loading...');
    return <div className="content-container">Loading product...</div>;
  }

  console.log('[ProductEditor] Rendering form. Templates:', templates.length, 'Regions:', regions.length, 'Product:', product);

  if (templates.length === 0 && isNew) {
    return (
      <div className="content-container">
        <div className="p-4 bg-amber-50 border border-amber-300 rounded text-amber-800 mb-4">
          No product templates found. Please sync templates first.
        </div>
        <button onClick={loadTemplates} className="btn btn-secondary">
          Reload Templates
        </button>
      </div>
    );
  }

  return (
    <div className="content-container">
      <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-200 sticky top-16 bg-white z-20 -mx-6 px-6 pt-4">
        <h1>{isNew ? 'New Product' : 'Edit Product'}</h1>
        <div className="flex gap-2">
          <button
            className="btn btn-secondary"
            onClick={handleImport}
            disabled={importing || saving}
            title="Import from Shopify/WooCommerce URL"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
            <span className="ml-2 hidden sm:inline">Import URL</span>
          </button>
          {!isNew && product.slug && (
            <a

              href={getSiteUrl(product.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary inline-flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              View on site
            </a>
          )}
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/products')}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Product'}
          </button>
        </div>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800 mb-4">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Title and Slug Section */}
          <TitleSlugSection
            title={product.title}
            slug={product.slug}
            onTitleChange={(title) => handleUnifiedChange('title', title)}
            onSlugChange={(slug) => {
              setSlugEdited(true);
              handleUnifiedChange('slug', slug);
            }}
          />

          {/* Product Image */}
          <div className="card p-6">
            <h2 className="mt-0 mb-4 text-lg">Product Image</h2>
            <div className="flex items-start gap-4">
              {product.og_image && (
                <img src={product.og_image} alt="" className="w-[120px] h-[120px] object-cover rounded-md border border-gray-200" />
              )}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => openMediaPicker('og_image')}
                  className="btn btn-secondary inline-flex items-center gap-2"
                >
                  <ImageIcon className="w-4 h-4" />
                  {product.og_image ? 'Change Image' : 'Select Image'}
                </button>
                {product.og_image && (
                  <button
                    type="button"
                    onClick={() => handleUnifiedChange('og_image', '')}
                    className="btn btn-ghost text-red-500 text-sm p-0 h-auto inline-flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Remove image
                  </button>
                )}
                <p className="m-0 text-xs text-gray-500">
                  Default image for this product. Variants without their own image will use this.
                </p>
              </div>
            </div>
          </div>

          {/* Inventory Management */}
          <div className="card p-6">
            <h2 className="mt-0 mb-6 text-lg">Inventory Management</h2>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="label">SKU *</label>
                <input
                  type="text"
                  value={product.sku}
                  onChange={(e) => handleUnifiedChange('sku', e.target.value)}
                  className="input"
                  placeholder="e.g. WB-001"
                  required
                />
              </div>

              <div>
                <label className="label">
                  {product.variants?.length > 0 ? 'Total Inventory (Managed by Variants)' : 'Inventory Quantity'}
                </label>
                <input
                  type="number"
                  value={product.inventory_quantity ?? ''}
                  onChange={(e) => handleUnifiedChange('inventory_quantity', e.target.value ? parseInt(e.target.value) : null)}
                  className="input"
                  disabled={product.variants?.length > 0 || !product.inventory_tracking}
                  placeholder={product.variants?.length > 0 ? 'See variants below' : 'Enter quantity'}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-8">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={product.inventory_tracking}
                  onChange={(e) => handleUnifiedChange('inventory_tracking', e.target.checked)}
                />
                <span className="text-sm font-medium">Track Inventory</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={product.allow_backorder}
                  onChange={(e) => handleUnifiedChange('allow_backorder', e.target.checked)}
                />
                <span className="text-sm font-medium">Allow Backorder</span>
              </label>
            </div>
          </div>

          {product.template_id && (
            <div className="card p-6">
              <h2 className="mt-0 mb-6 text-lg">Product Details</h2>

              {getMergedFields().map((field) => (
                <div key={field.name} className="mb-6 last:mb-0">
                  <div className="flex items-center gap-2 mb-2">
                    {field.type === 'checkbox' ? (
                      <>
                        {renderField(field)}
                        <label className="font-medium m-0">
                          {field.label}
                          {field.required && <span className="text-red-500"> *</span>}
                        </label>
                      </>
                    ) : (
                      <label className="block font-medium text-gray-700">
                        {field.label}
                        {field.required && <span className="text-red-500"> *</span>}
                      </label>
                    )}
                  </div>
                  {field.type !== 'checkbox' && renderField(field)}
                </div>
              ))}
            </div>
          )}

          {/* Options & Variants Section */}
          {product.template_id && (
            <div className="card p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="m-0 text-lg">Options & Variants</h2>
                {options.length < 3 && (
                  <button
                    type="button"
                    onClick={addOption}
                    className="btn btn-secondary text-sm"
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Option
                  </button>
                )}
              </div>

              {options.length === 0 && (
                <p className="text-gray-500 m-0">
                  No options defined. Add options like Color or Size to create product variants.
                </p>
              )}

              {options.map((option, optIndex) => (
                <div key={optIndex} className="border border-gray-200 rounded-md p-4 mb-4">
                  <div className="flex gap-3 items-center mb-3">
                    <input
                      type="text"
                      value={option.name}
                      onChange={(e) => updateOptionName(optIndex, e.target.value)}
                      placeholder="Option name (e.g. Color, Size)"
                      className="input flex-1 font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => removeOption(optIndex)}
                      className="p-1 text-red-500 hover:text-red-700"
                      title="Remove option"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {option.values.map((val, valIndex) => (
                      <span
                        key={valIndex}
                        className="inline-flex items-center gap-1 bg-gray-100 border border-gray-200 rounded px-2 py-1 text-sm"
                      >
                        {val}
                        <button
                          type="button"
                          onClick={() => removeOptionValue(optIndex, valIndex)}
                          className="text-gray-400 hover:text-gray-600 p-0 leading-none"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Type a value and press Enter"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addOptionValue(optIndex, e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="input text-sm"
                  />
                </div>
              ))}

              {/* Variant Table */}
              {product.variants && product.variants.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-base mb-4">
                    Variants ({product.variants.length})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b-2 border-gray-200">
                          <th className="text-left p-2 font-semibold">Variant</th>
                          <th className="text-left p-2 font-semibold">SKU</th>
                          <th className="text-left p-2 font-semibold">Price</th>
                          <th className="text-left p-2 font-semibold">Inventory</th>
                          <th className="text-left p-2 font-semibold">Image</th>
                        </tr>
                      </thead>
                      <tbody>
                        {product.variants.map((variant, vIndex) => (
                          <tr key={vIndex} className="border-b border-gray-100">
                            <td className="p-2 font-medium">{variant.title}</td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={variant.sku || ''}
                                onChange={(e) => handleVariantChange(vIndex, 'sku', e.target.value)}
                                placeholder={product.sku ? `${product.sku}-${vIndex + 1}` : ''}
                                className="input py-1 text-sm"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                step="0.01"
                                value={variant.price ?? ''}
                                onChange={(e) => handleVariantChange(vIndex, 'price', e.target.value ? parseFloat(e.target.value) : null)}
                                placeholder={product.price?.toString() || '0'}
                                className="input w-[100px] py-1 text-sm"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                value={variant.inventory_quantity ?? 0}
                                onChange={(e) => handleVariantChange(vIndex, 'inventory_quantity', parseInt(e.target.value) || 0)}
                                className="input w-[80px] py-1 text-sm"
                              />
                            </td>
                            <td className="p-2">
                              <div className="flex items-center gap-2">
                                {variant.image && (
                                  <img src={variant.image} alt="" className="w-8 h-8 object-cover rounded border border-gray-300" />
                                )}
                                <button
                                  type="button"
                                  onClick={() => openMediaPicker(`variant.${vIndex}`)}
                                  className="border border-gray-300 rounded p-1 flex items-center hover:bg-gray-50"
                                  title="Select image"
                                >
                                  <ImageIcon className="w-4 h-4 text-gray-500" />
                                </button>
                                {variant.image && (
                                  <button
                                    type="button"
                                    onClick={() => handleVariantChange(vIndex, 'image', null)}
                                    className="text-gray-400 hover:text-gray-600 p-0"
                                    title="Remove image"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Status & Template */}
          <div className="card p-6 space-y-4">
            <div>
              <label className="label">Status</label>
              <select
                value={product.status || 'draft'}
                onChange={(e) => handleUnifiedChange('status', e.target.value)}
                className="input"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="label">Product Template *</label>
              <select
                value={product.template_id || ''}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="input"
              >
                <option value="">Select template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Access Control */}
          <div className="card p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2 text-base">
              <Lock className="w-4 h-4" />
              Access Control
            </h2>
            <div className="space-y-4">
              <div>
                <label className="label text-sm">Authentication</label>
                <select
                  value={product.access_rules?.auth || 'any'}
                  onChange={(e) => setProduct(p => ({ 
                    ...p, 
                    access_rules: { ...p.access_rules, auth: e.target.value } 
                  }))}
                  className="input"
                >
                  <option value="any">Everyone</option>
                  <option value="logged_in">Logged In Only</option>
                  <option value="logged_out">Logged Out Only</option>
                </select>
              </div>
              <div>
                <label className="label text-sm">Subscription</label>
                <select
                  value={product.access_rules?.subscription || 'any'}
                  onChange={(e) => setProduct(p => ({ 
                    ...p, 
                    access_rules: { ...p.access_rules, subscription: e.target.value, plans: e.target.value === 'any' ? [] : (p.access_rules.plans || []) } 
                  }))}
                  className="input"
                >
                  <option value="any">No Subscription Required</option>
                  <option value="required">Active Subscription Required</option>
                </select>
              </div>

              {product.access_rules?.subscription === 'required' && (
                <div className="space-y-2">
                  <label className="label text-xs">Required Tiers (Optional)</label>
                  <div className="space-y-1 max-h-32 overflow-y-auto p-2 border border-gray-200 rounded-md">
                    {subscriptionPlans.length === 0 ? (
                      <p className="text-xs text-gray-500 italic">No plans defined</p>
                    ) : (
                      subscriptionPlans.map(plan => (
                        <label key={plan.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={(product.access_rules?.plans || []).includes(plan.slug)}
                            onChange={(e) => {
                              const currentPlans = product.access_rules?.plans || [];
                              const newPlans = e.target.checked
                                ? [...currentPlans, plan.slug]
                                : currentPlans.filter(s => s !== plan.slug);
                              setProduct(p => ({
                                ...p,
                                access_rules: { ...p.access_rules, plans: newPlans }
                              }));
                            }}
                          />
                          {plan.name}
                        </label>
                      ))
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500">If no tiers are selected, any active subscription will grant access.</p>
                </div>
              )}

              {product.access_rules?.subscription === 'required' && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                  <p className="flex items-start gap-2">
                    <Shield className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    Users without an active subscription will be redirected to the pricing page.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Groups Widget */}
      {product.content_id && (
        <div className="mt-8">
          <ContentGroupsWidget contentId={product.content_id} />
        </div>
      )}

      {mediaPickerOpen && (
        <MediaPicker
          onSelect={handleMediaSelect}
          onClose={() => setMediaPickerOpen(false)}
        />
      )}
    </div>
  );
}
