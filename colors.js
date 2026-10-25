// The colors the extension offers, in the same three blocks as the stylesheets in styles/.
// Each name is a {{marker}} in those stylesheets and a key in the schema: color-<name> for
// light mode, color-<name>-dark for dark mode. The Light mode and Dark mode tabs show each
// color with its title and subtitle.
export const COLORS = {
    'Shell': {
        'panel-fg': {
            title: 'Shell text and icons',
            subtitle: 'App grid, menus, OSD, overview, password field, search, switchers and top bar',
        },
        'general': {
            title: 'Shell background',
            subtitle: 'Dash, dialogs, menus, OSD, overview, top bar and window switcher',
        },
        'dash': {
            title: 'Overview and top bar highlights',
            subtitle: 'Alt+Tab selection, app hover, dash buttons, folders, password field, search and top bar buttons',
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
            subtitle: 'Locations, notification body, times and weekdays',
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

// Every color name, in the order color sets save them.
export const COLOR_NAMES = ['panel-fg', 'general', 'dash', 'qs-fg', 'qs-button', 'qs-active-fg', 'qs-active',
    'highlight', 'fg', 'fg-muted', 'card-buttons', 'card'];
