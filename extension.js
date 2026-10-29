import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {COLOR_NAMES, COLOR_WORDS, readColor, settingsSay} from './colors.js';
import {AutoSwitch} from './features/autoSwitch.js';
import {DashToPanel} from './features/dashToPanel.js';
import {DesktopMenu} from './features/desktopMenu.js';
import {syncGtk3Theme} from './features/gtk3Theme.js';
import {QuickSettingsSwitcher} from './features/quickSettings.js';
import {QuickSettingsMenus} from './features/quickSettingsMenus.js';
import {BORDER_CLASSES, Tweaks} from './features/tweaks.js';

// The stylesheets of the three blocks of colors.js, in the order they are loaded, then the
// tweaks of the General tab and its border options.
const STYLESHEETS = ['shell.css', 'quick-settings.css', 'notification-panel.css', 'tweaks.css', 'borders.css'];

// The settings that pick the color of {{border}} in borders.css.
const BORDER_COLOR_WHEN = BORDER_CLASSES['scm-border-colors'];
const BORDER_COLOR_KEYS = [...BORDER_COLOR_WHEN.on, ...BORDER_COLOR_WHEN.off];

// Values of the stylesheets' markers that change with GNOME's style, light or dark.
const STYLE_VALUES = {
    light: {
        'shade': 'st-darken',
        'unshade': 'st-lighten',
        'focus': '-st-accent-color',
        'arrow-shade': '5%',
        'stack-second': '4%',
        'stack-lower': '7%',
        'arrow-on-mix': '#222226, 92%',
        'calendar-border': 'rgba(0, 0, 0, 0.09)',
        'calendar-shadow': '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'added-border': 'rgba(0, 0, 0, 0.1)',
    },
    dark: {
        'shade': 'st-lighten',
        'unshade': 'st-darken',
        'focus': 'st-mix(-st-accent-color, #ffffff, 60%)',
        'arrow-shade': '8%',
        'stack-second': '6%',
        'stack-lower': '9%',
        'arrow-on-mix': '#ffffff, 85%',
        'calendar-border': 'transparent',
        'calendar-shadow': 'none',
        'added-border': 'rgba(255, 255, 255, 0.1)',
    },
};

// GNOME's accent colors (Settings › Appearance), for the pictures, which cannot use
// -st-accent-color.
const ACCENT_COLORS = {
    blue: '#3584e4', teal: '#2190a4', green: '#3a944a', yellow: '#c88800', orange: '#ed5b00',
    red: '#e62d42', pink: '#d56199', purple: '#9141ac', slate: '#6f8396',
};

// A color change fades like a mode switch when it shows on screen: the top bar always, the
// overview and the menus only while open.
const TOP_BAR_KEYS = ['color-general', 'color-panel-fg'];
const OVERVIEW_KEYS = ['color-dash'];

// How long color changes wait before applying, in ms: a color set changes several at once.
const APPLY_DELAY = 300;
// GNOME's own wait before fading out the picture of the old screen, in ms.
const TRANSITION_DELAY = 250;

// The lock screen: metadata.json lists the "unlock-dialog" session mode, so the extension stays
// enabled while the screen is locked instead of being disabled on lock and enabled on unlock.
// Otherwise every lock would switch open apps back to GNOME's "default" scheme and back, flash
// the shell between GNOME's colors and the user's, and stop the automatic switch's timer. While
// locked, only the colors stay: the Quick Settings switcher hides itself, the desktop menu does
// not exist there, and Dash to Panel hides its own panels.
export default class ShellColorManager extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        // Comments explain the stylesheets to people; the shell does not need them.
        this._template = STYLESHEETS.map(name => this._readFile(`styles/${name}`)).join('\n')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        this._cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), this.uuid]);
        this._clearCache();
        this._fileNumber = 0;

        this._useLightShell();
        syncGtk3Theme(this._interface);
        this._settings.connectObject('changed', (_settings, key) => this._settingChanged(key), this);
        this._interface.connectObject(
            'changed::color-scheme', () => this._modeChanged(),
            'changed::accent-color', () => this._applyColors(),
            this);
        this._applyColors();

        // The features of the General tab, each in its own file. Each has destroy(), and may
        // have modeChanged() to hear about light and dark mode switches.
        const isDark = () => this._isDark();
        const openPreferences = () => this.openPreferences();
        this._features = [
            new QuickSettingsMenus(this._settings),
            new Tweaks(this._settings),
            new AutoSwitch(this._settings, this._interface),
            new DesktopMenu(this._settings, openPreferences),
            new DashToPanel(isDark),
            new QuickSettingsSwitcher(this._settings, isDark, openPreferences),
        ];
    }

    // Called when the extension is turned off, uninstalled or updated, or when the session
    // ends; never on lock. Everything enable() set up is undone, and the color scheme goes
    // back to GNOME's "default".
    disable() {
        this._features.forEach(feature => feature.destroy());
        this._features = null;
        if (this._applyId)
            GLib.Source.remove(this._applyId);
        this._applyId = 0;
        this._settings.disconnectObject(this);
        this._interface.disconnectObject(this);

        this._unloadStylesheet();
        this._clearCache();
        if (this._interface.get_string('color-scheme') === 'prefer-light')
            this._interface.set_string('color-scheme', 'default');
        syncGtk3Theme(this._interface);
        this._settings = this._interface = null;
    }

    // ---------- Colors ----------

    _isDark() {
        return this._interface.get_string('color-scheme') === 'prefer-dark';
    }

    // The value of each color of a mode, ready for CSS.
    _colors(dark) {
        return Object.fromEntries(COLOR_NAMES.map(name => {
            const value = readColor(this._settings, `color-${name}${dark ? '-dark' : ''}`);
            return [name, COLOR_WORDS[value]?.css ?? value];
        }));
    }

    // A color of a mode as a plain color code, for the pictures: the words become the colors
    // they stand for.
    _plainColor(name, dark) {
        const value = readColor(this._settings, `color-${name}${dark ? '-dark' : ''}`);
        if (value === 'accent')
            return ACCENT_COLORS[this._interface.get_string('accent-color')] ?? ACCENT_COLORS.blue;
        if (value === 'accent-fg')
            return '#ffffff';
        return value;
    }

    // The dot under days with events, drawn in `color`: GNOME's is a picture in a fixed white
    // or black. Each color gets its own file, as St keeps the pictures it loaded by name.
    _eventDot(color) {
        const id = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, color, -1);
        const path = GLib.build_filenamev([this._cacheDir, `event-dot-${id}.svg`]);
        if (!GLib.file_test(path, GLib.FileTest.EXISTS)) {
            GLib.file_set_contents(path,
                `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg"><circle fill="${color}" cx="16" cy="28" r="2"/></svg>`);
        }
        return `url("${Gio.File.new_for_path(path).get_uri()}")`;
    }

    // The stylesheets with every {{marker}} replaced by its value.
    _buildCss() {
        const dark = this._isDark();
        const style = STYLE_VALUES[dark ? 'dark' : 'light'];
        const colors = this._colors(dark);
        const values = {
            ...style,
            ...colors,
            'border': settingsSay(this._settings, BORDER_COLOR_WHEN) ? colors['borders'] : style['added-border'],
            'event-dot': this._eventDot(this._plainColor('fg', dark)),
            'today-event-dot': this._eventDot(this._plainColor('qs-active-fg', dark)),
        };
        return this._template.replace(/{{([a-z-]+)}}/g, (marker, name) => values[name] ?? marker);
    }

    // ---------- Light and dark mode ----------

    // GNOME only gives the shell its light style with "prefer-light"; its "default" keeps
    // the shell dark. Light mode colors are made for the light style.
    _useLightShell() {
        if (this._interface.get_string('color-scheme') === 'default')
            this._interface.set_string('color-scheme', 'prefer-light');
    }

    _modeChanged() {
        // "default" becomes "prefer-light", which calls this again.
        if (this._interface.get_string('color-scheme') === 'default') {
            this._useLightShell();
            return;
        }
        syncGtk3Theme(this._interface);
        this._applyColors();
        this._restartFade();
        this._features?.forEach(feature => feature.modeChanged?.());
    }

    // ---------- Fades ----------

    // GNOME's Dark Style button fades out a picture of the old screen. Loading the new
    // colors takes long enough to eat that short fade, so it starts again now, with the
    // duration of the settings.
    _restartFade() {
        const transition = Main.layoutManager.screenTransition;
        const picture = transition.visible ? transition.content : null;
        if (!picture)
            return;
        // Stopping GNOME's fade hides the transition, which drops its picture.
        transition.remove_all_transitions();
        const duration = this._settings.get_int('transition-duration');
        if (!duration) {
            transition.hide();
            return;
        }
        transition.content = picture;
        transition.opacity = 255;
        transition.show();
        transition.ease({
            opacity: 0,
            duration,
            delay: TRANSITION_DELAY,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => transition.hide(),
        });
    }

    // A color of the current mode changed: applied a moment later, remembering which colors
    // changed to decide whether to fade.
    _settingChanged(key) {
        if (BORDER_COLOR_KEYS.includes(key)) {
            this._applyColors();
            return;
        }
        const suffix = this._isDark() ? '-dark' : '';
        if (!COLOR_NAMES.some(name => key === `color-${name}${suffix}`))
            return;
        (this._changedKeys ??= new Set()).add(key.replace(/-dark$/, ''));
        if (this._applyId)
            GLib.Source.remove(this._applyId);
        this._applyId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, APPLY_DELAY, () => {
            this._applyId = 0;
            this._applyColors(this._changeShows());
            return GLib.SOURCE_REMOVE;
        });
    }

    // Whether the colors changed since the last apply show on screen right now.
    _changeShows() {
        const keys = [...this._changedKeys ?? []];
        this._changedKeys = null;
        return keys.some(key => {
            if (TOP_BAR_KEYS.includes(key))
                return true;
            if (OVERVIEW_KEYS.includes(key))
                return Main.overview.visible;
            return !!Main.panel.menuManager?.activeMenu;
        });
    }

    // ---------- Stylesheet ----------

    // `fade`: the change fades in like a mode switch.
    _applyColors(fade = false) {
        const css = this._buildCss();
        if (css === this._loadedCss)
            return;
        const faded = fade && this._settings.get_int('transition-duration') > 0;
        if (faded)
            Main.layoutManager.screenTransition.run();
        this._loadStylesheet(css);
        if (faded)
            this._restartFade();
    }

    // St only reloads a stylesheet from a new file, so each one gets a new name.
    _loadStylesheet(css) {
        const path = GLib.build_filenamev([this._cacheDir, `style-${++this._fileNumber}.css`]);
        const file = Gio.File.new_for_path(path);
        try {
            GLib.file_set_contents(path, css);
            this._theme().load_stylesheet(file);
        } catch (e) {
            console.error(`[Shell Color Manager] ${e.message}`);
            if (file.query_exists(null))
                file.delete(null);
            return;
        }
        this._unloadStylesheet();
        this._loadedFile = file;
        this._loadedCss = css;
        this._clearCache(`${file.get_basename()} ${css}`);
    }

    _unloadStylesheet() {
        if (!this._loadedFile)
            return;
        this._theme().unload_stylesheet(this._loadedFile);
        this._loadedFile.delete(null);
        this._loadedFile = this._loadedCss = null;
    }

    // Removes the stylesheets and dots no longer in use, except the files named in `keep`:
    // all of them on enable(), as a session can end without disable().
    _clearCache(keep = '') {
        GLib.mkdir_with_parents(this._cacheDir, 0o755);
        const folder = Gio.File.new_for_path(this._cacheDir);
        const files = folder.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        for (let info; (info = files.next_file(null));) {
            const name = info.get_name();
            if (/\.(css|svg)$/.test(name) && !keep.includes(name))
                folder.get_child(name).delete(null);
        }
        files.close(null);
    }

    _theme() {
        return St.ThemeContext.get_for_stage(global.stage).get_theme();
    }

    _readFile(path) {
        const [, bytes] = this.dir.resolve_relative_path(path).load_contents(null);
        return new TextDecoder().decode(bytes);
    }
}
