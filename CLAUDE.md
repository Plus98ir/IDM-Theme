# IDM-Theme — CLAUDE.md
_Updated 2026-11-11_

Unofficial dark look for Internet Download Manager. Repo: github.com/Plus98ir/IDM-Theme (public). Page: https://corenetbase.com/IDM-Theme/ (GitHub Pages from `/docs`).

## Key facts
- Two parts: `idm-ui/` = IDM Modern, a separate Electron app (reads `HKCU\Software\DownloadManager`, hands downloads to `IDMan.exe /d`, `/s`); `UIUXMonster-Dark/` = toolbar theme (`.tbi` v=3 + 6 BMP strips, 12 icons) for IDM's own window.
- IDM has no skin engine: inside IDM only the toolbar + its built-in dark mode can change. Don't patch `IDMan.exe` (signed, updates overwrite it).
- IDM registry flags: `ToolbarStyle` = selected toolbar name, `bDkMdAllowed` = dark mode, `bTbChOnDkMd` = toolbar change on dark mode.
- Branding: app is "IDM Modern" with an "Unofficial" badge + Tonec disclaimer. Never call it "Internet Download Manager 10.36" (no such version — came from a UIUXMonster concept mockup).
- Window buttons are Windows-style (minimize · maximize/restore · close, right side, 46px, close hover #C42B1C) — Sadeq asked for this instead of macOS dots.
- `build.ps1` → `release/IDM-Modern-win-x64.zip` (electron dist renamed to `IDM Modern.exe`, app in `resources/app`, ~150 MB) + `UIUXMonster-Dark-Toolbar.zip`. Upload both to a GitHub release; README/page link to `releases/latest/download/<name>`.
- `set-default.ps1` (shipped inside the app zip): installs to `%LOCALAPPDATA%\Programs\IDM Modern`, retargets "Internet Download Manager*.lnk" (Desktop/Start/taskbar, user + common) from IDMan.exe to IDM Modern, adds "IDM Classic"; `-Undo` reverts. Sadeq does NOT want IDM Modern on Windows startup — only when IDM is opened. App is single-instance and runs `IDMan.exe /onboot` (tray) if IDM isn't running. IDM tray icon still opens the classic window (can't change without hooking).
- The VS Code terminal sets `ELECTRON_RUN_AS_NODE`; clear it before launching electron.exe.
- Screenshots/cover use demo data (scratch preload), never the real registry list (private download history).

## Working rules (all projects)
- Every page full width — no narrow centered container; cap only media that would blur or overflow.
- All script/CLI output in English; end-user pages bilingual FA + EN with a language switch, dark, modern, mobile-ready.
- Tools must be universal — never hard-code Sadeq's own servers into shipped code.
- Be smart: build, don't ask how. Ask only before destructive actions.
- Never bump a version number without asking.
- Don't send a README unless asked.
- Short on time/tokens — get it right the first time; test before handing over.
