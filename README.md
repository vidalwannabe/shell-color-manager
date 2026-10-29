# Shell Color Manager

GNOME Shell extension (GNOME 48) that customizes the shell's colors in light and dark mode, on top of GNOME's own style. Formerly Light Mode Manager. App colors are not changed.

## Features

- **Light mode and Dark mode tabs**: 13 colors per mode for the shell (top bar, dash, overview, menus, borders), Quick Settings and the notification panel. Hover and active states follow them. Ctrl+Z / Ctrl+Shift+Z undo and redo.
- **Color sets**: save, rename, update, delete and send color sets between modes. Built-in: Light Default, Dark Default and Oled.
- **General color sets**: pair a light and a dark color set and apply both at once.
- **Visual tweaks**: transition duration, border options (add everywhere, recolor, hide), no Quick Settings dimming, arrows merged into toggles, calendar as card.
- **Automatic switch**: light or dark mode between two times of day.
- **Easy access**: a desktop menu entry and a Quick Settings button to switch color sets.
- **Dash to Panel**: its panels follow the top bar color.
- **Backup**: export and import everything as JSON.

## Installation from source

```sh
git clone https://github.com/vidalwannabe/shell-color-manager.git
mkdir -p ~/.local/share/gnome-shell/extensions
ln -s "$PWD/shell-color-manager" ~/.local/share/gnome-shell/extensions/shell-color-manager@vidalwannabe.github.io
glib-compile-schemas shell-color-manager/schemas
```

Log out and back in, then enable the extension in Extension Manager or with:

```sh
gnome-extensions enable shell-color-manager@vidalwannabe.github.io
```

Your colors and color sets are stored in dconf (`/org/gnome/shell/extensions/shell-color-manager/`), not in the extension folder.

## Credits and license

Originally derived from [Luminus](https://gitlab.com/dikasetyaprayogi/luminus-project) by dikasp; light mode now uses GNOME's own light shell style. Licensed under the GPL (see COPYING).
