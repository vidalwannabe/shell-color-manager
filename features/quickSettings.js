import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {QuickMenuToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

import {createColorSets} from '../profiles.js';

const ICON = 'preferences-desktop-appearance-symbolic';

// A Quick Settings button listing the color sets of the current mode, light or dark. Picking
// one applies it; the button's subtitle shows the applied one, and it is lit while the colors
// match a color set. Its menu also opens the preferences.
const ColorSetToggle = GObject.registerClass(
class ColorSetToggle extends QuickMenuToggle {
    _init(settings, isDark, openPreferences) {
        super._init({title: 'Color Set', iconName: ICON, toggleMode: false});
        this._sets = createColorSets(settings);
        this._isDark = isDark;

        this._items = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._items);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addAction('Settings', () => {
            Main.panel.closeQuickSettings();
            openPreferences();
        });
        this.connect('clicked', () => this.menu.open());
        this.update();
    }

    // Lists the current mode's color sets, the applied one checked.
    update() {
        const dark = this._isDark();
        const sets = dark ? this._sets.dark : this._sets.light;
        const all = sets.all();
        const applied = sets.applied(all);

        this.menu.setHeader(ICON, 'Color Set', dark ? 'Dark mode' : 'Light mode');
        this._items.removeAll();
        for (const set of all) {
            const item = new PopupMenu.PopupMenuItem(set.name);
            item.setOrnament(set.name === applied?.name ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
            item.connect('activate', () => sets.apply(set));
            this._items.addMenuItem(item);
        }
        this.subtitle = applied?.name ?? 'Unsaved';
        this.checked = !!applied;
    }
});

const ColorSetIndicator = GObject.registerClass(
class ColorSetIndicator extends SystemIndicator {
    _init(settings, isDark, openPreferences) {
        super._init();
        this.toggle = new ColorSetToggle(settings, isDark, openPreferences);
        this.quickSettingsItems.push(this.toggle);
    }

    destroy() {
        this.toggle.destroy();
        super.destroy();
    }
});

// Adds the button while the setting is on, never on the lock screen: switching color sets
// changes the colors of the whole session, so it is not offered to whoever is in front of
// a locked screen.
export class QuickSettingsSwitcher {
    constructor(settings, isDark, openPreferences) {
        this._settings = settings;
        this._isDark = isDark;
        this._openPreferences = openPreferences;
        settings.connectObject('changed', (_settings, key) => {
            if (key === 'quick-settings-profiles')
                this._sync();
            else
                this.update();
        }, this);
        Main.sessionMode.connectObject('updated', () => this._sync(), this);
        this._sync();
    }

    destroy() {
        if (this._updateId)
            GLib.Source.remove(this._updateId);
        this._settings.disconnectObject(this);
        Main.sessionMode.disconnectObject(this);
        this._indicator?.destroy();
        this._indicator = null;
    }

    // The mode or the colors changed. Applying a color set changes several keys at once,
    // from a menu item that must not be destroyed while it runs, so the list is rebuilt
    // once, a moment later.
    update() {
        this._updateId ||= GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._updateId = 0;
            this._indicator?.toggle.update();
            return GLib.SOURCE_REMOVE;
        });
    }

    _sync() {
        const show = this._settings.get_boolean('quick-settings-profiles') && !Main.sessionMode.isLocked;
        if (show && !this._indicator) {
            this._indicator = new ColorSetIndicator(this._settings, this._isDark, this._openPreferences);
            Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
        } else if (!show && this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
