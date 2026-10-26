import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';

import {DASH_TO_PANEL} from '../otherExtensions.js';
// Dash to Panel's setting that paints the panel with its own color: always off here,
// so the panel takes the color of the stylesheets, as when Dash to Panel has none.
const CUSTOM_COLOR_KEY = 'trans-use-custom-bg';
// Dash to Panel's setting for the window preview titles: black or white to match the mode.
const TITLE_COLOR_KEY = 'window-preview-title-font-color';

// Makes Dash to Panel use this extension's colors, always while both are on. Its settings
// are never written: two of them are answered differently. Only the color comes from here:
// Dash to Panel still sets its panels' opacity (theme, custom or dynamic), gradients and
// borders itself, inline on each panel, above this extension's stylesheets.
export class DashToPanel {
    constructor(isDark) {
        this._isDark = isDark;
        // Dash to Panel may be turned on, off or reloaded after this extension.
        Main.extensionManager.connectObject('extension-state-changed', (_manager, extension) => {
            if (extension.uuid === DASH_TO_PANEL)
                this._sync();
        }, this);
        this._sync();
    }

    destroy() {
        Main.extensionManager.disconnectObject(this);
        this._destroyed = true;
        this._unhook();
    }

    // The mode changed: preview titles switch between black and white.
    modeChanged() {
        this._dtpSettings?.emit(`changed::${TITLE_COLOR_KEY}`, TITLE_COLOR_KEY);
    }

    // Dash to Panel's settings object comes from its own module, already loaded by GNOME.
    async _sync() {
        const extension = Main.extensionManager.lookup(DASH_TO_PANEL);
        let dtpSettings = null;
        if (extension?.state === ExtensionState.ACTIVE) {
            try {
                const module = await import(extension.dir.get_child('extension.js').get_uri());
                dtpSettings = module.SETTINGS ?? null;
            } catch (e) {
                console.error(`[Shell Color Manager] ${e.message}`);
            }
        }
        if (this._destroyed || dtpSettings === this._dtpSettings)
            return;
        this._unhook();
        if (dtpSettings)
            this._hook(dtpSettings);
    }

    _hook(dtpSettings) {
        const {get_boolean: getBoolean, get_string: getString} = dtpSettings;
        const isDark = this._isDark;
        this._dtpSettings = dtpSettings;
        dtpSettings.get_boolean = function (key) {
            return key === CUSTOM_COLOR_KEY ? false : getBoolean.call(this, key);
        };
        dtpSettings.get_string = function (key) {
            if (key === TITLE_COLOR_KEY)
                return isDark() ? '#ffffff' : '#000000';
            return getString.call(this, key);
        };
        this._redraw();
    }

    // Gives Dash to Panel its own get_boolean and get_string back.
    _unhook() {
        if (!this._dtpSettings)
            return;
        delete this._dtpSettings.get_boolean;
        delete this._dtpSettings.get_string;
        this._redraw();
        this._dtpSettings = null;
    }

    // Dash to Panel redraws its panels when these settings change.
    _redraw() {
        for (const key of [CUSTOM_COLOR_KEY, TITLE_COLOR_KEY])
            this._dtpSettings.emit(`changed::${key}`, key);
    }
}
