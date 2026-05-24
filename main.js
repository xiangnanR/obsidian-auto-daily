const {
    Plugin,
    PluginSettingTab,
    Setting,
    AbstractInputSuggest,
    prepareFuzzySearch,
    normalizePath,
    TFolder
} = require("obsidian");

function isNoteFile(file) {

    return (
        file &&
        typeof file.extension === "string"
    );
}

function isFolder(file) {

    return (
        file &&
        typeof file.children !== "undefined"
    );
}

const SUGGEST_LIMIT = 100;

function collectFolderPaths(app) {

    if (app.vault.getAllFolders) {

        return app.vault
            .getAllFolders(true)
            .map(folder => folder.path);
    }

    const paths = new Set([""]);

    for (const file of app.vault.getAllLoadedFiles()) {

        if (isFolder(file)) {
            paths.add(file.path);
        }
    }

    return Array.from(paths);
}

function fuzzyFilter(items, getText, query, limit = SUGGEST_LIMIT) {

    if (!query) {
        return items.slice(0, limit);
    }

    const fuzzy = prepareFuzzySearch(query);
    const results = [];

    for (const item of items) {

        const match = fuzzy(getText(item));

        if (match) {
            results.push({
                item,
                score: match.score
            });
        }
    }

    results.sort(
        (a, b) => b.score - a.score
    );

    return results
        .slice(0, limit)
        .map(result => result.item);
}

function applySuggestionValue(suggest, value) {

    suggest.setValue(value);

    const inputEl =
        suggest.textInputEl ??
        suggest._inputEl;

    if (inputEl) {
        inputEl.dispatchEvent(
            new Event("input", {
                bubbles: true
            })
        );
    }

    suggest.close();
}

class VaultFolderSuggest
extends AbstractInputSuggest {

    constructor(app, inputEl, getFolderPaths) {

        super(app, inputEl);

        this._inputEl = inputEl;
        this.getFolderPaths = getFolderPaths;
    }

    getSuggestions(query) {

        return fuzzyFilter(
            this.getFolderPaths(),
            path => path || "/",
            query
        );
    }

    renderSuggestion(path, el) {

        el.setText(path || "/");
    }

    selectSuggestion(path, evt) {

        applySuggestionValue(this, path);
    }
}

class VaultFileSuggest
extends AbstractInputSuggest {

    constructor(app, inputEl, getMarkdownFiles) {

        super(app, inputEl);

        this._inputEl = inputEl;
        this.getMarkdownFiles = getMarkdownFiles;
    }

    getSuggestions(query) {

        return fuzzyFilter(
            this.getMarkdownFiles(),
            file => file.path,
            query
        );
    }

    renderSuggestion(file, el) {

        el.setText(file.path);
    }

    selectSuggestion(file, evt) {

        applySuggestionValue(
            this,
            file.path
        );
    }
}

const DEFAULT_SETTINGS = {
    dailyFolder: "",
    templatePath: "",
    dateFormat: "YYYY-MM-DD",

    autoOpen: true,
    autoPin: true,

    // current | first | left | right（先确定打开位置）
    openPosition: "current",

    // 在所选位置新建标签页，否则覆盖该位置现有标签页
    createInNewTab: true,

    // everyday | workdays | custom
    createMode: "everyday",

    // moment.day(): 0=周日 … 6=周六
    customDays: [1, 2, 3, 4, 5]
};

const WEEKDAY_OPTIONS = [
    { value: 1, label: "星期一" },
    { value: 2, label: "星期二" },
    { value: 3, label: "星期三" },
    { value: 4, label: "星期四" },
    { value: 5, label: "星期五" },
    { value: 6, label: "星期六" },
    { value: 0, label: "星期日" }
];

module.exports = class AutoDailyPlugin extends Plugin {

    async onload() {

        await this.loadSettings();

        this.addSettingTab(
            new AutoDailySettingTab(
                this.app,
                this
            )
        );

        const runDaily = () => {

            this.scheduleHandleDaily();
        };

        this.app.workspace.onLayoutReady(runDaily);

        if (this.app.workspace.layoutReady) {
            runDaily();
        }
    }

    scheduleHandleDaily() {

        clearTimeout(this._handleDailyTimer);

        this._handleDailyTimer =
            window.setTimeout(async () => {

                try {

                    await this.handleDaily();

                } catch (e) {

                    console.error(
                        "Auto Daily Error:",
                        e
                    );
                }

            }, 800);
    }

    isDailyFileOpen(path) {

        return this.app.workspace
            .getLeavesOfType("markdown")
            .some(
                leaf =>
                    leaf.view?.file?.path === path
            );
    }

    pinLeafForFile(file) {

        if (!this.settings.autoPin) {
            return;
        }

        const leaf =
            this.app.workspace
                .getLeavesOfType("markdown")
                .find(
                    l =>
                        l.view?.file?.path ===
                        file.path
                );

        if (leaf) {
            leaf.setPinned(true);
        }
    }

    prepareSuggestData() {

        if (!this._suggestFolderPaths) {
            this._suggestFolderPaths =
                collectFolderPaths(this.app);
        }

        if (!this._suggestMarkdownFiles) {
            this._suggestMarkdownFiles =
                this.app.vault.getMarkdownFiles();
        }
    }

    clearSuggestData() {

        delete this._suggestFolderPaths;
        delete this._suggestMarkdownFiles;
    }

    getSuggestFolderPaths() {

        this.prepareSuggestData();
        return this._suggestFolderPaths;
    }

    getSuggestMarkdownFiles() {

        this.prepareSuggestData();
        return this._suggestMarkdownFiles;
    }

    getTargetLeaf() {

        const { workspace } = this.app;
        const wantNewTab =
            this.settings.createInNewTab;
        const position =
            this.settings.openPosition;

        switch (position) {

            case "left": {
                const leaf =
                    workspace.getLeftLeaf(wantNewTab);
                return (
                    leaf ??
                    workspace.getLeaf(
                        wantNewTab ? "tab" : "split"
                    )
                );
            }

            case "right": {
                const leaf =
                    workspace.getRightLeaf(wantNewTab);
                return (
                    leaf ??
                    workspace.getLeaf(
                        wantNewTab ? "tab" : "split"
                    )
                );
            }

            case "first": {
                const mdLeaves =
                    workspace.getLeavesOfType(
                        "markdown"
                    );

                if (mdLeaves.length === 0) {
                    return workspace.getLeaf(
                        wantNewTab ? "tab" : "split"
                    );
                }

                if (!wantNewTab) {
                    return mdLeaves[0];
                }

                workspace.setActiveLeaf(
                    mdLeaves[0],
                    { focus: true }
                );
                return workspace.getLeaf("tab");
            }

            case "current":
            default: {

                if (!wantNewTab) {
                    return (
                        workspace.getMostRecentLeaf() ??
                        workspace.getLeaf("split")
                    );
                }

                return workspace.getLeaf("tab");
            }
        }
    }

    async openDailyFile(file) {

        const { workspace } = this.app;
        const openState = { active: true };

        try {

            const leaf = this.getTargetLeaf();

            if (!leaf) {
                throw new Error(
                    "No target leaf for daily note"
                );
            }

            await leaf.openFile(file, openState);
            workspace.setActiveLeaf(leaf, {
                focus: true
            });
            this.pinLeafForFile(file);
            return true;

        } catch (e) {

            console.warn(
                "Auto Daily: openFile failed, retry openLinkText",
                e
            );

            await workspace.openLinkText(
                file.path,
                "",
                this.settings.createInNewTab
                    ? "tab"
                    : "split",
                openState
            );
            this.pinLeafForFile(file);
            return true;
        }
    }

    async handleDaily() {

        // 未配置目录则不执行
        if (
            !this.settings.dailyFolder ||
            !this.settings.dailyFolder.trim()
        ) {
            return;
        }

        const moment = window.moment();

        const today =
            moment.format(
                this.settings.dateFormat
            );

        const currentDay =
            moment.day();

        // 是否应该创建
        let shouldCreate = true;

        switch (
            this.settings.createMode
        ) {

            case "workdays":

                shouldCreate =
                    currentDay >= 1 &&
                    currentDay <= 5;

                break;

            case "custom":

                shouldCreate =
                    this.settings.customDays.includes(
                        currentDay
                    );

                break;

            default:

                shouldCreate = true;
        }

        if (!shouldCreate) {
            return;
        }

        const path = normalizePath(
            `${this.settings.dailyFolder}/${today}.md`
        );

        const dailyAlreadyOpen =
            this.isDailyFileOpen(path);

        // 今日笔记已在标签页中打开则跳过
        if (
            this.settings.autoOpen &&
            this.runtimeData?.lastOpened === today &&
            dailyAlreadyOpen
        ) {
            return;
        }

        let file =
            this.app.vault.getAbstractFileByPath(
                path
            );

        // 文件不存在则创建
        if (!file) {

            await this.ensureFolderExists(
                this.settings.dailyFolder
            );

            let content = "";

            // 用户配置了模板文件
            if (
                this.settings.templatePath &&
                this.settings.templatePath.trim()
            ) {

                const templateFile =
                    this.app.vault.getAbstractFileByPath(
                        this.settings.templatePath
                    );

                if (templateFile) {

                    content =
                        await this.app.vault.cachedRead(
                            templateFile
                        );
                }
            }

            // 仅替换 {{date}}
            content = content.replace(
                /\{\{date\}\}/g,
                today
            );

            file =
                await this.app.vault.create(
                    path,
                    content
                );
        }

        if (!isNoteFile(file)) {
            console.error(
                "Auto Daily: daily file is not a note:",
                path
            );
            return;
        }

        if (
            !this.settings.autoOpen ||
            this.isDailyFileOpen(path)
        ) {
            return;
        }

        try {

            await this.openDailyFile(file);

            this.runtimeData.lastOpened = today;
            await this.saveRuntimeData();

        } catch (e) {

            console.error(
                "Open file failed",
                e
            );

            window.setTimeout(async () => {

                if (this.isDailyFileOpen(path)) {
                    return;
                }

                try {

                    await this.openDailyFile(file);
                    this.runtimeData.lastOpened =
                        today;
                    await this.saveRuntimeData();

                } catch (retryError) {

                    console.error(
                        "Open file retry failed",
                        retryError
                    );
                }

            }, 1500);
        }
    }

    onunload() {

        clearTimeout(this._handleDailyTimer);
    }

    async ensureFolderExists(path) {

        const folders =
            path.split("/");

        let current = "";

        for (const folder of folders) {

            current +=
                current
                    ? `/${folder}`
                    : folder;

            const exists =
                this.app.vault.getAbstractFileByPath(
                    current
                );

            if (!exists) {

                await this.app.vault.createFolder(
                    current
                );
            }
        }
    }

    async loadSettings() {

        const data =
            await this.loadData();

        this.settings =
            Object.assign(
                {},
                DEFAULT_SETTINGS,
                data?.settings || {}
            );

        this.settings.customDays = (
            this.settings.customDays || []
        ).filter(
            day =>
                Number.isInteger(day) &&
                day >= 0 &&
                day <= 6
        );

        if (this.settings.customDays.length === 0) {
            this.settings.customDays = [
                ...DEFAULT_SETTINGS.customDays
            ];
        }

        this.runtimeData =
            Object.assign(
                {
                    lastOpened: ""
                },
                data?.runtime || {}
            );
    }

    saveSettingsDebounced() {

        clearTimeout(
            this.saveTimer
        );

        this.saveTimer =
            setTimeout(async () => {

                await this.saveSettings();

            }, 500);
    }

    async saveSettings() {

        await this.saveData({
            settings: this.settings,
            runtime: this.runtimeData
        });
    }

    async saveRuntimeData() {

        await this.saveData({
            settings: this.settings,
            runtime: this.runtimeData
        });
    }
};

class AutoDailySettingTab
extends PluginSettingTab {

    constructor(app, plugin) {

        super(app, plugin);

        this.plugin = plugin;
    }

    hide() {

        this.plugin.clearSuggestData();
    }

    display() {

        const { containerEl } = this;

        containerEl.empty();

        this.plugin.prepareSuggestData();

        containerEl.createEl(
            "h2",
            {
                text:
                    "Auto Daily Settings"
            }
        );

        // Daily Folder
        new Setting(containerEl)
            .setName(
                "Daily Folder"
            )
            .setDesc(
                "自动创建日记目录（为空则不执行）"
            )
            .addSearch(search => {

                new VaultFolderSuggest(
                    this.app,
                    search.inputEl,
                    () =>
                        this.plugin.getSuggestFolderPaths()
                );

                search
                    .setPlaceholder(
                        "例如：Daily"
                    )
                    .setValue(
                        this.plugin.settings
                            .dailyFolder
                    )
                    .onChange(value => {

                        this.plugin.settings.dailyFolder =
                            value.trim();

                        this.plugin.saveSettingsDebounced();
                    });
            });

        // Template File
        new Setting(containerEl)
            .setName(
                "Template File"
            )
            .setDesc(
                "模板文件（可选）"
            )
            .addSearch(search => {

                new VaultFileSuggest(
                    this.app,
                    search.inputEl,
                    () =>
                        this.plugin.getSuggestMarkdownFiles()
                );

                search
                    .setPlaceholder(
                        "例如：Templates/Daily.md"
                    )
                    .setValue(
                        this.plugin.settings
                            .templatePath
                    )
                    .onChange(value => {

                        this.plugin.settings.templatePath =
                            value.trim();

                        this.plugin.saveSettingsDebounced();
                    });
            });

        // 日期格式
        new Setting(containerEl)
            .setName(
                "Date Format"
            )
            .setDesc(
                "选择日记的命名方式"
            )
            .addText(text => {

                text
                    .setValue(
                        this.plugin.settings
                            .dateFormat
                    )
                    .onChange(value => {

                        this.plugin.settings.dateFormat =
                            value;

                        this.plugin.saveSettingsDebounced();
                    });
            });

        // Auto Open
        new Setting(containerEl)
            .setName(
                "Auto Open"
            )
            .setDesc(
                "自动打开日记"
            )
            .addToggle(toggle => {

                toggle
                    .setValue(
                        this.plugin.settings
                            .autoOpen
                    )
                    .onChange(value => {

                        this.plugin.settings.autoOpen =
                            value;

                        this.plugin.saveSettingsDebounced();
                    });
            });

        // Auto Pin
        new Setting(containerEl)
            .setName(
                "Auto Pin"
            )
            .setDesc(
                "自动锁定日记所在的标签页"
            )
            .addToggle(toggle => {

                toggle
                    .setValue(
                        this.plugin.settings
                            .autoPin
                    )
                    .onChange(value => {

                        this.plugin.settings.autoPin =
                            value;

                        this.plugin.saveSettingsDebounced();
                    });
            });

        // Open Position（先选位置）
        new Setting(containerEl)
            .setName(
                "Open Position"
            )
            .setDesc(
                "日记在哪个位置打开"
            )
            .addDropdown(dropdown => {

                dropdown
                    .addOption(
                        "current",
                        "Current Pane（当前窗格）"
                    )
                    .addOption(
                        "first",
                        "First Tab（第一个标签页）"
                    )
                    .addOption(
                        "left",
                        "Left Sidebar（左侧栏）"
                    )
                    .addOption(
                        "right",
                        "Right Sidebar（右侧栏）"
                    )
                    .setValue(
                        this.plugin.settings
                            .openPosition
                    )
                    .onChange(value => {

                        this.plugin.settings.openPosition =
                            value;

                        this.plugin.saveSettingsDebounced();
                    });
            });

        // Create In New Tab（再决定是否覆盖）
        new Setting(containerEl)
            .setName(
                "Create In New Tab"
            )
            .setDesc(
                "开启：在所选位置新建标签页；关闭：覆盖该位置的现有标签页"
            )
            .addToggle(toggle => {

                toggle
                    .setValue(
                        this.plugin.settings
                            .createInNewTab
                    )
                    .onChange(value => {

                        this.plugin.settings.createInNewTab =
                            value;

                        this.plugin.saveSettingsDebounced();
                    });
            });

        this.addCreateModeSettings(containerEl);
    }

    addCreateModeSettings(containerEl) {

        const customDaysSetting =
            new Setting(containerEl)
                .setName("重复周期")
                .setDesc(
                    "选择需要自动创建 Daily 的星期（可多选）"
                );

        const weekdayContainer =
            customDaysSetting.controlEl.createDiv({
                cls: "auto-daily-weekdays"
            });

        weekdayContainer.style.display = "flex";
        weekdayContainer.style.flexWrap = "wrap";
        weekdayContainer.style.gap = "6px";

        const dayButtons = [];

        const refreshDayButtons = () => {

            const selected =
                this.plugin.settings.customDays;

            for (const { btn, value } of dayButtons) {

                btn.toggleClass(
                    "mod-cta",
                    selected.includes(value)
                );
            }
        };

        for (const { value, label } of WEEKDAY_OPTIONS) {

            const btn = weekdayContainer.createEl(
                "button",
                {
                    cls: "auto-daily-weekday-btn",
                    text: label
                }
            );

            btn.type = "button";

            btn.addEventListener("click", () => {

                const days = [
                    ...this.plugin.settings.customDays
                ];
                const index = days.indexOf(value);

                if (index >= 0) {

                    if (days.length <= 1) {
                        return;
                    }

                    days.splice(index, 1);

                } else {

                    days.push(value);
                }

                this.plugin.settings.customDays =
                    days.sort((a, b) => {

                        const order = (d) =>
                            d === 0 ? 7 : d;

                        return order(a) - order(b);
                    });

                refreshDayButtons();
                this.plugin.saveSettingsDebounced();
            });

            dayButtons.push({ btn, value });
        }

        refreshDayButtons();

        const updateCustomDaysVisibility = () => {

            customDaysSetting.settingEl.toggle(
                this.plugin.settings.createMode ===
                    "custom"
            );
        };

        const createModeSetting =
            new Setting(containerEl)
                .setName("Create Mode")
                .setDesc("创建日记的重复规则")
                .addDropdown(dropdown => {

                    dropdown
                        .addOption(
                            "everyday",
                            "每天"
                        )
                        .addOption(
                            "workdays",
                            "工作日"
                        )
                        .addOption(
                            "custom",
                            "自定义"
                        )
                        .setValue(
                            this.plugin.settings
                                .createMode
                        )
                        .onChange(value => {

                            this.plugin.settings.createMode =
                                value;

                            updateCustomDaysVisibility();
                            this.plugin.saveSettingsDebounced();
                        });
                });

        containerEl.insertBefore(
            createModeSetting.settingEl,
            customDaysSetting.settingEl
        );

        updateCustomDaysVisibility();
    }
}
