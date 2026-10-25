import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {backupGroup} from './backup.js';
import {colorSetGroup} from './colorSetSelector.js';
import {dashToPanelRow} from './dashToPanelRow.js';
import {
    alert, CappedDropDown, clock, colorSetDialog, flatButton, sliderRow, SUGGESTED, switchRow, timeButton,
} from './widgets.js';

// The General tab: general color sets, visual tweaks, easy access, automatic switch and backup.
// `colorSets` is createColorSets() of colorSets.js.
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
    dashToPanelRow(context, group);
    return group;
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
