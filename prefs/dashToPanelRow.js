import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {DASH_TO_PANEL} from '../otherExtensions.js';
import {alert, SUGGESTED, switchRow} from './widgets.js';

const DTP_SUBTITLE = "Prioritize this extension's color settings";

// The "Use this extension's colors in Dash to Panel" row of `group`. It is only active while
// Dash to Panel is installed.
export function dashToPanelRow(context, group) {
    const row = switchRow(context, group, 'override-dtp-colors', "Use this extension's colors in Dash to Panel",
        DTP_SUBTITLE);
    row.set_sensitive(false);
    watchDashToPanel(context, installed => showDashToPanel(context, row, installed));
    return row;
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
