# Console Monkey Patch

This system provides automatic logging for all `console.log`, `console.error`, and `console.warn` calls by patching them to use the proper logger system.

## 🎯 **Features**

- **Automatic Context**: Extracts file name from stack trace for better logging context
- **Object Serialization**: Automatically converts objects to JSON for readable logging
- **Development Feedback**: Still outputs to original console in development for immediate feedback
- **Environment Aware**: Can be disabled via environment variables
- **Restorable**: Provides `console.restoreOriginal()` to undo the patch

## 🔧 **Usage**

### Automatic Patching
The patch is applied automatically on server startup in `index.js`:

```javascript
import { maybePatchConsole } from './lib/consolePatch.js';

// Applied early for maximum coverage
maybePatchConsole();
```

### Environment Control

```bash
# Disable patching (useful for debugging)
DISABLE_CONSOLE_PATCH=true

# Test environment automatically skips patching
NODE_ENV=test
```

### Manual Control

```javascript
import { patchConsole } from './lib/consolePatch.js';

// Force patch
patchConsole();

// Restore original console
console.restoreOriginal();
```

## 📝 **What Gets Logged**

All console calls are transformed to use the logger system:

```javascript
// This:
console.log('User logged in:', { id: 123, name: 'John' });

// Becomes:
info(null, 'CONSOLE:filename', 'User logged in: {"id": 123, "name": "John"}');
```

## 🗂️ **Log Locations**

- **Development**: Console + `logs/system/access.log`
- **Production**: `logs/system/access.log` (info/warn) and `logs/system/error.log` (error)
- **Tenant Apps**: `logs/{tenant}/access.log` and `logs/{tenant}/error.log`

## 🧪 **Testing**

The patch is automatically disabled in test environment to avoid test pollution. Tests can be found in `server/lib/consolePatch.test.js`.

## ⚠️ **Caveats**

1. **Performance**: Small overhead from JSON serialization and stack trace analysis
2. **Stack Traces**: Context extraction relies on stack trace format (may vary across Node.js versions)
3. **Test Environment**: Automatically disabled to prevent test interference
4. **Circular References**: Objects with circular references will cause JSON.stringify errors

## 🔄 **Migration Path**

1. **Phase 1**: Apply patch automatically (current state)
2. **Phase 2**: Gradually replace `console.log` with proper logger calls
3. **Phase 3**: Remove patch once all code uses logger directly

## 🐛 **Debugging**

If you need to debug the patch itself:

```javascript
// Temporarily disable and check original console
console.restoreOriginal();
console.log('This uses original console');
```

Or check if patching is active:

```javascript
console.log('Patched:', console.log !== originalConsole.log);
```
