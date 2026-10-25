import GLib from 'gi://GLib';

// The folders GTK 3 reads in a theme (gtk-3.0 to gtk-3.24).
const GTK3_SUBDIRS = Array.from({length: 13}, (_v, i) => `gtk-3.${i * 2}`);

// Legacy GTK 3 apps do not follow GNOME's light and dark mode: their theme is switched
// between "Theme" and "Theme-dark" instead, only to a theme that is installed.
export function syncGtk3Theme(desktopSettings) {
    const theme = desktopSettings.get_string('gtk-theme');
    const dark = desktopSettings.get_string('color-scheme') === 'prefer-dark';
    const isDarkTheme = theme.endsWith('-dark');
    let next = theme;
    if (dark && !isDarkTheme)
        next = `${theme}-dark`;
    else if (!dark && isDarkTheme)
        next = theme.slice(0, -'-dark'.length);
    if (next !== theme && gtk3ThemeExists(next))
        desktopSettings.set_string('gtk-theme', next);
}

// Built in (Adwaita), or installed in one of GTK 3's theme folders.
function gtk3ThemeExists(name) {
    if (name === 'Adwaita' || name === 'Adwaita-dark')
        return true;
    if (!name)
        return false;
    const folders = [GLib.get_user_data_dir(), ...GLib.get_system_data_dirs()]
        .map(dir => GLib.build_filenamev([dir, 'themes']));
    folders.push(GLib.build_filenamev([GLib.get_home_dir(), '.themes']));
    return folders.some(folder => GTK3_SUBDIRS.some(sub =>
        GLib.file_test(GLib.build_filenamev([folder, name, sub]), GLib.FileTest.IS_DIR)));
}
