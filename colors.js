// The colors the extension offers, in the same three blocks as the stylesheets in styles/.
// Each name is a {{marker}} in those stylesheets and a key in the schema: color-<name> for
// light mode, color-<name>-dark for dark mode. The Light mode and Dark mode tabs show each
// color with its title and subtitle, and only while its `shownWhen` settings say so.
export const COLORS = {
    'Shell': {
        'panel-fg': {
            title: 'Shell text and icons',
            subtitle: 'App grid, app names, dialogs, menus, OSD, overview, password field, search, switchers and top bar',
        },
        'general': {
            title: 'Shell background',
            subtitle: 'Dash, dialogs, menus, OSD, overview, top bar, window switcher and workspace switching',
        },
        'dash': {
            title: 'Overview and top bar highlights',
            subtitle: 'Alt+Tab selection, app hover, app names, dash buttons, dialog buttons, folders, menu items, password field, search, top bar buttons and window close buttons',
        },
        'borders': {
            title: 'Borders',
            subtitle: 'Every border: cards, dialogs, dock, folders, menus, menu items, pop-ups, Quick Settings, search, sliders and top bar',
            shownWhen: {on: ['customize-borders', 'border-colors'], off: ['hide-borders']},
        },
    },
    'Quick Settings': {
        'qs-active-fg': {
            title: 'Active button text and icons',
            subtitle: 'Active menus, media player, today in the calendar and toggles that are on',
        },
        'qs-active': {
            title: 'Active button background',
            subtitle: 'Active menus, media player, today in the calendar and toggles that are on',
        },
        'qs-fg': {
            title: 'Idle button text and icons',
            subtitle: 'Idle menus, round buttons, slider handles and toggles that are off',
        },
        'qs-button': {
            title: 'Idle button background',
            subtitle: 'Idle menus, round buttons, slider buttons, slider tracks and toggles that are off',
        },
        'highlight': {
            title: 'Volume and brightness sliders',
            subtitle: 'OSD and Quick Settings sliders',
        },
    },
    'Notification Panel': {
        'fg': {
            title: 'Card titles and icons',
            subtitle: 'Calendar, Clear button, Do Not Disturb label, notifications and their buttons, Today, Weather and World Clocks',
        },
        'fg-muted': {
            title: 'Card subtitles',
            subtitle: 'Days of other months, locations, No Notifications, notification body, times and weekdays',
        },
        'card-buttons': {
            title: 'Card buttons',
            subtitle: 'Close, collapse, expand and notification action buttons',
        },
        'card': {
            title: 'Card background',
            subtitle: 'Banners, Calendar as card, Clear button, Do Not Disturb switch, notifications, Today, Weather and World Clocks',
        },
    },
};

// Whether true/false settings are as `on` and `off` ask: all of `on` true, all of `off` false.
export function settingsSay(settings, {on = [], off = []}) {
    return on.every(key => settings.get_boolean(key)) && !off.some(key => settings.get_boolean(key));
}

// Words a color setting can hold instead of a color code: the CSS value the shell uses, and
// what the preferences show (the swatch, 'accent' being the accent color set in GNOME
// Settings, and a line under the code in its tooltip).
export const COLOR_WORDS = {
    'accent': {css: '-st-accent-color', swatch: 'accent', label: 'Accent color set in\nGNOME Settings › Appearance'},
    'accent-fg': {css: '-st-accent-fg-color', swatch: '#ffffff', label: 'Accent text color'},
};

// Accepted color codes: #rgb, #rrggbb, rgb()/rgba() or a name.
const COLOR_RE = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgba?\([\d\s.,]+\)|[a-z]+)$/i;

// A color setting as saved: a code or a word of COLOR_WORDS. Anything else (empty, edited in
// dconf or from an older version) counts as the color's default, so it never breaks the
// stylesheets.
export function readColor(settings, key) {
    const value = settings.get_string(key).trim();
    if (COLOR_WORDS[value] || COLOR_RE.test(value))
        return value;
    return settings.get_default_value(key).unpack();
}

// Every color name, in the order color sets save them.
export const COLOR_NAMES = ['panel-fg', 'general', 'dash', 'borders', 'qs-fg', 'qs-button', 'qs-active-fg', 'qs-active',
    'highlight', 'fg', 'fg-muted', 'card-buttons', 'card'];
