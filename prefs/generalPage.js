import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {colorSetGroup} from './colorSetSelector.js';
import {
    alert, CappedDropDown, clock, colorSetDialog, DESTRUCTIVE, flatButton, sliderRow, SUGGESTED,
    switchRow, timeButton,
} from './widgets.js';

// The General tab: general color sets, visual tweaks, easy access, automatic switch and backup.
// `colorSets` is createColorSets() of profiles.js.
export function generalPage(context, colorSets, uuid) {
    const page = new Adw.PreferencesPage({title: 'General', icon_name: 'preferences-desktop-appearance-symbolic'});
    page.add(generalColorSetGroup(context, colorSets));
    page.add(tweaksGroup(context));
    page.add(easyAccessGroup(context));
    page.add(autoSwitchGroup(context));
    page.add(backupGroup(context, colorSets, uuid));
    return page;
}

// ---------- General color sets ----------

// A general color set pairs a light and a dark color set and applies both.
function generalColorSetGroup(context, {general, light, dark}) {
    const side = (mode, name) => general.exists(mode, name) ? name : `${name} (deleted)`;

    // The light and dark color set choices, with the given ones selected.
    const sides = (lightName, darkName) => [
        {title: 'Light mode color set', names: light.all().map(set => set.name), selected: lightName},
        {title: 'Dark mode color set', names: dark.all().map(set => set.name), selected: darkName},
    ];

    // Saving asks a name and the color sets: the ones applied in each tab, or the tab's default
    // when its colors are unsaved. Only saved: applying it here would overwrite unsaved colors.
    const addButton = flatButton({icon_name: 'media-floppy-symbolic', tooltip_text: 'New general color set'});
    addButton.connect('clicked', () => colorSetDialog(context, name => general.taken(name), (name, l, d) => {
        general.save([...general.own(), {name, light: l, dark: d}]);
    }, {
        combos: sides(light.applied()?.name ?? light.builtIn[0].name, dark.applied()?.name ?? dark.builtIn[0].name),
        heading: 'New general color set',
    }));

    // Editing changes the name and the color sets of a general color set.
    const editButton = (set, close) => {
        const button = flatButton({icon_name: 'document-edit-symbolic', tooltip_text: 'Edit'});
        button.connect('clicked', () => {
            close();
            colorSetDialog(context, name => general.taken(name), (name, l, d) => {
                general.save(general.own().map(other => other.name === set.name ? {name, light: l, dark: d} : other));
                if (name !== set.name && general.activeName() === set.name)
                    general.setActive(name);
            }, {combos: sides(set.light, set.dark), heading: 'Edit general color set', initial: set.name, action: 'Save'});
        });
        return button;
    };

    return colorSetGroup(context, {
        groupTitle: 'General color sets', title: 'Color set',
        subtitle: 'Create or load a light and a dark mode color set at once',
        model: general, addButton, editButton,
        describe: set => `Light: ${side(light, set.light)} · Dark: ${side(dark, set.dark)}`,
    });
}

// ---------- Visual tweaks ----------

const DASH_TO_PANEL = 'dash-to-panel@jderose9.github.com';
const DTP_SUBTITLE = "Prioritize this extension's color settings";

function tweaksGroup(context) {
    const group = new Adw.PreferencesGroup({title: 'Visual tweaks'});
    sliderRow(context, group, 'transition-duration', {
        title: 'Transition', subtitle: 'Fade duration when switching between light and dark mode',
        max: 2000, step: 100, unit: ' ms',
    });
    switchRow(context, group, 'hide-borders', 'Disable borders',
        'Removes the borders of menus and cards');
    switchRow(context, group, 'no-qs-dimming', 'Disable Quick Settings dimming',
        'Keeps Quick Settings bright while a toggle menu is open');
    switchRow(context, group, 'merge-arrow-buttons', 'Merge arrows into toggles',
        "Each Quick Settings arrow (›) takes its toggle's color, without the gap line between them");
    switchRow(context, group, 'calendar-background', 'Calendar as card',
        'Gives the calendar the card background and removes the circles behind days');
    const dtpRow = switchRow(context, group, 'override-dtp-colors', "Use this extension's colors in Dash to Panel",
        DTP_SUBTITLE);
    dtpRow.set_sensitive(false);
    watchDashToPanel(context, installed => showDashToPanel(context, dtpRow, installed));
    return group;
}

// The Dash to Panel row is only active while Dash to Panel is installed. The first time it is
// found, a dialog tells about the colors both extensions set.
function showDashToPanel(context, row, installed) {
    const {settings} = context;
    row.set_sensitive(installed);
    row.set_subtitle(installed ? DTP_SUBTITLE : 'Dash to Panel is not installed');
    if (!installed || settings.get_boolean('dtp-notice-shown'))
        return;
    settings.set_boolean('dtp-notice-shown', true);
    if (settings.get_boolean('override-dtp-colors'))
        return;
    alert({
        heading: 'Dash to Panel detected',
        body: 'Dash to Panel paints its panel and window previews with its own color and opacity ' +
            'settings, so the two extensions can show mismatched colors. Turn on “Use this ' +
            "extension's colors in Dash to Panel” (General tab) to prioritize this extension's " +
            'color settings.\n\n' +
            "Dash to Panel's own color settings are left untouched and take effect again if this " +
            'option is turned off.',
    }, [['later', 'Not now'], ['on', 'Turn on', SUGGESTED]], () => settings.set_boolean('override-dtp-colors', true))
        .present(context.window);
}

// Whether Dash to Panel is installed, asked to GNOME Shell over D-Bus (any install folder)
// and followed while the window is open.
const SHELL_EXTENSIONS = ['org.gnome.Shell.Extensions', '/org/gnome/Shell/Extensions', 'org.gnome.Shell.Extensions'];
const UNINSTALLED = 99;
function watchDashToPanel(context, onChange) {
    let closed = false;
    context.onClose(() => (closed = true));
    const report = installed => {
        if (!closed)
            onChange(installed);
    };
    Gio.bus_get(Gio.BusType.SESSION, null, (_object, busResult) => {
        let bus;
        try {
            bus = Gio.bus_get_finish(busResult);
        } catch {
            report(false);
            return;
        }
        if (closed)
            return;
        bus.call(...SHELL_EXTENSIONS, 'GetExtensionInfo', new GLib.Variant('(s)', [DASH_TO_PANEL]),
            null, Gio.DBusCallFlags.NONE, -1, null, (_bus, result) => {
                try {
                    const [info] = bus.call_finish(result).recursiveUnpack();
                    report(Object.keys(info).length > 0 && info.state !== UNINSTALLED);
                } catch {
                    report(false);
                }
            });
        const id = bus.signal_subscribe(SHELL_EXTENSIONS[0], SHELL_EXTENSIONS[2], 'ExtensionStateChanged',
            SHELL_EXTENSIONS[1], null, Gio.DBusSignalFlags.NONE, (...args) => {
                const [uuid, info] = args[5].recursiveUnpack();
                if (uuid === DASH_TO_PANEL)
                    report(info.state !== UNINSTALLED);
            });
        context.onClose(() => bus.signal_unsubscribe(id));
    });
}

// ---------- Easy access ----------

function easyAccessGroup(context) {
    const group = new Adw.PreferencesGroup({title: 'Easy access'});
    switchRow(context, group, 'background-menu-entry', 'Desktop menu entry',
        'Adds “Shell Color Manager…” to the desktop right-click menu, below Change Background');
    switchRow(context, group, 'quick-settings-profiles', 'Quick Settings color sets',
        'Adds a Quick Settings button to switch the color sets of the current mode');
    return group;
}

// ---------- Automatic switch ----------

const MODES = [['light', 'Light mode'], ['dark', 'Dark mode']];

// One row: the mode, and the two times it is on between; the opposite mode the rest of the
// day. Equal times turn the switch off: both times are marked and the subtitle says so.
function autoSwitchGroup(context) {
    const {settings} = context;
    const group = new Adw.PreferencesGroup({title: 'Automatic switch'});
    const enable = switchRow(context, group, 'auto-switch', 'Enable',
        'Uses one mode between two times of day and the other the rest of the day');

    const row = new Adw.ActionRow({title: 'Schedule'});
    const mode = new CappedDropDown({valign: Gtk.Align.CENTER, model: Gtk.StringList.new(MODES.map(([, label]) => label))});
    mode.connect('notify::selected', () => {
        const id = MODES[mode.get_selected()]?.[0];
        if (id && id !== settings.get_string('auto-switch-1-mode'))
            settings.set_string('auto-switch-1-mode', id);
    });
    const start = timeButton(context, 'auto-switch-1-time');
    const end = timeButton(context, 'auto-switch-2-time');
    row.add_suffix(mode);
    row.add_suffix(start);
    row.add_suffix(new Gtk.Label({label: '–'}));
    row.add_suffix(end);

    const show = () => {
        const dark = settings.get_string('auto-switch-1-mode') === 'dark';
        if (mode.get_selected() !== Number(dark))
            mode.set_selected(Number(dark));
        const first = settings.get_int('auto-switch-1-time');
        const second = settings.get_int('auto-switch-2-time');
        for (const button of [start, end]) {
            if (first === second)
                button.add_css_class('error');
            else
                button.remove_css_class('error');
        }
        row.set_subtitle(first === second
            ? 'Choose two different times, switching is off until then'
            : `${MODES[Number(dark)][1]} from ${clock(first)} to ${clock(second)}, ` +
              `${MODES[Number(!dark)][1].toLowerCase()} the rest of the day`);
    };
    show();
    for (const key of ['auto-switch-1-mode', 'auto-switch-1-time', 'auto-switch-2-time'])
        context.watch(key, show);

    enable.bind_property('active', row, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
    group.add(row);
    return group;
}

// The shell turned the automatic switch off because the mode was changed by hand: said once,
// when the preferences open.
export function autoSwitchOffNotice(context) {
    const {settings} = context;
    if (!settings.get_boolean('auto-switch-off-notice'))
        return;
    settings.set_boolean('auto-switch-off-notice', false);
    let closed = false;
    context.onClose(() => (closed = true));
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        if (!closed) {
            alert({
                heading: 'Automatic switch turned off',
                body: 'The mode was changed manually while the automatic switch was on, so it was ' +
                    'turned off to keep your choice. You can turn it on again in the General tab.',
            }, [['ok', 'Keep it off'], ['on', 'Turn on again', SUGGESTED]],
            () => settings.set_boolean('auto-switch', true)).present(context.window);
        }
        return GLib.SOURCE_REMOVE;
    });
}

// ---------- Backup ----------

const BACKUP_FILE = 'shell-color-manager-settings.json';
// Backups made before the rename to Shell Color Manager carry the old UUID.
const OLD_UUID = 'light-mode-manager@vidalwannabe.github.io';
// Internal state stays out of backups: an old switch time would switch the mode on import.
const NOT_BACKED_UP = ['auto-switch-applied', 'dtp-notice-shown', 'auto-switch-off-notice'];
const COLOR_SET_KEYS = ['profiles', 'profiles-dark', 'general-profiles'];

function backupGroup(context, colorSets, uuid) {
    const group = new Adw.PreferencesGroup({title: 'Backup'});
    const row = new Adw.ActionRow({title: 'Settings', subtitle: 'Exports or imports colors, color sets and options as JSON'});
    const importButton = new Gtk.Button({label: 'Import', valign: Gtk.Align.CENTER});
    importButton.connect('clicked', () => importSettings(context, colorSets, uuid));
    const exportButton = new Gtk.Button({label: 'Export', valign: Gtk.Align.CENTER});
    exportButton.connect('clicked', () => exportSettings(context, uuid));
    row.add_suffix(importButton);
    row.add_suffix(exportButton);
    group.add(row);
    return group;
}

const backupKeys = settings => settings.settings_schema.list_keys().filter(key => !NOT_BACKED_UP.includes(key));

const jsonFilter = () => {
    const filter = new Gtk.FileFilter({name: 'JSON files'});
    filter.add_pattern('*.json');
    const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
    filters.append(filter);
    return filters;
};

// Cancelling a file dialog is not an error worth reporting.
const dismissed = e => e.matches?.(Gtk.DialogError, Gtk.DialogError.DISMISSED);

// Every setting as GVariant text, so types survive the round trip.
function exportSettings(context, uuid) {
    const {settings} = context;
    const dialog = new Gtk.FileDialog({title: 'Export settings', initial_name: BACKUP_FILE, filters: jsonFilter()});
    dialog.save(context.window, null, (_dialog, result) => {
        try {
            const file = dialog.save_finish(result);
            const values = Object.fromEntries(backupKeys(settings).map(key => [key, settings.get_value(key).print(true)]));
            const json = JSON.stringify({extension: uuid, version: 1, settings: values}, null, 2);
            file.replace_contents(new TextEncoder().encode(json), null, false,
                Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            context.toast('Settings exported');
        } catch (e) {
            if (!dismissed(e))
                context.toast(`Export failed: ${e.message}`);
        }
    });
}

function importSettings(context, colorSets, uuid) {
    const dialog = new Gtk.FileDialog({title: 'Import settings', filters: jsonFilter()});
    dialog.open(context.window, null, (_dialog, result) => {
        let values;
        try {
            values = readSettingsFile(context.settings, dialog.open_finish(result), uuid);
        } catch (e) {
            if (!dismissed(e))
                context.toast(`Import failed: ${e.message}`);
            return;
        }
        alert({
            heading: 'Import settings',
            body: 'Add the color sets from this file to yours, or replace all current settings with it?',
        }, [['cancel', 'Cancel'], ['replace', 'Replace all', DESTRUCTIVE], ['add', 'Add color sets', SUGGESTED]],
        response => {
            if (response === 'replace') {
                replaceAll(context.settings, values);
                context.toast('Settings replaced');
            } else {
                const count = addColorSets(colorSets, values);
                context.toast(count ? `${count} color set${count > 1 ? 's' : ''} added` : 'No new color sets to add');
            }
        }).present(context.window);
    });
}

// Reads and checks a settings file: every key of the schema as a GVariant, or null when the
// file lacks it. Throws on anything invalid, before any change.
function readSettingsFile(settings, file, uuid) {
    const [, bytes] = file.load_contents(null);
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (![uuid, OLD_UUID].includes(data?.extension) || typeof data.settings !== 'object' || !data.settings)
        throw new Error('not a Shell Color Manager settings file');
    const schema = settings.settings_schema;
    return new Map(backupKeys(settings).map(key => {
        const text = data.settings[key];
        if (typeof text !== 'string')
            return [key, null];
        const value = GLib.Variant.parse(schema.get_key(key).get_value_type(), text, null, null);
        if (!schema.get_key(key).range_check(value))
            throw new Error(`invalid value for ${key}`);
        // Color set lists must be JSON lists, or "Replace all" would wipe them.
        if (COLOR_SET_KEYS.includes(key)) {
            let list;
            try {
                list = JSON.parse(value.unpack());
            } catch {
                list = null;
            }
            if (!Array.isArray(list))
                throw new Error(`invalid color sets in ${key}`);
        }
        return [key, value];
    }));
}

// Replaces every setting; keys missing from the file go back to their default.
function replaceAll(settings, values) {
    settings.delay();
    for (const [key, value] of values) {
        if (value)
            settings.set_value(key, value);
        else
            settings.reset(key);
    }
    settings.apply();
}

// Adds the file's own color sets without removing or overwriting anything. One already
// saved with the same name and content is skipped; a different one with a name in use gets a
// number, and general color sets follow those renamed light and dark ones. Returns how many
// color sets were added.
function addColorSets({light, dark, general}, values) {
    const listIn = key => {
        try {
            const list = JSON.parse(values.get(key)?.unpack() ?? '[]');
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    };
    const lightAdded = addToList(light, listIn('profiles'), set => ({colors: set.colors}));
    const darkAdded = addToList(dark, listIn('profiles-dark'), set => ({colors: set.colors}));
    const generalAdded = addToList(general, listIn('general-profiles'), set => ({
        light: lightAdded.names.get(set.light) ?? set.light,
        dark: darkAdded.names.get(set.dark) ?? set.dark,
    }));
    return lightAdded.count + darkAdded.count + generalAdded.count;
}

// Adds `incoming` to `model`'s saved list. content(set) is what a set holds besides its name.
// Already there, under its name or a numbered copy of it ("Name (2)"): skipped. Returns how
// many were added, and the name each incoming set ended up with.
function addToList(model, incoming, content) {
    const own = model.own();
    const added = [];
    const names = new Map();
    const isNumberedCopy = (name, base) => name.startsWith(`${base} (`) && /\(\d+\)$/.test(name);
    for (const set of incoming) {
        if (typeof set?.name !== 'string' || !set.name.trim() || !model.isValid(set))
            continue;
        const entry = {name: set.name.trim(), ...content(set)};
        const signature = JSON.stringify(content(entry));
        const same = own.find(other => (other.name === entry.name || isNumberedCopy(other.name, entry.name)) &&
            JSON.stringify(content(other)) === signature);
        if (same) {
            names.set(set.name, same.name);
            continue;
        }
        let name = entry.name;
        for (let i = 2; model.taken(name) || added.some(other => other.name === name); i++)
            name = `${entry.name} (${i})`;
        names.set(set.name, name);
        added.push({...entry, name});
    }
    if (added.length)
        model.save([...own, ...added]);
    return {count: added.length, names};
}
