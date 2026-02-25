import { TemplateGenerator } from '../importer-v2/TemplateGenerator.js';

/**
 * Lovable-specific template generator.
 * Inherits all behavior from TemplateGenerator — assets will be null
 * since we strip Tailwind CSS rather than sideloading it.
 */
export class LovableTemplateGenerator extends TemplateGenerator {}
