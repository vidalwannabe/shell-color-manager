import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

// Rows, buttons and dialogs shared by the tabs. Most take the window's context (see
// prefs.js): {window, settings, watch(key, fn), onClose(fn), toast(title)}.

export const {SUGGESTED, DESTRUCTIVE} = Adw.ResponseAppearance;

export function flatButton(props) {
    const button = new Gtk.Button({valign: Gtk.Align.CENTER, ...props});
    button.add_css_class('flat');
    return button;
}

// ---------- Selectors ----------

// Selectors are as wide as their text, up to 190px (a longer text is ellipsized).
const SELECTOR_MAX_WIDTH = 190;
const capWidth = ([min, nat, minBaseline, natBaseline], orientation) => orientation === Gtk.Orientation.HORIZONTAL
    ? [Math.min(min, SELECTOR_MAX_WIDTH), Math.min(nat, SELECTOR_MAX_WIDTH), minBaseline, natBaseline]
    : [min, nat, minBaseline, natBaseline];

// Each class needs its own name: GJS names the GType after it.
const CappedMenuButton = GObject.registerClass(class CappedMenuButton extends Gtk.MenuButton {
    vfunc_measure(orientation, forSize) {
        return capWidth(super.vfunc_measure(orientation, forSize), orientation);
    }
});

export const CappedDropDown = GObject.registerClass(class CappedDropDown extends Gtk.DropDown {
    vfunc_measure(orientation, forSize) {
        return capWidth(super.vfunc_measure(orientation, forSize), orientation);
    }
});

// A selector menu button: showLabel(text) shows `text`.
export function selectorButton(props) {
    const label = new Gtk.Label({ellipsize: Pango.EllipsizeMode.END});
    const button = new CappedMenuButton({child: label, always_show_arrow: true, valign: Gtk.Align.CENTER, ...props});
    button.showLabel = text => label.set_label(text);
    return button;
}

// ---------- Dialogs ----------

// An alert dialog with `responses` ([id, label, appearance]): the first one closes it, the
// last one is the default when suggested, and onResponse(id) gets the others.
export function alert(props, responses, onResponse) {
    const dialog = new Adw.AlertDialog(props);
    for (const [id, label, appearance] of responses) {
        dialog.add_response(id, label);
        if (appearance)
            dialog.set_response_appearance(id, appearance);
    }
    const [close] = responses[0];
    const [last, , appearance] = responses.at(-1);
    dialog.set_close_response(close);
    if (appearance === SUGGESTED)
        dialog.set_default_response(last);
    dialog.connect('response', (_dialog, id) => {
        if (id !== close)
            onResponse(id);
    });
    return dialog;
}

export function confirm(context, heading, body, label, onConfirm) {
    alert({heading, body}, [['cancel', 'Cancel'], ['ok', label, DESTRUCTIVE]], onConfirm).present(context.window);
}

// Asks for a color set name, plus one choice per entry of `combos` ({title, names,
// selected}). taken(name) says whether a name is already used. `initial` prefills the name
// (renaming: keeping it unchanged is allowed); `action` is the confirm button's label.
export function colorSetDialog(context, taken, onConfirm,
    {combos = [], heading = 'New color set', initial = '', action = 'Save'} = {}) {
    const fields = new Gtk.ListBox({selection_mode: Gtk.SelectionMode.NONE});
    fields.add_css_class('boxed-list');
    const entry = new Adw.EntryRow({title: 'Color set name', text: initial});
    fields.append(entry);
    const choices = combos.map(({title, names, selected}) => {
        const row = new Adw.ComboRow({title, model: Gtk.StringList.new(names)});
        row.set_selected(Math.max(0, names.indexOf(selected)));
        fields.append(row);
        return () => names[row.get_selected()];
    });

    const name = () => entry.get_text().trim();
    const valid = () => name() !== '' && (name() === initial || !taken(name()));
    const done = () => onConfirm(name(), ...choices.map(choice => choice()));
    const dialog = alert({heading, extra_child: fields}, [['cancel', 'Cancel'], ['ok', action, SUGGESTED]], done);
    entry.connect('changed', () => dialog.set_response_enabled('ok', valid()));
    dialog.set_response_enabled('ok', valid());
    entry.connect('entry-activated', () => {
        if (valid()) {
            done();
            dialog.close();
        }
    });
    dialog.present(context.window);
    entry.grab_focus();
}

// ---------- Rows ----------

// A switch row bound to a true/false setting, in a group or under an expander row.
export function switchRow(context, group, key, title, subtitle) {
    const row = new Adw.SwitchRow({title, subtitle});
    context.settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    if (group instanceof Adw.ExpanderRow)
        group.add_row(row);
    else
        group.add(row);
    return row;
}

// An expander row whose switch is bound to a true/false setting: its rows open, and apply,
// only while it is on.
export function expanderSwitchRow(context, group, key, title, subtitle) {
    const row = new Adw.ExpanderRow({title, subtitle, show_enable_switch: true});
    context.settings.bind(key, row, 'enable-expansion', Gio.SettingsBindFlags.DEFAULT);
    group.add(row);
    return row;
}

// A row bound to a number setting: its value, and − and + buttons that move it by `step`,
// from 0 to `max`. There is no other way to set it.
export function stepperRow(context, group, key, {title, subtitle, max, step, unit}) {
    const {settings} = context;
    const row = new Adw.ActionRow({title, subtitle});
    const label = new Gtk.Label({width_chars: 7, xalign: 1, valign: Gtk.Align.CENTER});
    label.add_css_class('numeric');
    const minus = new Gtk.Button({icon_name: 'list-remove-symbolic', tooltip_text: `−${step}${unit}`});
    const plus = new Gtk.Button({icon_name: 'list-add-symbolic', tooltip_text: `+${step}${unit}`});
    const buttons = new Gtk.Box({valign: Gtk.Align.CENTER});
    buttons.add_css_class('linked');
    buttons.append(minus);
    buttons.append(plus);

    const show = () => {
        const value = settings.get_int(key);
        label.set_label(`${value}${unit}`);
        minus.set_sensitive(value > 0);
        plus.set_sensitive(value < max);
    };
    show();
    // Goes to the next multiple of `step`, should the saved value be between two.
    const move = direction => {
        const steps = settings.get_int(key) / step;
        const value = (direction > 0 ? Math.floor(steps) + 1 : Math.ceil(steps) - 1) * step;
        settings.set_int(key, Math.min(max, Math.max(0, value)));
    };
    minus.connect('clicked', () => move(-1));
    plus.connect('clicked', () => move(1));
    context.watch(key, show);

    row.add_suffix(label);
    row.add_suffix(buttons);
    group.add(row);
    return row;
}

// Minutes since midnight as "07:00".
export const clock = minutes =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// A time button ("07:00") bound to a setting in minutes since midnight; it opens hour and
// minute spin buttons in a popover.
export function timeButton(context, key) {
    const {settings} = context;
    const spin = max => {
        const button = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({lower: 0, upper: max, step_increment: 1, page_increment: 10}),
            wrap: true, numeric: true, width_chars: 2, orientation: Gtk.Orientation.VERTICAL,
        });
        // Always two digits: 07, not 7.
        button.connect('output', () => {
            button.set_text(String(button.get_value_as_int()).padStart(2, '0'));
            return true;
        });
        return button;
    };
    const hours = spin(23);
    const minutes = spin(59);
    const picker = new Gtk.Box({spacing: 6, margin_top: 6, margin_bottom: 6, margin_start: 6, margin_end: 6});
    picker.append(hours);
    picker.append(new Gtk.Label({label: ':'}));
    picker.append(minutes);
    const button = new Gtk.MenuButton({popover: new Gtk.Popover({child: picker}), valign: Gtk.Align.CENTER});
    button.add_css_class('numeric');

    let showing = false;
    const show = () => {
        const value = settings.get_int(key);
        button.set_label(clock(value));
        showing = true;
        hours.set_value(Math.floor(value / 60));
        minutes.set_value(value % 60);
        showing = false;
    };
    show();
    const save = () => {
        const value = hours.get_value_as_int() * 60 + minutes.get_value_as_int();
        if (!showing && value !== settings.get_int(key))
            settings.set_int(key, value);
    };
    hours.connect('value-changed', save);
    minutes.connect('value-changed', save);
    context.watch(key, show);
    return button;
}

// Runs fn() once, a moment later, however often it is asked for before then: applying a
// color set changes several settings at once. Dropped when the window closes.
export function oncePerChange(context, fn) {
    let id = 0;
    context.onClose(() => {
        if (id)
            GLib.Source.remove(id);
        id = 0;
    });
    return () => {
        id ||= GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            id = 0;
            fn();
            return GLib.SOURCE_REMOVE;
        });
    };
}
