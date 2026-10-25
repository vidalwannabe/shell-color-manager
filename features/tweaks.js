import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Each CSS tweak: its setting, and the class added to the shell while it is on
// (see styles/tweaks.css).
const TWEAK_CLASSES = {
    'hide-borders': 'scm-hide-borders',
    'merge-arrow-buttons': 'scm-merge-arrows',
    'calendar-background': 'scm-calendar-card',
};

// The CSS tweaks of the General tab. "Disable Quick Settings dimming" is not CSS:
// it lives in quickSettingsMenus.js.
export class Tweaks {
    constructor(settings) {
        this._settings = settings;
        settings.connectObject('changed', () => this._sync(), this);
        this._sync();
    }

    destroy() {
        this._settings.disconnectObject(this);
        for (const className of Object.values(TWEAK_CLASSES))
            Main.layoutManager.uiGroup.remove_style_class_name(className);
    }

    _sync() {
        for (const [key, className] of Object.entries(TWEAK_CLASSES)) {
            if (this._settings.get_boolean(key))
                Main.layoutManager.uiGroup.add_style_class_name(className);
            else
                Main.layoutManager.uiGroup.remove_style_class_name(className);
        }
    }
}
