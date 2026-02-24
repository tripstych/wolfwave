import { info, warn, error, debug } from './logger.js';

/**
 * Console monkey patch for unified logging
 * Replaces console.log/error/warn with proper logger calls
 */

// Store original console methods for fallback
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  debug: console.debug || console.log
};

// Flag to prevent infinite recursion
let isPatched = false;

/**
 * Patch console methods to use the logger system
 * This provides automatic context and file logging for all console calls
 */
export function patchConsole() {
  // Prevent double-patching
  if (isPatched) {
    return;
  }
  isPatched = true;

  // Get caller info for better context
  function getCallerInfo() {
    const stack = new Error().stack;
    const lines = stack.split('\n');
    // Skip current function, patch function, and the actual console call
    const callerLine = lines[5] || lines[4] || 'unknown';
    return callerLine.trim();
  }

  // Patch console.log -> info
  console.log = function(...args) {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    const caller = getCallerInfo();
    const context = `CONSOLE:${caller.split('/').pop().split(':')[0]}`;
    
    // Use direct logger call to avoid recursion
    try {
      // Call logger directly without going through patched console
      info(null, context, message);
    } catch (e) {
      // Fallback to original console if logger fails
      originalConsole.log('Console patch error:', e.message);
      originalConsole.log(...args);
    }
    
    // Also output to original console in development for immediate feedback
    if (process.env.NODE_ENV !== 'production') {
      originalConsole.log(...args);
    }
  };

  // Patch console.error -> error
  console.error = function(...args) {
    // Check if any arg is an Error object (e.g. Prisma errors) — preserve its stack
    const realError = args.find(arg => arg instanceof Error);

    const message = args.map(arg => {
      if (arg instanceof Error) return arg.stack || arg.message;
      if (typeof arg === 'object') return JSON.stringify(arg, null, 2);
      return String(arg);
    }).join(' ');

    const caller = getCallerInfo();
    const context = `CONSOLE:${caller.split('/').pop().split(':')[0]}`;

    const err = realError || new Error(message);
    if (!realError) {
      err.stack = `Error: ${message}\n${caller}`;
    }

    try {
      // Call logger directly without going through patched console
      error(null, err, context);
    } catch (e) {
      // Fallback to original console if logger fails
      originalConsole.error('Console patch error:', e.message);
      originalConsole.error(...args);
    }

    // Also output to original console in development
    if (process.env.NODE_ENV !== 'production') {
      originalConsole.error(...args);
    }
  };

  // Patch console.warn -> warn
  console.warn = function(...args) {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    const caller = getCallerInfo();
    const context = `CONSOLE:${caller.split('/').pop().split(':')[0]}`;
    
    try {
      // Call logger directly without going through patched console
      warn(null, context, message);
    } catch (e) {
      // Fallback to original console if logger fails
      originalConsole.warn('Console patch error:', e.message);
      originalConsole.warn(...args);
    }
    
    // Also output to original console in development
    if (process.env.NODE_ENV !== 'production') {
      originalConsole.warn(...args);
    }
  };

  // Patch console.debug -> debug (if exists)
  if (console.debug) {
    console.debug = function(...args) {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      const caller = getCallerInfo();
      const context = `CONSOLE:${caller.split('/').pop().split(':')[0]}`;
      
      try {
        // Call logger directly without going through patched console
        debug(null, context, message);
      } catch (e) {
        // Fallback to original console if logger fails
        originalConsole.debug('Console patch error:', e.message);
        originalConsole.debug(...args);
      }
      
      // Also output to original console in development
      if (process.env.NODE_ENV !== 'production') {
        originalConsole.debug(...args);
      }
    };
  }

  // Add a method to restore original console
  console.restoreOriginal = function() {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.debug = originalConsole.debug;
    isPatched = false;
    delete console.restoreOriginal;
  };

  // Use original console for the patch message to avoid recursion
  originalConsole.log('🔧 Console patched with logger system');
}

/**
 * Conditionally patch console based on environment
 */
export function maybePatchConsole() {
  // Don't patch in test environment to avoid test pollution
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  
  // Don't patch if explicitly disabled
  if (process.env.DISABLE_CONSOLE_PATCH === 'true') {
    return;
  }
  
  patchConsole();
}
