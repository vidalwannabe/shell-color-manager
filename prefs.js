import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {createColorSets} from './colorSets.js';
import {SELECTOR_CSS} from './prefs/colorSetSelector.js';
import {colorsPage} from './prefs/colorsPage.js';
import {autoSwitchOffNotice, generalPage} from './prefs/generalPage.js';

export default class ShellColorManagerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(600, 805);
        // Narrower, the color and schedule rows squeeze their titles and controls.
        window.set_size_request(600, 185);
        window.set_search_enabled(false);

        const context = this._windowContext(window);
        const css = new Gtk.CssProvider();
        css.load_from_string(SELECTOR_CSS);
        Gtk.StyleContext.add_provider_for_display(window.get_display(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        context.onClose(() => Gtk.StyleContext.remove_provider_for_display(window.get_display(), css));

        const colorSets = createColorSets(context.settings);
        window.add(generalPage(context, colorSets, this.uuid));
        const light = colorsPage(context, {
            title: 'Light mode', icon: 'weather-clear-symbolic', suffix: '',
            model: colorSets.light, sendTo: {model: colorSets.dark, label: 'Dark mode'},
        });
        const dark = colorsPage(context, {
            title: 'Dark mode', icon: 'weather-clear-night-symbolic', suffix: '-dark',
            model: colorSets.dark, sendTo: {model: colorSets.light, label: 'Light mode'},
        });
        this._showColorTabs(context, [light.page, dark.page]);
        this._addUndoShortcuts(window, new Map([[light.page, light.history], [dark.page, dark.history]]));
        autoSwitchOffNotice(context);
    }

    // The Light mode and Dark mode tabs are in the window only while "Customize shell colors"
    // is on. They are removed, not hidden: with General alone, the window shows its title (the
    // extension's name) in place of the tab switcher, which only counts the pages added.
    _showColorTabs(context, pages) {
        const sync = () => {
            const show = context.settings.get_boolean('customize-shell-colors');
            for (const page of pages) {
                const added = !!page.get_parent();
                if (show && !added)
                    context.window.add(page);
                else if (!show && added)
                    context.window.remove(page);
            }
        };
        sync();
        context.watch('customize-shell-colors', sync);
    }

    // What the tabs share: the window, the settings, watch(key, fn) for a setting's changes,
    // onClose(fn) and toast(title). Settings handlers and anything added with onClose() are
    // dropped when the window closes, so they never run on dead widgets.
    _windowContext(window) {
        const settings = this.getSettings();
        const cleanups = [];
        window.connect('close-request', () => {
            cleanups.splice(0).forEach(cleanup => cleanup());
            return false;
        });
        return {
            window,
            settings,
            watch: (key, fn) => {
                const id = settings.connect(`changed::${key}`, fn);
                cleanups.push(() => settings.disconnect(id));
            },
            onClose: fn => cleanups.push(fn),
            toast: title => window.add_toast(new Adw.Toast({title})),
        };
    }

    // Ctrl+Z and Ctrl+Shift+Z undo and redo color changes in the open tab; each mode tab keeps
    // its own history.
    _addUndoShortcuts(window, histories) {
        const shortcuts = new Gtk.ShortcutController({scope: Gtk.ShortcutScope.MANAGED});
        for (const [trigger, action] of [['<Control>z', 'undo'], ['<Control><Shift>z', 'redo']]) {
            shortcuts.add_shortcut(new Gtk.Shortcut({
                trigger: Gtk.ShortcutTrigger.parse_string(trigger),
                action: Gtk.CallbackAction.new(() => {
                    const history = histories.get(window.get_visible_page());
                    history?.[action]();
                    return !!history;
                }),
            }));
        }
        window.add_controller(shortcuts);
    }
}
