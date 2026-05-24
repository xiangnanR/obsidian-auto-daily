# Auto Daily
Automatically create, open, and pin your daily note on the first launch of each day.


## Features
- Create today's note automatically using your folder and date format
- Optionally auto-open the note and pin the tab
- Schedule by every day, workdays, or custom weekdays
<img width="2427" height="1573" alt="image" src="https://github.com/user-attachments/assets/283914c9-2a9c-4d8e-9b82-f85b137c446d" />

---

## Installation

1. Place this plugin folder at `.obsidian/plugins/auto-daily/` in your vault.
2. Open Obsidian → **Settings** → **Community plugins**.
3. Enable **Auto Daily**.
4. Open plugin settings and set at least **Daily Folder**.

---

## Settings

| Setting | Description |
| --- | --- |
| **Daily Folder** | Folder for daily notes (relative to vault root). Leave empty to disable the plugin. Supports fuzzy search. |
| **Template File** | Optional template note. Content is copied when creating a new daily note. Supports fuzzy search. |
| **Date Format** | Date format for the file name. Default: `YYYY-MM-DD`. |
| **Auto Open** | Open the daily note after creation. |
| **Auto Pin** | Pin the tab after opening. |
| **Open Position** | Where to open: current pane, first tab, left sidebar, or right sidebar. |
| **Create In New Tab** | **On:** open in a new tab at the chosen position. **Off:** replace the existing tab at that position. Works together with Open Position (position first, then new vs. replace). |
| **Create Mode** | **Every day**, **Workdays** (Mon–Fri), or **Custom**. |
| **Repeat cycle** | Shown only when Create Mode is **Custom**; multi-select Monday–Sunday. |

---

## How It Works

1. After the workspace layout is ready, the plugin checks whether today’s note should be created (based on **Create Mode**).
2. If the note does not exist, it is created from the template (if set); otherwise creation is skipped.
3. If **Auto Open** is on and today's note is not already open in a tab, it opens using **Open Position** and **Create In New Tab**, and optionally pins the tab.
4. After a successful open on the same day, the plugin will not auto-open again unless you restart Obsidian and the note is no longer open in any tab.

Runtime state is stored in `data.json` under the plugin folder (`runtime.lastOpened`, etc.). You usually do not need to edit it manually.

---

## Requirements
- Obsidian **1.5.0** or later
- Desktop and mobile

---

## Author

[xiangnanR](https://github.com/xiangnanR)

---

## License | 许可
Licensed under the [MIT License](https://github.com/xiangnanR/obsidian-auto-daily/blob/e4c4335226d2162490ac4c92c0bce188615e3774/LICENSE).

## Acknowledgments
- [Obsidian](https://obsidian.md/) for the plugin API
