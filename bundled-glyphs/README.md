# 📦 Bundled Glyphs

This folder contains glyphs that ship with LOOM and are automatically installed into users' glyph libraries on first launch.

## How to Add a Bundled Glyph

1. Create a new folder with a unique name (e.g., `my-cool-glyph`)
2. Add a `manifest.json` with these required fields:

```json
{
  "id": "bundled-my-cool-glyph",
  "name": "My Cool Glyph",
  "version": "1.0.0",
  "type": "object",
  "description": "A cool example glyph",
  "author": "Your Name",
  "bundled": true
}
```

3. Add an `index.html` file with your glyph code
4. Optionally add other files (CSS, JS, assets, etc.)

## Important Notes

- **`id`** - Must be unique! Prefix with `bundled-` to avoid conflicts
- **`version`** - Bump this to push updates to users (e.g., "1.0.1")
- **`bundled: true`** - This marks the glyph as bundled in the user's library
- Users can modify bundled glyphs, but updates will overwrite their changes

## Example Structure

```
bundled-glyphs/
├── README.md
├── welcome-portal/
│   ├── manifest.json
│   ├── index.html
│   └── style.css
└── demo-clock/
    ├── manifest.json
    └── index.html
```

## Version Updates

When you update a bundled glyph:
1. Modify the files as needed
2. Bump the `version` in manifest.json
3. The app will automatically update users' copies on next launch

Users' versions are tracked in `%APPDATA%/loom/installed-bundled-glyphs.json`

