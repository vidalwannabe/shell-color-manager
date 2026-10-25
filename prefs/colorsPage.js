import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {COLOR_WORDS, COLORS, readColor} from '../colors.js';
import {colorSetGroup} from './colorSetSelector.js';
import {colorSetDialog, flatButton} from './widgets.js';

const toHex = rgba => `#${[rgba.red, rgba.green, rgba.blue]
    .map(channel => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`;

// The accent color chosen in GNOME Settings (libadwaita 1.6+), GNOME's blue otherwise.
const accentColor = () => {
    const rgba = Adw.StyleManager.get_default().get_accent_color_rgba?.();
    return rgba ? toHex(rgba) : '#3584e4';
};

// The Light mode or Dark mode tab: the color set selector, then one group per block of
// colors.js. `model` is the tab's color sets, `sendTo` the other tab's ({model, label}).
// Returns the page and its undo history.
export function colorsPage(context, {title, icon, suffix, model, sendTo}) {
    const page = new Adw.PreferencesPage({title, icon_name: icon});
    page.add(modeColorSetGroup(context, model, sendTo));
    const keys = [];
    for (const [blockTitle, colors] of Object.entries(COLORS)) {
        const group = new Adw.PreferencesGroup({title: blockTitle});
        for (const [name, color] of Object.entries(colors)) {
            keys.push(`color-${name}${suffix}`);
            group.add(colorRow(context, `color-${name}${suffix}`, color, () => model.restore(name)));
        }
        page.add(group);
    }
    return {page, history: colorHistory(context, keys)};
}

// ---------- Color sets ----------

// The save button asks a name for the current colors; each saved color set's edit menu
// renames it or updates it with the current colors.
function modeColorSetGroup(context, model, sendTo) {
    const addButton = flatButton({icon_name: 'media-floppy-symbolic', tooltip_text: 'Save current colors'});
    addButton.connect('clicked', () => colorSetDialog(context, name => model.taken(name), name => {
        model.save([...model.own(), {name, colors: model.current()}]);
        model.setActive(name);
    }));

    const editButton = (set, close) => {
        const actions = new Gio.SimpleActionGroup();
        const addAction = (name, fn) => {
            const action = new Gio.SimpleAction({name});
            action.connect('activate', () => {
                close();
                fn();
            });
            actions.add_action(action);
        };
        addAction('rename', () => colorSetDialog(context, name => model.taken(name), name => {
            if (name !== set.name)
                model.rename(set.name, name);
        }, {heading: 'Rename color set', initial: set.name, action: 'Rename'}));
        addAction('update', () => {
            model.save(model.own().map(other => other.name === set.name ? {name: other.name, colors: model.current()} : other));
            model.setActive(set.name);
            context.toast(`“${set.name}” updated`);
        });
        const menu = new Gio.Menu();
        menu.append('Rename color set', 'edit.rename');
        menu.append('Update with current colors', 'edit.update');
        const button = new Gtk.MenuButton({
            icon_name: 'document-edit-symbolic', valign: Gtk.Align.CENTER, tooltip_text: 'Edit', menu_model: menu,
        });
        button.add_css_class('flat');
        button.insert_action_group('edit', actions);
        return button;
    };

    return colorSetGroup(context, {
        title: 'Color set', subtitle: 'Create, update or load a color set',
        model, addButton, editButton, describe: () => '', sendTo,
    });
}

// ---------- Colors ----------

// A color button and a button that restores the color from the color set applied last.
// The tooltip shows the color's code, and what a word (accent...) stands for. Right-click
// copies the code.
function colorRow(context, key, {title, subtitle}, restore) {
    const {settings} = context;
    const row = new Adw.ActionRow({title, subtitle});
    const button = new Gtk.ColorDialogButton({
        dialog: new Gtk.ColorDialog({with_alpha: false}),
        valign: Gtk.Align.CENTER,
    });

    // The code shown and copied. The tooltip is centered, for the two lines of a word.
    let code = '';
    let tooltip = '';
    button.set_has_tooltip(true);
    button.connect('query-tooltip', (_button, _x, _y, _keyboard, tip) => {
        tip.set_custom(new Gtk.Label({label: tooltip, justify: Gtk.Justification.CENTER}));
        return true;
    });

    // Showing the saved color also changes the button's color: that must not save it again.
    let showing = false;
    const show = () => {
        const value = readColor(settings, key);
        const word = COLOR_WORDS[value];
        const color = new Gdk.RGBA();
        color.parse(word?.swatch === 'accent' ? accentColor() : word?.swatch ?? value);
        code = toHex(color).toUpperCase();
        tooltip = word ? `${code}\n${word.label}` : code;
        showing = true;
        button.set_rgba(color);
        showing = false;
    };
    show();
    button.connect('notify::rgba', () => {
        if (!showing)
            settings.set_string(key, toHex(button.get_rgba()));
    });
    context.watch(key, show);

    const copy = new Gtk.GestureClick({button: Gdk.BUTTON_SECONDARY});
    copy.set_propagation_phase(Gtk.PropagationPhase.CAPTURE);
    copy.connect('pressed', () => {
        button.get_clipboard().set_content(Gdk.ContentProvider.new_for_bytes('text/plain;charset=utf-8',
            new GLib.Bytes(new TextEncoder().encode(code))));
        context.window.add_toast(new Adw.Toast({title: `Color code copied (${code})`, timeout: 2}));
    });
    button.add_controller(copy);

    const reset = flatButton({icon_name: 'edit-undo-symbolic', tooltip_text: 'Restore from color set'});
    reset.connect('clicked', restore);
    row.add_suffix(button);
    row.add_suffix(reset);
    return row;
}

// ---------- Undo ----------

// Ctrl+Z undoes the last color change of the tab and Ctrl+Shift+Z redoes the last undone
// one. Changes made in the same main loop iteration (a whole color set being applied) are one
// step. Every change to the tab's colors is recorded, whatever made it; a new change drops
// the steps left to redo. Returns {undo, redo}.
function colorHistory(context, keys) {
    const {settings} = context;
    const last = new Map(keys.map(key => [key, settings.get_string(key)]));
    const undos = [];
    const redos = [];
    let step = null;
    for (const key of keys) {
        context.watch(key, () => {
            const value = settings.get_string(key);
            if (value === last.get(key))
                return;
            if (!step) {
                step = new Map();
                undos.push(step);
                if (undos.length > 100)
                    undos.shift();
                redos.length = 0;
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    step = null;
                    return GLib.SOURCE_REMOVE;
                });
            }
            if (!step.has(key))
                step.set(key, last.get(key));
            last.set(key, value);
        });
    }

    // Applies a step (key -> value) and files its reverse in `into`. `last` is updated first,
    // so the handlers above do not record it as a new change.
    const travel = (from, into) => {
        const target = from.pop();
        if (!target)
            return;
        if (step === target)
            step = null;
        const reverse = new Map();
        target.forEach((value, key) => {
            reverse.set(key, last.get(key));
            last.set(key, value);
            settings.set_string(key, value);
        });
        into.push(reverse);
    };
    return {undo: () => travel(undos, redos), redo: () => travel(redos, undos)};
}
