import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {alert, DESTRUCTIVE, SUGGESTED} from './widgets.js';

// The Backup group of the General tab: exports every setting to a JSON file, and imports one
// either by adding its color sets to yours or by replacing every setting.

const BACKUP_FILE = 'shell-color-manager-settings.json';
// Backups made before the rename to Shell Color Manager carry the old UUID.
const OLD_UUID = 'light-mode-manager@vidalwannabe.github.io';
// Internal state stays out of backups: an old switch time would switch the mode on import.
const NOT_BACKED_UP = ['auto-switch-applied', 'auto-switch-off-notice'];
const COLOR_SET_KEYS = ['profiles', 'profiles-dark', 'general-profiles'];

export function backupGroup(context, colorSets, uuid) {
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
