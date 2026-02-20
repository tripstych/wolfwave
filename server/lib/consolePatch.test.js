import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Console Patch', () => {
  let originalConsole;

  beforeEach(() => {
    // Store original console methods
    originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      debug: console.debug,
      info: console.info
    };

    // Mock logger
    vi.mock('./logger.js', () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    }));
  });

  afterEach(() => {
    // Restore original console methods
    Object.assign(console, originalConsole);
    
    // Clear mocks
    vi.clearAllMocks();
  });

  describe('patchConsole', () => {
    it('should patch console.log to use logger', async () => {
      const { info } = await import('./logger.js');
      
      const { patchConsole } = await import('./consolePatch.js');
      patchConsole();
      
      console.log('Test message');
      
      expect(info).toHaveBeenCalledWith(null, expect.stringContaining('CONSOLE:'), 'Test message');
    });

    it('should patch console.error to use logger', async () => {
      const { error } = await import('./logger.js');
      
      const { patchConsole } = await import('./consolePatch.js');
      patchConsole();
      
      console.error('Error message');
      
      expect(error).toHaveBeenCalledWith(null, expect.any(Error), expect.stringContaining('CONSOLE:'));
    });

    it('should patch console.warn to use logger', async () => {
      const { warn } = await import('./logger.js');
      
      const { patchConsole } = await import('./consolePatch.js');
      patchConsole();
      
      console.warn('Warning message');
      
      expect(warn).toHaveBeenCalledWith(null, expect.stringContaining('CONSOLE:'), 'Warning message');
    });

    it('should handle object arguments', async () => {
      const { info } = await import('./logger.js');
      
      const { patchConsole } = await import('./consolePatch.js');
      patchConsole();
      
      const obj = { key: 'value' };
      console.log('Object:', obj);
      
      expect(info).toHaveBeenCalledWith(
        null, 
        expect.stringContaining('CONSOLE:'), 
        expect.stringContaining('"key": "value"')
      );
    });

    it('should provide restoreOriginal method', async () => {
      const { patchConsole } = await import('./consolePatch.js');
      
      patchConsole();
      
      expect(typeof console.restoreOriginal).toBe('function');
      
      // Restore and verify original methods are back
      console.restoreOriginal();
      
      expect(console.log).toBe(originalConsole.log);
      expect(console.error).toBe(originalConsole.error);
      expect(console.warn).toBe(originalConsole.warn);
    });
  });

  describe('maybePatchConsole', () => {
    it('should not patch in test environment', async () => {
      process.env.NODE_ENV = 'test';
      
      const { maybePatchConsole } = await import('./consolePatch.js');
      maybePatchConsole();
      
      // Console should remain unchanged
      expect(console.log).toBe(originalConsole.log);
    });

    it('should not patch when DISABLE_CONSOLE_PATCH is true', async () => {
      process.env.NODE_ENV = 'development';
      process.env.DISABLE_CONSOLE_PATCH = 'true';
      
      const { maybePatchConsole } = await import('./consolePatch.js');
      maybePatchConsole();
      
      // Console should remain unchanged
      expect(console.log).toBe(originalConsole.log);
    });

    it('should patch in development environment', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.DISABLE_CONSOLE_PATCH;
      
      const { maybePatchConsole } = await import('./consolePatch.js');
      maybePatchConsole();
      
      // Console should be patched
      expect(console.log).not.toBe(originalConsole.log);
    });

    it('should patch in production environment', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DISABLE_CONSOLE_PATCH;
      
      const { maybePatchConsole } = await import('./consolePatch.js');
      maybePatchConsole();
      
      // Console should be patched
      expect(console.log).not.toBe(originalConsole.log);
    });
  });

  describe('Context extraction', () => {
    it('should extract file name from stack trace', async () => {
      const { info } = await import('./logger.js');
      
      const { patchConsole } = await import('./consolePatch.js');
      patchConsole();
      
      console.log('Test context');
      
      expect(info).toHaveBeenCalledWith(
        null,
        expect.stringMatching(/CONSOLE:\w+/), // Should have CONSOLE:filename pattern
        'Test context'
      );
    });
  });
});
