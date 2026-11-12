<h1 align="center">IDM Theme</h1>

<p align="center"><a href="https://hits.sh/github.com/Plus98ir/IDM-Theme/"><img src="https://hits.sh/github.com/Plus98ir/IDM-Theme.svg?style=for-the-badge&label=views&color=2563eb" alt="Views"></a> <a href="https://corenetbase.com/#support"><img src="https://img.shields.io/badge/support-buy%20me%20a%20coffee-e11d2a?style=for-the-badge&logo=buymeacoffee&logoColor=white" alt="Support"></a></p>

<div align="center">

[<img src="https://flagcdn.com/w40/us.png" width="20" alt=""> &nbsp;**English**](README.md) &nbsp;&nbsp;|&nbsp;&nbsp; [<img src="https://flagcdn.com/w40/ir.png" width="20" alt=""> &nbsp;**فارسی**](README.fa.md)

</div>

<details>
<summary><b>☕ Support · حمایت</b> — USDT (TRC20) / TRX</summary>
<br>
<p align="center"><img src="https://raw.githubusercontent.com/Plus98ir/.github/main/tron-qr.png" width="200" alt="TRON address QR"></p>

```
TA53aFyGNfSAcrCaJi9QmA9x5W47nPJcf7
```

> [!WARNING]
> **TRON network only.** Sending from ERC20 / BEP20 will lose the funds.<br>
> **فقط شبکه‌ی TRON.** ارسال از ERC20 یا BEP20 پول را از بین می‌برد.

</details>

A modern dark look for Internet Download Manager: a new UI with Windows-style window buttons, plus a toolbar icon theme for IDM itself.

<img src="IDM-Theme.png" alt="IDM Theme" width="860">

> [!NOTE]
> Unofficial project, not affiliated with or endorsed by Tonec Inc. "Internet Download Manager" and "IDM" are trademarks of their owner.

## Download

- **IDM Modern (app):** [`IDM-Modern-win-x64.zip`](https://github.com/Plus98ir/IDM-Theme/releases/latest/download/IDM-Modern-win-x64.zip). Unzip and run `IDM Modern.exe`. Nothing to install and no Node.js needed.
- **Toolbar theme:** [`UIUXMonster-Dark-Toolbar.zip`](https://github.com/Plus98ir/IDM-Theme/releases/latest/download/UIUXMonster-Dark-Toolbar.zip)
- **Website:** https://corenetbase.com/IDM-Theme/

IDM itself must be installed (tested with 6.43, Windows 10/11).

## 1. IDM Modern

A separate app that shows your IDM downloads in a modern dark window.

- Reads the download list live from the registry (`HKCU\Software\DownloadManager`) and refreshes every 15 seconds.
- Categories, search, sorting, progress bars, disk space and a speed test.
- Open file or folder, copy the link, redownload, remove from the list.
- Adding downloads, queues and browser capture are handed to IDM itself (`IDMan.exe /d <url>`, `/s`), so nothing about IDM changes.
- Window buttons sit on the right like Windows 11: minimize, maximize/restore, close with the red hover.

If Windows SmartScreen warns on first run: **More info → Run anyway** (the exe isn't code-signed).

### Open IDM Modern whenever you open IDM

In the unzipped folder, right-click `set-default.ps1` → **Run with PowerShell**. It:

- installs the app to `%LOCALAPPDATA%\Programs\IDM Modern`,
- points IDM's Desktop / Start Menu / taskbar shortcuts to IDM Modern (the IDM icon stays),
- adds **IDM Classic** to the Start Menu for the original window.

- shows IDM Modern's tray icon next to the clock and moves IDM's own icon into the `^` overflow (Windows 11).

IDM Modern starts IDM in the tray in the background, so browser capture keeps working. Like IDM, the ✕ button hides it to the tray; **Tasks → Exit** or the tray menu quits it. Nothing starts with Windows unless IDM's own setting does.

Undo: `.\set-default.ps1 -Undo`

## 2. UIUXMonster Dark toolbar theme

12 new icons for IDM's own toolbar in three sizes (large `56×42`, small `32×32`, HiDPI `84×63`), each with a coloured hover state.

<img src="preview.png" alt="Toolbar icons" width="860">

1. Unzip, right-click `install.ps1` → **Run with PowerShell** (it asks for admin rights to copy into `Program Files`).
   Or copy the 7 files from `UIUXMonster-Dark\` into `C:\Program Files (x86)\Internet Download Manager\Toolbar\` by hand.
2. Fully close IDM with **Tasks → Exit**, then open it again.
3. Pick **View → Toolbar → UIUXMonster Dark**, and turn on **View → Dark Mode support** (with Windows set to dark apps).

Uninstall: `.\install.ps1 -Uninstall`

IDM has no full skin engine, so the toolbar and IDM's built-in dark mode are all that can change inside IDM's own window. The layout above is the separate IDM Modern app.

## Build from source

```powershell
cd idm-ui
npm install
npm start                 # or double-click Launch-IDM-Modern.cmd
```

- `.\build.ps1` makes both release zips in `release\`.
- `python generate_theme.py` redraws the toolbar icons (needs Pillow).

## License

MIT
