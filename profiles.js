// Color sets ("profiles" in the settings). Used by the preferences window and by the Quick
// Settings switcher, so it only needs Gio.Settings.

import {COLOR_NAMES} from './colors.js';

// Colors added after some color sets were saved: such a color set takes the value of the
// color they came from, so it keeps its look. Shell and idle button text used to follow the
// cards' text, and the dash the cards' background.
const LEGACY_COLORS = {'panel-fg': 'fg', 'dash': 'card', 'qs-fg': 'fg'};
const colorOf = (colors, name) => colors[name] ?? colors[LEGACY_COLORS[name]];

// Before "Light Default" and "Dark Default", each tab's default was named "Default": that
// name stays reserved and still means the tab's own default.
const LEGACY_DEFAULT = 'Default';

// A list of color sets saved as JSON in `listKey`, after the fixed `builtIn` ones, with the
// last applied one remembered by name in `activeKey`. isValid(set) checks a saved one.
class SavedList {
    constructor(settings, listKey, activeKey, builtIn, isValid) {
        this._settings = settings;
        this._listKey = listKey;
        this._activeKey = activeKey;
        this.builtIn = builtIn;
        this.isValid = isValid;
        this._reserved = new Set([...builtIn.map(set => set.name), LEGACY_DEFAULT]);
        this.keys = [listKey, activeKey];
    }

    // The user's own color sets. A saved one can never take a built-in name.
    own() {
        try {
            const list = JSON.parse(this._settings.get_string(this._listKey));
            if (!Array.isArray(list))
                return [];
            return list.filter(set => typeof set?.name === 'string' && !this._reserved.has(set.name) && this.isValid(set));
        } catch {
            return [];
        }
    }

    // Built-in ones first, then the user's own in alphabetical order.
    all() {
        const own = this.own().sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}));
        return [...this.builtIn, ...own];
    }

    // A color set by name; the old "Default" is the first built-in one.
    byName(name) {
        return this.all().find(set => set.name === name) ?? (name === LEGACY_DEFAULT ? this.builtIn[0] : undefined);
    }

    save(list) {
        this._settings.set_string(this._listKey, JSON.stringify(list));
    }

    taken(name) {
        return this._reserved.has(name) || this.own().some(set => set.name === name);
    }

    // `name`, or "name (2)", "name (3)"... the first one not in use.
    freeName(name) {
        let free = name;
        for (let i = 2; this.taken(free); i++)
            free = `${name} (${i})`;
        return free;
    }

    activeName() {
        return this._settings.get_string(this._activeKey);
    }

    setActive(name) {
        this._settings.set_string(this._activeKey, name);
    }

    // Renames one of the user's own, keeping it the applied one if it was.
    rename(from, to) {
        this.save(this.own().map(set => set.name === from ? {...set, name: to} : set));
        if (this.activeName() === from)
            this.setActive(to);
    }
}

// The color sets of the Light mode or Dark mode tab. `suffix` is '' or '-dark'.
export class ColorSets extends SavedList {
    constructor(settings, suffix, builtIn) {
        super(settings, `profiles${suffix}`, `active-profile${suffix}`, builtIn,
            set => set.colors && typeof set.colors === 'object');
        this._suffix = suffix;
        this._defaults = defaultColors(settings, suffix);
        this.keys = [...this.keys, ...COLOR_NAMES.map(name => this._key(name))];
    }

    _key(name) {
        return `color-${name}${this._suffix}`;
    }

    // The colors set right now.
    current() {
        return Object.fromEntries(COLOR_NAMES.map(name => [name, this._settings.get_string(this._key(name))]));
    }

    // A color missing from the set, empty, or equal to its default is reset, so dconf only
    // keeps real changes.
    apply(set) {
        this.setActive(set.name);
        for (const name of COLOR_NAMES)
            this._setColor(name, colorOf(set.colors, name));
    }

    // Puts one color back to its value in the color set applied last (the default when that
    // color set no longer exists).
    restore(name) {
        const set = this.byName(this.activeName()) ?? this.builtIn[0];
        this._setColor(name, colorOf(set.colors, name));
    }

    _setColor(name, value) {
        if (!value || typeof value !== 'string' || value === this._defaults[name])
            this._settings.reset(this._key(name));
        else
            this._settings.set_string(this._key(name), value);
    }

    // Whether the colors set right now are those of `colors`. A missing or empty color is the
    // default one.
    _matches(colors) {
        return COLOR_NAMES.every(name =>
            (colorOf(colors, name) || this._defaults[name]) === this._settings.get_string(this._key(name)));
    }

    // The color set the current colors match, found in real time: the one applied last
    // first, otherwise any one with exactly these colors; null when none does.
    applied(sets = this.all()) {
        const active = this.byName(this.activeName());
        if (active && this._matches(active.colors))
            return active;
        return sets.find(set => this._matches(set.colors)) ?? null;
    }
}

// General color sets: each pairs a light and a dark mode color set and applies both.
export class GeneralColorSets extends SavedList {
    constructor(settings, light, dark) {
        super(settings, 'general-profiles', 'active-general-profile', [
            {name: 'Default', light: 'Light Default', dark: 'Dark Default'},
        ], set => typeof set.light === 'string' && typeof set.dark === 'string');
        this.light = light;
        this.dark = dark;
        this.keys = [...this.keys, ...light.keys, ...dark.keys];
    }

    // Whether the color set a general one points to still exists.
    exists(mode, name) {
        return !!mode.byName(name);
    }

    // A side whose color set was deleted is left as it is.
    apply(set) {
        this.setActive(set.name);
        const light = this.light.byName(set.light);
        const dark = this.dark.byName(set.dark);
        if (light)
            this.light.apply(light);
        if (dark)
            this.dark.apply(dark);
    }

    // The general color set pairing the color sets the Light and Dark tabs show now: the one
    // applied last first, otherwise any saved pair. Recognizing one never applies it.
    applied(sets = this.all()) {
        const light = this.light.applied()?.name;
        const dark = this.dark.applied()?.name;
        if (!light || !dark)
            return null;
        const pairs = set => this.light.byName(set.light)?.name === light && this.dark.byName(set.dark)?.name === dark;
        const active = this.byName(this.activeName());
        return active && pairs(active) ? active : sets.find(pairs) ?? null;
    }
}

// The schema defaults of a mode ('' for light, '-dark' for dark).
function defaultColors(settings, suffix) {
    return Object.fromEntries(COLOR_NAMES.map(name =>
        [name, settings.get_default_value(`color-${name}${suffix}`).unpack()]));
}

// Every color set model. Both tabs offer the same built-in color sets, the tab's own default
// first: "Light Default" and "Dark Default" (each mode's defaults) and "Oled" (Dark Default
// with a pure black shell background, idle buttons and cards). So a dark color set can be
// used, or started from, in light mode too.
export function createColorSets(settings) {
    const lightDefault = {name: 'Light Default', colors: defaultColors(settings, '')};
    const darkColors = defaultColors(settings, '-dark');
    const darkDefault = {name: 'Dark Default', colors: darkColors};
    const oled = {name: 'Oled', colors: {...darkColors, 'general': '#000000', 'qs-button': '#000000', 'card': '#000000'}};

    const light = new ColorSets(settings, '', [lightDefault, darkDefault, oled]);
    const dark = new ColorSets(settings, '-dark', [darkDefault, lightDefault, oled]);
    const general = new GeneralColorSets(settings, light, dark);

    // Renaming a light or dark color set also renames it in the general ones that use it.
    for (const [mode, side] of [[light, 'light'], [dark, 'dark']]) {
        const rename = mode.rename.bind(mode);
        mode.rename = (from, to) => {
            rename(from, to);
            const own = general.own();
            if (own.some(set => set[side] === from))
                general.save(own.map(set => set[side] === from ? {...set, [side]: to} : set));
        };
    }
    return {light, dark, general};
}
