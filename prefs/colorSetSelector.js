import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {confirm, flatButton, oncePerChange, selectorButton} from './widgets.js';

// One-line color set rows in the selectors, instead of libadwaita's 50px rows (see prefs.js).
export const SELECTOR_CSS =
    'list.lmm-profile-list > row, list.lmm-profile-list > row > box.header { min-height: 0; }' +
    'list.lmm-profile-list > row > box.header { padding-top: 2px; padding-bottom: 2px; }' +
    'list.lmm-profile-list button { min-height: 26px; min-width: 26px; padding: 0; }';

// A color set group: one row with a selector button and `addButton`. The selector lists the
// color sets of `model` (profiles.js), checks the one the current colors match and applies
// the one clicked. Each of the user's own gets a send button (`sendTo`: {model, label} of the
// other mode, for the Light and Dark tabs), the button editButton(set, close) makes (close()
// closes the selector) and a delete button. describe(set) is a row's subtitle.
export function colorSetGroup(context, {groupTitle = 'Color sets', title, subtitle, model, describe, addButton,
    sendTo, editButton}) {
    const list = new Gtk.ListBox({selection_mode: Gtk.SelectionMode.NONE});
    list.add_css_class('boxed-list');
    list.add_css_class('lmm-profile-list');
    const popover = new Gtk.Popover({child: new Gtk.ScrolledWindow({
        child: list, propagate_natural_height: true, max_content_height: 360,
        hscrollbar_policy: Gtk.PolicyType.NEVER, width_request: 300,
    })});
    const selector = selectorButton({popover, tooltip_text: 'Saved color sets'});

    const setRow = (set, applied) => {
        const builtIn = model.builtIn.includes(set);
        const row = new Adw.ActionRow({title: set.name, subtitle: describe(set), activatable: true, tooltip_text: 'Apply'});
        // Every row gets the check icon so names stay aligned; only the applied one shows it.
        row.add_prefix(new Gtk.Image({icon_name: 'object-select-symbolic', opacity: set.name === applied?.name ? 1 : 0}));
        row.connect('activated', () => {
            popover.popdown();
            model.apply(set);
        });
        if (builtIn)
            return row;

        if (sendTo) {
            // A copy in the other mode's list, with the same colors (numbered if the name is
            // in use there).
            const send = flatButton({icon_name: 'document-send-symbolic', tooltip_text: `Send to ${sendTo.label}`});
            send.connect('clicked', () => {
                popover.popdown();
                const name = sendTo.model.freeName(set.name);
                sendTo.model.save([...sendTo.model.own(), {name, colors: {...set.colors}}]);
                context.toast(`“${name}” sent to ${sendTo.label}`);
            });
            row.add_suffix(send);
        }
        row.add_suffix(editButton(set, () => popover.popdown()));
        const remove = flatButton({icon_name: 'user-trash-symbolic', tooltip_text: 'Delete'});
        remove.connect('clicked', () => {
            popover.popdown();
            confirm(context, `Delete "${set.name}"?`, 'This color set will be removed.', 'Delete',
                () => model.save(model.own().filter(other => other.name !== set.name)));
        });
        row.add_suffix(remove);
        return row;
    };

    const show = () => {
        const sets = model.all();
        const applied = model.applied(sets);
        selector.showLabel(applied?.name ?? 'Unsaved');
        list.remove_all();
        for (const set of sets)
            list.append(setRow(set, applied));
    };
    show();
    const showLater = oncePerChange(context, show);
    for (const key of model.keys)
        context.watch(key, showLater);

    const row = new Adw.ActionRow({title, subtitle});
    row.add_suffix(selector);
    row.add_suffix(addButton);
    const group = new Adw.PreferencesGroup({title: groupTitle});
    group.add(row);
    return group;
}
