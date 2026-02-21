(function() {
    let hoveredElement = null;
    let ui = null;
    let currentFields = [
        { id: 'title', label: 'Set as Title' },
        { id: 'description', label: 'Set as Description' },
        { id: 'price', label: 'Set as Price' },
        { id: 'sku', label: 'Set as SKU' },
        { id: 'images', label: 'Set as Image Area' }
    ];

    // 1. Create UI
    function createUI() {
        if (ui) ui.remove();
        ui = document.createElement('div');
        ui.id = 'wolfwave-picker-ui';
        
        let fieldsHtml = currentFields.map(f => `
            <button class="wolfwave-picker-btn" data-field="${f.id}">${f.label}</button>
        `).join('');

        ui.innerHTML = `
            <div class="wolfwave-picker-label">Visual Selector Picker</div>
            <div id="wolfwave-current-selector" style="font-size: 10px; color: #9ca3af; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Hover an element...</div>
            <div id="wolfwave-fields-container" style="max-height: 300px; overflow-y: auto;">
                ${fieldsHtml}
            </div>
            <hr style="margin: 8px 0; border: none; border-top: 1px solid #f3f4f6;">
            <button id="wolfwave-picker-close" style="width: 100%; padding: 4px; font-size: 10px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">Close & Save</button>
        `;
        document.body.appendChild(ui);

        ui.querySelectorAll('.wolfwave-picker-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                if (!hoveredElement) return;
                const field = btn.getAttribute('data-field');
                const selector = getBestSelector(hoveredElement);
                
                // Send to parent window (WolfWave Admin)
                window.parent.postMessage({
                    type: 'WOLFWAVE_SELECTOR_PICKED',
                    field: field,
                    selector: selector
                }, '*');

                btn.style.background = '#10b981';
                setTimeout(() => btn.style.background = '#3b82f6', 1000);
            };
        });

        document.getElementById('wolfwave-picker-close').onclick = () => {
            window.parent.postMessage({ type: 'WOLFWAVE_PICKER_DONE' }, '*');
        };
    }

    // 2. Intelligent Selector Generation
    function getBestSelector(el) {
        if (el.id) return `#${el.id}`;
        
        let selector = el.tagName.toLowerCase();
        if (el.className) {
            const classes = Array.from(el.classList)
                .filter(c => !c.startsWith('wolfwave-'))
                .join('.');
            if (classes) selector += `.${classes}`;
        }

        // If not unique enough, get path
        const parent = el.parentElement;
        if (parent && parent.tagName !== 'BODY') {
            const siblings = Array.from(parent.children);
            if (siblings.length > 1) {
                const index = siblings.indexOf(el) + 1;
                selector += `:nth-child(${index})`;
            }
        }
        return selector;
    }

    // 3. Events
    document.addEventListener('mouseover', (e) => {
        if (ui && ui.contains(e.target)) return;
        
        if (hoveredElement) hoveredElement.classList.remove('wolfwave-picker-highlight');
        hoveredElement = e.target;
        hoveredElement.classList.add('wolfwave-picker-highlight');
        
        const selectorDisplay = document.getElementById('wolfwave-current-selector');
        if (selectorDisplay) selectorDisplay.innerText = getBestSelector(hoveredElement);
    }, true);

    document.addEventListener('click', (e) => {
        if (ui && ui.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
    }, true);

    // 4. Message Listener for Dynamic Fields
    window.addEventListener('message', (e) => {
        if (e.data.type === 'WOLFWAVE_SET_FIELDS') {
            currentFields = e.data.fields;
            createUI();
        }
    });

    // Initialize
    if (document.readyState === 'complete') createUI();
    else window.addEventListener('load', createUI);

})();

