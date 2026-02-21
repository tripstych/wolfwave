(function() {
    let hoveredElement = null;
    let ui = null;

    // 1. Create UI
    function createUI() {
        ui = document.createElement('div');
        ui.id = 'webwolf-picker-ui';
        ui.innerHTML = `
            <div class="webwolf-picker-label">Visual Selector Picker</div>
            <div id="webwolf-current-selector" style="font-size: 10px; color: #9ca3af; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Hover an element...</div>
            <button class="webwolf-picker-btn" data-field="title">Set as Title</button>
            <button class="webwolf-picker-btn" data-field="description">Set as Description</button>
            <button class="webwolf-picker-btn" data-field="price">Set as Price</button>
            <button class="webwolf-picker-btn" data-field="sku">Set as SKU</button>
            <button class="webwolf-picker-btn" data-field="images">Set as Image Area</button>
            <hr style="margin: 8px 0; border: none; border-top: 1px solid #f3f4f6;">
            <button id="webwolf-picker-close" style="width: 100%; padding: 4px; font-size: 10px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">Close & Save</button>
        `;
        document.body.appendChild(ui);

        ui.querySelectorAll('.webwolf-picker-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                if (!hoveredElement) return;
                const field = btn.getAttribute('data-field');
                const selector = getBestSelector(hoveredElement);
                
                // Send to parent window (WebWolf Admin)
                window.parent.postMessage({
                    type: 'WEBWOLF_SELECTOR_PICKED',
                    field: field,
                    selector: selector
                }, '*');

                btn.style.background = '#10b981';
                setTimeout(() => btn.style.background = '#3b82f6', 1000);
            };
        });

        document.getElementById('webwolf-picker-close').onclick = () => {
            window.parent.postMessage({ type: 'WEBWOLF_PICKER_DONE' }, '*');
        };
    }

    // 2. Intelligent Selector Generation
    function getBestSelector(el) {
        if (el.id) return `#${el.id}`;
        
        let selector = el.tagName.toLowerCase();
        if (el.className) {
            const classes = Array.from(el.classList)
                .filter(c => !c.startsWith('webwolf-'))
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
        
        if (hoveredElement) hoveredElement.classList.remove('webwolf-picker-highlight');
        hoveredElement = e.target;
        hoveredElement.classList.add('webwolf-picker-highlight');
        
        const selectorDisplay = document.getElementById('webwolf-current-selector');
        if (selectorDisplay) selectorDisplay.innerText = getBestSelector(hoveredElement);
    }, true);

    document.addEventListener('click', (e) => {
        if (ui && ui.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
    }, true);

    // Initialize
    if (document.readyState === 'complete') createUI();
    else window.addEventListener('load', createUI);

})();
