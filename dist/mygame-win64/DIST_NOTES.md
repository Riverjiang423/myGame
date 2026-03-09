# Distribution Notes

## Main Entry
- Runtime entry: `app/index.js`
- Node runtime entry: `runtime/node.exe`
- End-user launcher: `launch-product.bat`

## Static Assets
- `public/` is copied into `app/public/` and loaded by the HTTP server as-is.

## Native Addon and DLL
- Node addon expected path: `app/build/Release/libztaddon.node`
- libzt dll expected path: `app/third_party/libzt/winx64/libzt.dll`

## Known Blockers for Single EXE
- Current runtime loads `.node` addon from filesystem at runtime.
- Current runtime loads `libzt.dll` from filesystem at runtime.
- `pkg`/`nexe` single-file packaging is not considered solved in this step.

## Portable Node Runtime
- Runtime source priority:
  1) `NODE_RUNTIME_WIN_X64_DIR` (env var)
  2) `third_party/node/winx64`
- Runtime target path: `runtime/node.exe`

## Next Step
- Validate `launch-product.bat` on clean Windows machine without Node preinstalled.
- Then decide installer or embedded runtime strategy before EXE stage.
