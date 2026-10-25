import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {BackgroundMenu} from 'resource:///org/gnome/shell/ui/backgroundMenu.js';

const ENTRY_TITLE = 'Shell Color Manager…';

// Adds "Shell Color Manager…" to the desktop's right-click menu, below "Change
// Background…". GNOME rebuilds those menus (one per monitor) when the wallpaper or the
// monitors change, so the entry is added each time a menu opens, if it is not there yet.
export class DesktopMenu {
    constructor(settings, openPreferences) {
        this._settings = settings;
        this._openPreferences = openPreferences;
        settings.connectObject('changed::background-menu-entry', () => this._sync(), this);
        this._sync();
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._removeEntries();
    }

    _sync() {
        if (this._settings.get_boolean('background-menu-entry'))
            this._addEntries();
        else
            this._removeEntries();
    }

    _addEntries() {
        if (this._gnomeOpen)
            return;
        const gnomeOpen = BackgroundMenu.prototype.open;
        const openPreferences = this._openPreferences;
        this._gnomeOpen = gnomeOpen;
        BackgroundMenu.prototype.open = function (...args) {
            if (!this._scmEntry) {
                this._scmEntry = this.addAction(ENTRY_TITLE, openPreferences);
                this.moveMenuItem(this._scmEntry, 1);
            }
            return gnomeOpen.apply(this, args);
        };
    }

    _removeEntries() {
        if (!this._gnomeOpen)
            return;
        BackgroundMenu.prototype.open = this._gnomeOpen;
        this._gnomeOpen = null;
        for (const manager of Main.layoutManager._bgManagers ?? []) {
            const menu = manager.backgroundActor?._backgroundMenu;
            menu?._scmEntry?.destroy();
            if (menu)
                delete menu._scmEntry;
        }
    }
}
