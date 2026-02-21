(function () {
  'use strict';

  var body = document.body;
  var pageId = body.getAttribute('data-page-id');
  var templateId = body.getAttribute('data-template-id');
  var contentType = body.getAttribute('data-content-type') || 'pages';

  // Only activate for admin-rendered pages
  if (!pageId) return;

  var editableElements = document.querySelectorAll('[data-cms-region], [data-cms-option]');
  if (!editableElements.length) return;

  var activeEditor = null; // currently editing element
  var toolbar = null;
  var saving = false;

  // Known product table columns that should automatically overlap with CMS regions
  var PRODUCT_FIELDS = [
    'title', 'slug', 'sku', 'price', 'compare_at_price', 'status',
    'inventory_quantity', 'inventory_tracking', 'allow_backorder',
    'weight', 'weight_unit', 'requires_shipping', 'taxable', 'og_image'
  ];

  // ── Pencil icon SVG ──
  var pencilSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';

  // ── Toast ──
  function showToast(message, type) {
    var existing = document.querySelector('.cms-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'cms-toast cms-toast-' + (type || 'success');
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(function () {
      toast.classList.add('cms-toast-hide');
      setTimeout(function () { toast.remove(); }, 300);
    }, 2500);
  }

  // ── Saving indicator ──
  function showSaving() {
    var el = document.createElement('div');
    el.className = 'cms-saving';
    el.textContent = 'Saving…';
    document.body.appendChild(el);
    return el;
  }

  // ── Save region to API ──
  function saveContent(regionName, value, callback, isTopLevel, isOverlap) {
    if (saving) return;

    // Auto-detect overlap for products
    if (contentType === 'products' && PRODUCT_FIELDS.indexOf(regionName) !== -1) {
      isOverlap = true;
    }

    saving = true;
    var indicator = showSaving();

    // Top-level fields (e.g. title, og_image) go directly on the body,
    // content fields go nested inside { content: { ... } }
    // Overlap fields go to BOTH.
    var payload = {};
    if (isOverlap) {
      payload[regionName] = value;
      var contentPatch = {};
      contentPatch[regionName] = value;
      payload.content = contentPatch;
    } else if (isTopLevel) {
      payload[regionName] = value;
    } else {
      var contentPatch = {};
      contentPatch[regionName] = value;
      payload.content = contentPatch;
    }

    fetch('/api/' + contentType + '/' + pageId, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Save failed (' + res.status + ')');
        return res.json();
      })
      .then(function () {
        indicator.remove();
        saving = false;
        showToast('Saved');
        if (callback) callback(null);
      })
      .catch(function (err) {
        indicator.remove();
        saving = false;
        showToast(err.message || 'Save failed', 'error');
        if (callback) callback(err);
      });
  }

  function saveOption(optionName, value, callback) {
    if (saving) return;
    if (!templateId) {
      showToast('Template ID missing, cannot save option', 'error');
      return;
    }
    saving = true;
    var indicator = showSaving();

    var optionsPatch = {};
    optionsPatch[optionName] = value;
    var payload = { options: optionsPatch };

    fetch('/api/templates/' + templateId, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Save failed (' + res.status + ')');
        return res.json();
      })
      .then(function () {
        indicator.remove();
        saving = false;
        showToast('Template Option Saved');
        if (callback) callback(null);
      })
      .catch(function (err) {
        indicator.remove();
        saving = false;
        showToast(err.message || 'Save failed', 'error');
        if (callback) callback(err);
      });
  }

  // ── Hover badge ──
  function addBadge(el, isOption) {
    var label = el.getAttribute('data-cms-label') || 
                el.getAttribute(isOption ? 'data-cms-option' : 'data-cms-region');
    var badge = document.createElement('div');
    badge.className = 'cms-edit-badge';
    badge.innerHTML = pencilSvg + ' ' + label;
    el.__cmsBadge = badge;
    return badge;
  }

  function removeBadge(el) {
    if (el.__cmsBadge) {
      el.__cmsBadge.remove();
      el.__cmsBadge = null;
    }
  }

  // ── Init all editable elements ──
  editableElements.forEach(function (el) {
    var isOption = el.hasAttribute('data-cms-option');
    var type = el.getAttribute(isOption ? 'data-cms-option-type' : 'data-cms-type') || 'text';

    el.addEventListener('mouseenter', function () {
      if (activeEditor === el) return;
      el.classList.add('cms-region-hover');
      var badge = addBadge(el, isOption);
      el.appendChild(badge);
    });

    el.addEventListener('mouseleave', function () {
      if (activeEditor === el) return;
      el.classList.remove('cms-region-hover');
      removeBadge(el);
    });

    el.addEventListener('click', function (e) {
      if (activeEditor === el) return;

      // Don't intercept clicks on links inside regions unless we're initiating edit
      if (e.target.closest('a') && type !== 'image' && type !== 'color') {
        // Let link clicks through when not editing
        if (activeEditor !== el) {
          e.preventDefault();
        }
      }

      e.stopPropagation();
      el.classList.remove('cms-region-hover');

      if (type === 'text' || type === 'textarea') {
        editText(el, isOption);
      } else if (type === 'richtext') {
        editRichText(el, isOption);
      } else if (type === 'image') {
        e.preventDefault();
        editImage(el, isOption);
      } else if (type === 'color') {
        e.preventDefault();
        editColor(el, isOption);
      } else if (type === 'repeater') {
        editRepeater(el);
      } else if (type === 'product-form') {
        editProductForm(el);
      }
    });
  });

  // ── Text editing ──
  function editText(el, isOption) {
    if (activeEditor) finishEdit(activeEditor);
    activeEditor = el;
    removeBadge(el);
    el.classList.add('cms-editing');
    el.setAttribute('contenteditable', 'true');
    el.focus();

    // Select all text for easy replacement
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    function done() {
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('keydown', onKey);
      finishTextEdit(el, isOption);
    }

    function onBlur() {
      // Small delay so clicking toolbar doesn't trigger save
      setTimeout(function () {
        if (activeEditor === el) done();
      }, 150);
    }

    function onKey(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        done();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        // Revert? For now just finish without save
        el.removeEventListener('blur', onBlur);
        el.removeEventListener('keydown', onKey);
        el.setAttribute('contenteditable', 'false');
        el.classList.remove('cms-editing');
        activeEditor = null;
      }
    }

    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKey);
  }

  function finishTextEdit(el, isOption) {
    var regionName = el.getAttribute(isOption ? 'data-cms-option' : 'data-cms-region');
    var isTopLevel = el.getAttribute('data-cms-field') === 'top';
    var isOverlap = el.getAttribute('data-cms-overlap') === 'true';
    var value = el.textContent.trim();
    el.setAttribute('contenteditable', 'false');
    el.classList.remove('cms-editing');
    activeEditor = null;
    
    if (isOption) {
      saveOption(regionName, value);
    } else {
      saveContent(regionName, value, null, isTopLevel, isOverlap);
    }
  }

  // ── Rich text editing ──
  function editRichText(el, isOption) {
    if (activeEditor) finishEdit(activeEditor);
    activeEditor = el;
    removeBadge(el);
    el.classList.add('cms-editing');
    el.setAttribute('contenteditable', 'true');
    el.focus();

    showToolbar(el);

    function onBlur() {
      setTimeout(function () {
        // Don't close if clicking the toolbar
        if (document.activeElement && toolbar && toolbar.contains(document.activeElement)) return;
        if (activeEditor === el) finishRichTextEdit(el, isOption);
      }, 200);
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        el.removeEventListener('blur', onBlur);
        el.removeEventListener('keydown', onKey);
        el.setAttribute('contenteditable', 'false');
        el.classList.remove('cms-editing');
        hideToolbar();
        activeEditor = null;
      }
    }

    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKey);
    el.__cmsBlur = onBlur;
    el.__cmsKey = onKey;
  }

  function finishRichTextEdit(el, isOption) {
    var regionName = el.getAttribute(isOption ? 'data-cms-option' : 'data-cms-region');
    var isTopLevel = el.getAttribute('data-cms-field') === 'top';
    var isOverlap = el.getAttribute('data-cms-overlap') === 'true';
    var value = el.innerHTML;
    el.setAttribute('contenteditable', 'false');
    el.classList.remove('cms-editing');
    if (el.__cmsBlur) el.removeEventListener('blur', el.__cmsBlur);
    if (el.__cmsKey) el.removeEventListener('keydown', el.__cmsKey);
    hideToolbar();
    activeEditor = null;
    
    if (isOption) {
      saveOption(regionName, value);
    } else {
      saveContent(regionName, value, null, isTopLevel, isOverlap);
    }
  }

  // ── Color editing ──
  function editColor(el, isOption) {
    var optionName = el.getAttribute('data-cms-option');
    var currentColor = el.getAttribute('data-cms-value') || '#000000';
    
    var picker = document.createElement('input');
    picker.type = 'color';
    picker.value = currentColor;
    picker.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
    document.body.appendChild(picker);
    
    picker.onchange = function() {
      var newVal = picker.value;
      // Apply locally for instant feedback
      document.documentElement.style.setProperty('--cms-option-' + optionName, newVal);
      el.setAttribute('data-cms-value', newVal);
      
      if (isOption) {
        saveOption(optionName, newVal);
      }
      picker.remove();
    };
    
    picker.onblur = function() {
      setTimeout(function() { picker.remove(); }, 100);
    };
    
    picker.click();
  }

  // ── Formatting toolbar ──
  function showToolbar(el) {
    hideToolbar();
    toolbar = document.createElement('div');
    toolbar.className = 'cms-richtext-toolbar';

    var buttons = [
      { label: 'B', cmd: 'bold', style: 'font-weight:700' },
      { label: 'I', cmd: 'italic', style: 'font-style:italic' },
      { sep: true },
      { label: 'H2', cmd: 'formatBlock', val: 'H2' },
      { label: 'H3', cmd: 'formatBlock', val: 'H3' },
      { label: 'P', cmd: 'formatBlock', val: 'P' },
      { sep: true },
      { label: 'UL', cmd: 'insertUnorderedList' },
      { label: 'OL', cmd: 'insertOrderedList' },
      { sep: true },
      { label: '🔗', cmd: 'createLink' }
    ];

    buttons.forEach(function (b) {
      if (b.sep) {
        var sep = document.createElement('div');
        sep.className = 'cms-toolbar-sep';
        toolbar.appendChild(sep);
        return;
      }

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = b.label;
      if (b.style) btn.setAttribute('style', b.style);
      btn.title = b.cmd;

      btn.addEventListener('mousedown', function (e) {
        e.preventDefault(); // keep focus on contenteditable
        if (b.cmd === 'createLink') {
          var url = prompt('Enter URL:');
          if (url) document.execCommand('createLink', false, url);
        } else if (b.val) {
          document.execCommand(b.cmd, false, b.val);
        } else {
          document.execCommand(b.cmd, false, null);
        }
      });

      toolbar.appendChild(btn);
    });

    document.body.appendChild(toolbar);
    positionToolbar(el);
  }

  function positionToolbar(el) {
    if (!toolbar) return;
    var rect = el.getBoundingClientRect();
    toolbar.style.left = Math.max(8, rect.left) + 'px';
    toolbar.style.top = Math.max(8, rect.top - 44) + 'px';
  }

  function hideToolbar() {
    if (toolbar) {
      toolbar.remove();
      toolbar = null;
    }
  }

  // ── Generic finish edit ──
  function finishEdit(el) {
    if (!el) return;
    var isOption = el.hasAttribute('data-cms-option');
    var type = el.getAttribute(isOption ? 'data-cms-option-type' : 'data-cms-type') || 'text';
    if (type === 'richtext') {
      finishRichTextEdit(el, isOption);
    } else {
      finishTextEdit(el, isOption);
    }
  }

  // ── Image editing (media picker modal) ──
  function editImage(el, isOption) {
    var regionName = el.getAttribute(isOption ? 'data-cms-option' : 'data-cms-region');
    showMediaPicker(function (url) {
      applyImageSelection(el, regionName, url, isOption);
    });
  }

  function showMediaPicker(onSelect) {
    var overlay = document.createElement('div');
    overlay.className = 'cms-modal-overlay';

    var modal = document.createElement('div');
    modal.className = 'cms-modal';

    // Header
    var header = document.createElement('div');
    header.className = 'cms-modal-header';
    header.innerHTML = '<h3>Select Image</h3>';
    var closeBtn = document.createElement('button');
    closeBtn.className = 'cms-modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = function () { overlay.remove(); };
    header.appendChild(closeBtn);

    // Body
    var modalBody = document.createElement('div');
    modalBody.className = 'cms-modal-body';
    modalBody.innerHTML = '<p style="color:#6b7280;font-size:14px;">Loading media…</p>';

    // Footer
    var footer = document.createElement('div');
    footer.className = 'cms-modal-footer';
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'cms-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = function () { overlay.remove(); };
    var selectBtn = document.createElement('button');
    selectBtn.className = 'cms-btn cms-btn-primary';
    selectBtn.textContent = 'Select';
    selectBtn.disabled = true;
    footer.appendChild(cancelBtn);
    footer.appendChild(selectBtn);

    modal.appendChild(header);
    modal.appendChild(modalBody);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });

    var selectedUrl = null;

    // Load media
    fetch('/api/media', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var items = data.data || data || [];
        var grid = document.createElement('div');
        grid.className = 'cms-media-grid';

        // Upload button
        var uploadCard = document.createElement('div');
        uploadCard.className = 'cms-media-upload';
        uploadCard.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Upload';
        uploadCard.onclick = function () {
          var input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = function () {
            if (!input.files[0]) return;
            var fd = new FormData();
            fd.append('file', input.files[0]);
            fetch('/api/media', {
              method: 'POST',
              credentials: 'include',
              body: fd
            })
              .then(function (r) { return r.json(); })
              .then(function (res) {
                var url = res.data ? res.data.url : res.url;
                if (url) {
                  onSelect(url);
                  overlay.remove();
                }
              })
              .catch(function () { showToast('Upload failed', 'error'); });
          };
          input.click();
        };
        grid.appendChild(uploadCard);

        items.forEach(function (item) {
          var url = item.url || item.path || ('/uploads/' + item.filename);
          var card = document.createElement('div');
          card.className = 'cms-media-item';
          var img = document.createElement('img');
          img.src = url;
          img.alt = item.alt_text || item.filename || '';
          img.loading = 'lazy';
          card.appendChild(img);

          card.addEventListener('click', function () {
            grid.querySelectorAll('.cms-media-item').forEach(function (c) {
              c.classList.remove('selected');
            });
            card.classList.add('selected');
            selectedUrl = url;
            selectBtn.disabled = false;
          });

          grid.appendChild(card);
        });

        modalBody.innerHTML = '';
        modalBody.appendChild(grid);
      })
      .catch(function () {
        modalBody.innerHTML = '<p style="color:#dc2626;font-size:14px;">Failed to load media.</p>';
      });

    selectBtn.addEventListener('click', function () {
      if (selectedUrl) {
        onSelect(selectedUrl);
        overlay.remove();
      }
    });
  }

  function applyImageSelection(el, regionName, url, isOption) {
    var isTopLevel = el.getAttribute('data-cms-field') === 'top';
    var isOverlap = el.getAttribute('data-cms-overlap') === 'true';
    // If the element is an <img>, update src; otherwise update background or inner img
    var img = el.tagName === 'IMG' ? el : el.querySelector('img');
    if (img) {
      img.src = url;
    } else {
      // No img tag yet — create one (e.g. replacing a placeholder)
      var placeholder = el.querySelector('.placeholder');
      if (placeholder) placeholder.remove();
      var newImg = document.createElement('img');
      newImg.src = url;
      newImg.alt = '';
      el.appendChild(newImg);
    }
    
    if (isOption) {
      saveOption(regionName, url);
    } else {
      saveContent(regionName, url, null, isTopLevel, isOverlap);
    }
  }

  // ── Repeater editing ──
  function editRepeater(el) {
    var regionName = el.getAttribute('data-cms-region');
    var fieldsJson = el.getAttribute('data-cms-fields');
    var fields = [];
    try { fields = JSON.parse(fieldsJson); } catch (e) { /* empty */ }

    if (!fields.length) {
      showToast('No field definitions found for this repeater', 'error');
      return;
    }

    // Parse current items from the rendered DOM
    var items = parseRepeaterItems(el, fields);

    // Create overlay + panel
    var overlay = document.createElement('div');
    overlay.className = 'cms-modal-overlay';
    overlay.style.justifyContent = 'flex-end';
    overlay.style.background = 'rgba(0,0,0,0.3)';

    var panel = document.createElement('div');
    panel.className = 'cms-repeater-panel';

    // Header
    var headerEl = document.createElement('div');
    headerEl.className = 'cms-repeater-panel-header';
    var label = el.getAttribute('data-cms-label') || regionName;
    headerEl.innerHTML = '<h3>Edit ' + label + '</h3>';
    var closeBtn = document.createElement('button');
    closeBtn.className = 'cms-modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = function () { overlay.remove(); };
    headerEl.appendChild(closeBtn);

    // Body
    var bodyEl = document.createElement('div');
    bodyEl.className = 'cms-repeater-panel-body';

    // Footer
    var footerEl = document.createElement('div');
    footerEl.className = 'cms-repeater-panel-footer';

    var addBtn = document.createElement('button');
    addBtn.className = 'cms-btn';
    addBtn.textContent = '+ Add Item';
    addBtn.onclick = function () {
      var newItem = {};
      fields.forEach(function (f) { newItem[f.name] = ''; });
      items.push(newItem);
      renderItems();
    };

    var saveBtn = document.createElement('button');
    saveBtn.className = 'cms-btn cms-btn-primary';
    saveBtn.textContent = 'Save';
    saveBtn.onclick = function () {
      // Read current values from inputs
      collectItemValues();
      saveContent(regionName, items, function (err) {
        if (!err) {
          overlay.remove();
          // Reload page to see updated repeater HTML
          window.location.reload();
        }
      });
    };

    footerEl.appendChild(addBtn);
    footerEl.appendChild(saveBtn);

    panel.appendChild(headerEl);
    panel.appendChild(bodyEl);
    panel.appendChild(footerEl);
    overlay.appendChild(panel);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);

    function collectItemValues() {
      var cards = bodyEl.querySelectorAll('.cms-repeater-item');
      items = [];
      cards.forEach(function (card) {
        var item = {};
        fields.forEach(function (f) {
          var input = card.querySelector('[data-field="' + f.name + '"]');
          if (input) item[f.name] = input.value;
        });
        items.push(item);
      });
    }

    function renderItems() {
      bodyEl.innerHTML = '';
      items.forEach(function (item, idx) {
        var card = document.createElement('div');
        card.className = 'cms-repeater-item';

        // Item header with index and action buttons
        var itemHeader = document.createElement('div');
        itemHeader.className = 'cms-repeater-item-header';
        itemHeader.innerHTML = '<span>Item ' + (idx + 1) + '</span>';

        var actions = document.createElement('div');
        actions.className = 'cms-repeater-item-actions';

        if (idx > 0) {
          var upBtn = document.createElement('button');
          upBtn.innerHTML = '&#9650;';
          upBtn.title = 'Move up';
          upBtn.onclick = function () {
            collectItemValues();
            var tmp = items[idx];
            items[idx] = items[idx - 1];
            items[idx - 1] = tmp;
            renderItems();
          };
          actions.appendChild(upBtn);
        }

        if (idx < items.length - 1) {
          var downBtn = document.createElement('button');
          downBtn.innerHTML = '&#9660;';
          downBtn.title = 'Move down';
          downBtn.onclick = function () {
            collectItemValues();
            var tmp = items[idx];
            items[idx] = items[idx + 1];
            items[idx + 1] = tmp;
            renderItems();
          };
          actions.appendChild(downBtn);
        }

        var delBtn = document.createElement('button');
        delBtn.innerHTML = '&#10005;';
        delBtn.title = 'Remove';
        delBtn.style.color = '#ef4444';
        delBtn.onclick = function () {
          collectItemValues();
          items.splice(idx, 1);
          renderItems();
        };
        actions.appendChild(delBtn);

        itemHeader.appendChild(actions);
        card.appendChild(itemHeader);

        // Render each field
        fields.forEach(function (f) {
          var fieldDiv = document.createElement('div');
          fieldDiv.className = 'cms-repeater-field';

          var lbl = document.createElement('label');
          lbl.textContent = f.label || f.name;
          fieldDiv.appendChild(lbl);

          var val = item[f.name] || '';

          if (f.type === 'textarea') {
            var ta = document.createElement('textarea');
            ta.value = val;
            ta.setAttribute('data-field', f.name);
            fieldDiv.appendChild(ta);
          } else if (f.type === 'image') {
            var group = document.createElement('div');
            group.style.display = 'flex';
            group.style.gap = '8px';

            var inp = document.createElement('input');
            inp.type = 'text';
            inp.value = val;
            inp.setAttribute('data-field', f.name);
            inp.style.flex = '1';

            var btn = document.createElement('button');
            btn.className = 'cms-btn';
            btn.textContent = 'Browse';
            btn.onclick = function () {
              showMediaPicker(function (url) {
                inp.value = url;
              });
            };

            group.appendChild(inp);
            group.appendChild(btn);
            fieldDiv.appendChild(group);
          } else {
            var inp = document.createElement('input');
            inp.type = f.type || 'text';
            inp.value = val;
            inp.setAttribute('data-field', f.name);
            fieldDiv.appendChild(inp);
          }

          card.appendChild(fieldDiv);
        });

        bodyEl.appendChild(card);
      });

      if (!items.length) {
        bodyEl.innerHTML = '<p style="color:#6b7280;font-size:14px;text-align:center;padding:2rem 0;">No items yet. Click "+ Add Item" to add one.</p>';
      }
    }

    renderItems();
  }

  // Try to parse repeater items from rendered DOM children
  function parseRepeaterItems(el, fields) {
    var children = el.children;
    var items = [];
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      var item = {};
      fields.forEach(function (f) {
        // Try to find text content matching each field
        if (f.type === 'text' || f.type === 'textarea') {
          // Look for common patterns: h3 for title, p for description, etc.
          if (f.name === 'title') {
            var heading = child.querySelector('h1,h2,h3,h4,h5,h6');
            item[f.name] = heading ? heading.textContent.trim() : '';
          } else if (f.name === 'description') {
            var p = child.querySelector('p');
            item[f.name] = p ? p.textContent.trim() : '';
          } else if (f.name === 'icon') {
            var iconEl = child.querySelector('.feature-icon');
            item[f.name] = iconEl ? iconEl.textContent.trim() : '';
          } else {
            // Generic: grab all text
            item[f.name] = '';
          }
        }
      });
      items.push(item);
    }
    return items;
  }

  // ── Product details form (slide-in panel) ──
  function editProductForm(el) {
    var valuesJson = el.getAttribute('data-cms-values');
    var values = {};
    try { values = JSON.parse(valuesJson); } catch (e) { /* empty */ }

    // Field definitions for the product form
    var fields = [
      { name: 'og_image', label: 'Product Image', type: 'image' },
      { name: 'image', label: 'Alternative Image', type: 'image' },
      { name: 'price', label: 'Price', type: 'number', step: '0.01' },
      { name: 'compare_at_price', label: 'Compare at Price', type: 'number', step: '0.01' },
      { name: 'sku', label: 'SKU', type: 'text' },
      { section: 'Inventory' },
      { name: 'inventory_quantity', label: 'Quantity', type: 'number', step: '1' },
      { name: 'inventory_tracking', label: 'Track Inventory', type: 'checkbox' },
      { name: 'allow_backorder', label: 'Allow Backorder', type: 'checkbox' },
      { section: 'Shipping' },
      { name: 'weight', label: 'Weight', type: 'number', step: '0.01' },
      { name: 'weight_unit', label: 'Weight Unit', type: 'select', options: ['lb', 'oz', 'kg', 'g'] },
      { name: 'requires_shipping', label: 'Requires Shipping', type: 'checkbox' },
      { section: 'Other' },
      { name: 'taxable', label: 'Taxable', type: 'checkbox' },
      { name: 'status', label: 'Status', type: 'select', options: ['active', 'draft', 'archived'] }
    ];

    // Create overlay + panel
    var overlay = document.createElement('div');
    overlay.className = 'cms-modal-overlay';
    overlay.style.justifyContent = 'flex-end';
    overlay.style.background = 'rgba(0,0,0,0.3)';

    var panel = document.createElement('div');
    panel.className = 'cms-repeater-panel';

    // Header
    var headerEl = document.createElement('div');
    headerEl.className = 'cms-repeater-panel-header';
    headerEl.innerHTML = '<h3>Product Details</h3>';
    var closeBtn = document.createElement('button');
    closeBtn.className = 'cms-modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = function () { overlay.remove(); };
    headerEl.appendChild(closeBtn);

    // Body
    var bodyEl = document.createElement('div');
    bodyEl.className = 'cms-repeater-panel-body';

    fields.forEach(function (f) {
      if (f.section) {
        var sec = document.createElement('div');
        sec.style.cssText = 'font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin:16px 0 8px;padding-top:12px;border-top:1px solid #e5e7eb';
        if (f === fields[0] || (fields.indexOf(f) > 0 && !fields[fields.indexOf(f) - 1].section)) {
          // first section or after fields
        }
        sec.textContent = f.section;
        bodyEl.appendChild(sec);
        return;
      }

      var fieldDiv = document.createElement('div');
      fieldDiv.className = 'cms-repeater-field';

      var lbl = document.createElement('label');
      lbl.textContent = f.label;

      if (f.type === 'checkbox') {
        // Checkbox: label wraps the input
        lbl.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;color:#374151;cursor:pointer';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!values[f.name];
        cb.setAttribute('data-field', f.name);
        cb.style.cssText = 'width:16px;height:16px;cursor:pointer';
        lbl.prepend(cb);
        // Move label text after checkbox
        lbl.innerHTML = '';
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(' ' + f.label));
        fieldDiv.appendChild(lbl);
      } else if (f.type === 'select') {
        fieldDiv.appendChild(lbl);
        var sel = document.createElement('select');
        sel.setAttribute('data-field', f.name);
        sel.style.cssText = 'width:100%;padding:6px 10px;font-size:13px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit;background:#fff';
        f.options.forEach(function (opt) {
          var option = document.createElement('option');
          option.value = opt;
          option.textContent = opt;
          if (String(values[f.name]) === opt) option.selected = true;
          sel.appendChild(option);
        });
        fieldDiv.appendChild(sel);
      } else if (f.type === 'image') {
        fieldDiv.appendChild(lbl);
        var group = document.createElement('div');
        group.style.display = 'flex';
        group.style.gap = '8px';

        var inp = document.createElement('input');
        inp.type = 'text';
        inp.value = values[f.name] != null ? values[f.name] : '';
        inp.setAttribute('data-field', f.name);
        inp.style.flex = '1';

        var btn = document.createElement('button');
        btn.className = 'cms-btn';
        btn.textContent = 'Browse';
        btn.onclick = function () {
          showMediaPicker(function (url) {
            inp.value = url;
          });
        };

        group.appendChild(inp);
        group.appendChild(btn);
        fieldDiv.appendChild(group);
      } else {
        fieldDiv.appendChild(lbl);
        var inp = document.createElement('input');
        inp.type = f.type || 'text';
        inp.value = values[f.name] != null ? values[f.name] : '';
        if (f.step) inp.step = f.step;
        inp.setAttribute('data-field', f.name);
        fieldDiv.appendChild(inp);
      }

      bodyEl.appendChild(fieldDiv);
    });

    // Footer
    var footerEl = document.createElement('div');
    footerEl.className = 'cms-repeater-panel-footer';

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'cms-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = function () { overlay.remove(); };

    var saveBtn = document.createElement('button');
    saveBtn.className = 'cms-btn cms-btn-primary';
    saveBtn.textContent = 'Save';
    saveBtn.onclick = function () {
      // Collect form values
      var payload = {};
      fields.forEach(function (f) {
        if (f.section) return;
        var input = bodyEl.querySelector('[data-field="' + f.name + '"]');
        if (!input) return;
        if (f.type === 'checkbox') {
          payload[f.name] = input.checked;
        } else if (f.type === 'number') {
          var v = input.value.trim();
          payload[f.name] = v === '' ? null : parseFloat(v);
        } else {
          payload[f.name] = input.value;
        }
      });

      // Save all fields as top-level — send directly to API
      if (saving) return;
      saving = true;
      var indicator = showSaving();

      fetch('/api/' + contentType + '/' + pageId, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Save failed (' + res.status + ')');
          return res.json();
        })
        .then(function () {
          indicator.remove();
          saving = false;
          showToast('Saved');
          overlay.remove();
          window.location.reload();
        })
        .catch(function (err) {
          indicator.remove();
          saving = false;
          showToast(err.message || 'Save failed', 'error');
        });
    };

    footerEl.appendChild(cancelBtn);
    footerEl.appendChild(saveBtn);

    panel.appendChild(headerEl);
    panel.appendChild(bodyEl);
    panel.appendChild(footerEl);
    overlay.appendChild(panel);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  // ── Scroll handler to reposition toolbar ──
  window.addEventListener('scroll', function () {
    if (toolbar && activeEditor) {
      positionToolbar(activeEditor);
    }
  }, { passive: true });

  // ── Click outside to finish editing ──
  document.addEventListener('click', function (e) {
    if (!activeEditor) return;
    if (activeEditor.contains(e.target)) return;
    if (toolbar && toolbar.contains(e.target)) return;
    finishEdit(activeEditor);
  });

  console.log('[WebWolf] Edit-in-place active for ' + editableElements.length + ' region(s)');
})();
