import { TransformationEngine } from '../assisted-import/TransformationEngine.js';

/**
 * Lovable-specific transformation engine.
 * Inherits all behavior from TransformationEngine — content extraction,
 * media sideloading, and CMS record creation work identically.
 */
export class LovableTransformer extends TransformationEngine {}
