# Stylesheets

Where each color paints. extension.js reads these five files in this order, joins them,
leaves out their comments and fills every `{{marker}}` before loading the result into
GNOME Shell:

1. `shell.css`: top bar, menus, OSD, switchers, overview, app grid, search and dash
2. `quick-settings.css`: toggles, round buttons, sliders and the menus they open
3. `notification-panel.css`: notifications, calendar, Today, World Clocks, Weather and the media player
4. `tweaks.css`: the options of the General tab, each under its own class
5. `borders.css`: Customize borders, of the General tab

## Markers

- **Colors**: one per color of `colors.js` (`{{panel-fg}}`, `{{qs-active}}`, `{{card}}`...),
  from the settings of the current mode. A word such as `accent` becomes the matching CSS
  value (`-st-accent-color`).
- **Mode values** (`STYLE_VALUES` in extension.js), different in light and dark mode:
  - `{{shade}}`: lights a color up on hover: `st-darken` in light mode, `st-lighten` in dark
  - `{{unshade}}`: the opposite of `{{shade}}`, for disabled buttons
  - `{{focus}}`: the tint of a focused button
  - the others are listed at the top of the file that uses them
- **Pictures**: `{{event-dot}}` and `{{today-event-dot}}`, the dot under calendar days with
  events. GNOME's is an SVG in a fixed color, so extension.js writes one in the color of
  `{{fg}}` and of `{{qs-active-fg}}` and gives its `url()`.

## Button states

Buttons follow GNOME 48's own states, always with the same amounts: hover +4%, click +9%,
focus 5% tint, disabled 3% the other way. Extension stylesheets rank above GNOME's whatever
the specificity, so every state GNOME draws has to be written again here.
