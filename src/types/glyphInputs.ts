/**
 * GLYPH INPUT TYPES — Dynamic configuration inputs for glyphs
 * 
 * These types define the schema for user-configurable inputs that glyphs
 * can declare in their manifest. The LLM can generate these when creating
 * glyphs, and users can modify them through the inspector.
 */

// Base input field properties shared by all input types
export interface GlyphInputBase {
  id: string;           // Unique identifier for this input
  label: string;        // Human-readable label
  description?: string; // Optional help text
  required?: boolean;   // Whether this input is required
  group?: string;       // Optional grouping for organization
}

// String input (text, textarea, url, email, etc.)
export interface GlyphInputString extends GlyphInputBase {
  type: 'string';
  inputType?: 'text' | 'textarea' | 'url' | 'email' | 'number' | 'color';
  placeholder?: string;
  defaultValue?: string;
  value?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string; // Regex validation
}

// API Key input (stored securely, masked in UI)
export interface GlyphInputApiKey extends GlyphInputBase {
  type: 'apiKey';
  service?: string;     // e.g., 'openweathermap', 'spotify', 'custom'
  placeholder?: string;
  value?: string;       // Will be stored encrypted, shown masked
  keyName?: string;     // Internal key name for storage
}

// File upload input
export interface GlyphInputFile extends GlyphInputBase {
  type: 'file';
  accept?: string;      // MIME types, e.g., 'image/*', '.json,.csv'
  multiple?: boolean;
  maxSize?: number;     // Max file size in bytes
  value?: GlyphFileRef | GlyphFileRef[];
}

// Reference to an uploaded file
export interface GlyphFileRef {
  name: string;
  path: string;         // Relative path within glyph directory
  size: number;
  mimeType: string;
  uploadedAt: string;
}

// Toggle/boolean input
export interface GlyphInputToggle extends GlyphInputBase {
  type: 'toggle';
  defaultValue?: boolean;
  value?: boolean;
  onLabel?: string;     // Label when on (e.g., "Enabled")
  offLabel?: string;    // Label when off (e.g., "Disabled")
}

// Single-select dropdown
export interface GlyphInputSelect extends GlyphInputBase {
  type: 'select';
  options: GlyphSelectOption[];
  defaultValue?: string;
  value?: string;
  allowCustom?: boolean; // Allow user to enter custom value
}

// Multi-select dropdown
export interface GlyphInputMultiSelect extends GlyphInputBase {
  type: 'multiselect';
  options: GlyphSelectOption[];
  defaultValue?: string[];
  value?: string[];
  minSelections?: number;
  maxSelections?: number;
}

// Option for select/multiselect
export interface GlyphSelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
}

// Slider/range input
export interface GlyphInputRange extends GlyphInputBase {
  type: 'range';
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  value?: number;
  unit?: string;        // e.g., 'px', '%', 'ms'
}

// Color picker input
export interface GlyphInputColor extends GlyphInputBase {
  type: 'color';
  defaultValue?: string;
  value?: string;
  presets?: string[];   // Preset color options
}

// Union type of all input types
export type GlyphInput =
  | GlyphInputString
  | GlyphInputApiKey
  | GlyphInputFile
  | GlyphInputToggle
  | GlyphInputSelect
  | GlyphInputMultiSelect
  | GlyphInputRange
  | GlyphInputColor;

// Input values map (for passing to glyph runtime)
export type GlyphInputValues = Record<string, unknown>;

// Extract current values from inputs array
export function extractInputValues(inputs: GlyphInput[]): GlyphInputValues {
  const values: GlyphInputValues = {};
  for (const input of inputs) {
    if ('value' in input && input.value !== undefined) {
      values[input.id] = input.value;
    } else if ('defaultValue' in input && input.defaultValue !== undefined) {
      values[input.id] = input.defaultValue;
    }
  }
  return values;
}

// Validate a single input value
export function validateInput(input: GlyphInput, value: unknown): { valid: boolean; error?: string } {
  if (input.required && (value === undefined || value === null || value === '')) {
    return { valid: false, error: `${input.label} is required` };
  }

  switch (input.type) {
    case 'string':
      if (typeof value === 'string') {
        if (input.minLength && value.length < input.minLength) {
          return { valid: false, error: `${input.label} must be at least ${input.minLength} characters` };
        }
        if (input.maxLength && value.length > input.maxLength) {
          return { valid: false, error: `${input.label} must be at most ${input.maxLength} characters` };
        }
        if (input.pattern && !new RegExp(input.pattern).test(value)) {
          return { valid: false, error: `${input.label} format is invalid` };
        }
      }
      break;

    case 'range':
      if (typeof value === 'number') {
        if (value < input.min || value > input.max) {
          return { valid: false, error: `${input.label} must be between ${input.min} and ${input.max}` };
        }
      }
      break;

    case 'multiselect':
      if (Array.isArray(value)) {
        if (input.minSelections && value.length < input.minSelections) {
          return { valid: false, error: `Select at least ${input.minSelections} options` };
        }
        if (input.maxSelections && value.length > input.maxSelections) {
          return { valid: false, error: `Select at most ${input.maxSelections} options` };
        }
      }
      break;
  }

  return { valid: true };
}

// Default icon options for glyphs
export const GLYPH_ICON_OPTIONS = [
  '🔮', '✨', '🌌', '🌀', '💫', '⚡', '🔥', '💎', '🌙', '☀️',
  '🌊', '🍃', '❄️', '🌸', '🦋', '🐉', '🦄', '👁️', '🎭', '🎪',
  '🎨', '🎵', '🎮', '🎲', '🃏', '🏆', '💡', '🔧', '⚙️', '🛸',
  '🌈', '🔮', '📊', '📈', '🗺️', '🧭', '⏰', '🌡️', '💻', '📱',
];

