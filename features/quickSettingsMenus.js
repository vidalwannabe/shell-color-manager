import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {QuickSettingsItem, QuickSettingsMenu} from 'resource:///org/gnome/shell/ui/quickSettings.js';

// Added to a menu while its toggle is on (see styles/quick-settings.css).
const ACTIVE_MENU_CLASS = 'scm-active';

// Never checked, but styled as on: it only shows while apps run in the background.
const ALWAYS_ACTIVE_CLASS = 'background-apps-quick-toggle';

// The menus that Quick Settings toggles open (Wi-Fi, Bluetooth, Power...). Each one is
// prepared as it opens, in whatever panel it is: GNOME's own, or a separate panel made by
// another extension (Quick Settings Audio Panel builds its panels with libpanel).
//
// Always:
// - Active menus: CSS cannot see from a menu whether its toggle is on, so the menu gets
//   ACTIVE_MENU_CLASS while it is. The Background Apps menu always has it.
// - Menu heights: GNOME measures an open menu, and the room the buttons below make for it,
//   without a width. Text that wraps ("Turn on Bluetooth to connect to devices") then counts
//   as one line, and the menu covers the buttons below it (GNOME issue 7622). Both are
//   measured at the menus' real width instead.
//
// With "Disable Quick Settings dimming" (no-qs-dimming):
// - While one of its menus is open, a panel is darkened by its _setDimmed(), an effect drawn
//   in code, not CSS. GNOME's panel and every libpanel panel get one that does nothing.
export class QuickSettingsMenus {
    constructor(settings) {
        this._settings = settings;
        this._activeToggles = new Set();
        this._fixedPlaceholders = new Set();
        this._brightPanels = new Set();
        this._wrapOpen();
        settings.connectObject('changed::no-qs-dimming', () => this._syncDimming(), this);
        this._syncDimming();
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._menuPrototype.open = this._gnomeOpen;
        for (const toggle of this._activeToggles) {
            toggle.disconnectObject(this);
            toggle.menu.box.remove_style_class_name(ACTIVE_MENU_CLASS);
        }
        for (const placeholder of this._fixedPlaceholders)
            delete placeholder.get_preferred_height;
        this._setBright(false);
    }

    // The menus' class (QuickToggleMenu) is not exported by GNOME: its prototype is taken
    // from the menu of a throwaway item.
    _wrapOpen() {
        const item = new QuickSettingsItem({hasMenu: true});
        this._menuPrototype = Object.getPrototypeOf(item.menu);
        item.menu.destroy();
        item.destroy();

        const gnomeOpen = this._gnomeOpen = this._menuPrototype.open;
        const menus = this;
        this._menuPrototype.open = function (animate) {
            menus._prepare(this);
            // The menu itself is measured at its parent's width while it opens.
            const {actor} = this;
            actor.get_preferred_height = heightAtWidth(actor, () => actor.get_parent()?.width ?? 0);
            try {
                return gnomeOpen.call(this, animate);
            } finally {
                delete actor.get_preferred_height;
            }
        };
    }

    // A menu is opening: everything below is done once per toggle, panel or placeholder.
    _prepare(menu) {
        const toggle = menu.sourceActor;
        if (toggle && menu.box && !this._activeToggles.has(toggle)) {
            const sync = () => {
                if (toggle.checked || toggle.has_style_class_name(ALWAYS_ACTIVE_CLASS))
                    menu.box.add_style_class_name(ACTIVE_MENU_CLASS);
                else
                    menu.box.remove_style_class_name(ACTIVE_MENU_CLASS);
            };
            toggle.connectObject('notify::checked', sync, 'destroy', () => this._activeToggles.delete(toggle), this);
            this._activeToggles.add(toggle);
            sync();
        }

        // The room made for the menu: the placeholder in the toggles' grid, measured at the
        // width of the menus' overlay.
        const overlay = menu.actor?.get_parent();
        const placeholder = toggle?.get_parent()?.layout_manager?._overlay;
        if (overlay && placeholder && !this._fixedPlaceholders.has(placeholder)) {
            placeholder.get_preferred_height = heightAtWidth(overlay, () => overlay.width);
            this._fixedPlaceholders.add(placeholder);
        }

        if (this._bright)
            this._keepPanelsBright(menu);
    }

    _syncDimming() {
        this._setBright(this._settings.get_boolean('no-qs-dimming'));
    }

    _setBright(bright) {
        const prototype = QuickSettingsMenu.prototype;
        if (bright && !this._bright) {
            this._gnomeSetDimmed = prototype._setDimmed;
            prototype._setDimmed = () => {};
            // A menu may be open right now, with Quick Settings already darkened.
            this._gnomeSetDimmed.call(Main.panel.statusArea.quickSettings.menu, false);
        } else if (!bright && this._bright) {
            prototype._setDimmed = this._gnomeSetDimmed;
            for (const panel of this._brightPanels)
                delete panel._setDimmed;
            this._brightPanels.clear();
        }
        this._bright = bright;
    }

    // libpanel panels darken themselves with their own _setDimmed(): each panel holding
    // the menu gets one that does nothing.
    _keepPanelsBright(menu) {
        for (let panel = menu.actor; panel; panel = panel.get_parent()) {
            if (panel._dimEffect && typeof panel._setDimmed === 'function' && !this._brightPanels.has(panel)) {
                panel._setDimmed = () => {};
                this._brightPanels.add(panel);
            }
        }
    }
}

// get_preferred_height() of `actor`, with "any width" (-1) replaced by width() when known.
function heightAtWidth(actor, width) {
    return forWidth => {
        const w = forWidth < 0 ? width() : forWidth;
        return Clutter.Actor.prototype.get_preferred_height.call(actor, w > 0 ? w : forWidth);
    };
}
