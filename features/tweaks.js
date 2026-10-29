import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import {BarLevel} from 'resource:///org/gnome/shell/ui/barLevel.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {COLORS, settingsSay} from '../colors.js';

// Each CSS tweak: the class added to the shell while its settings say so (see settingsSay()
// in colors.js, styles/tweaks.css and styles/borders.css). The border options only apply
// under "Customize borders", and "Disable borders" turns the others off.
export const BORDER_CLASSES = {
    'scm-add-borders': {on: ['customize-borders', 'add-borders'], off: ['hide-borders']},
    'scm-border-colors': COLORS['Shell']['borders'].shownWhen,
    'scm-hide-borders': {on: ['customize-borders', 'hide-borders']},
};
const TWEAK_CLASSES = {
    ...BORDER_CLASSES,
    'scm-merge-arrows': {on: ['merge-arrow-buttons']},
    'scm-calendar-card': {on: ['calendar-background']},
    'scm-invert-osd': {on: ['invert-osd-colors']},
};

// Every setting a tweak depends on.
const TWEAK_KEYS = [...new Set(Object.values(TWEAK_CLASSES).flatMap(({on = [], off = []}) => [...on, ...off]))];

// The CSS property that gives a slider's empty part a 1px border (see styles/borders.css).
// GNOME draws sliders in code and has no border for them.
const SLIDER_BORDER_PROPERTY = '-scm-slider-border-color';

// The CSS tweaks of the General tab. "Disable Quick Settings dimming" is not CSS:
// it lives in quickSettingsMenus.js. Slider borders are drawn here, after GNOME draws the
// bar and before the slider draws its handle over it, in the color their CSS gives them.
export class Tweaks {
    constructor(settings) {
        this._settings = settings;
        this._wrapBarRepaint();
        this._hookOsdLevels();
        Main.layoutManager.connectObject('monitors-changed', () => this._hookOsdLevels(), this);
        for (const key of TWEAK_KEYS)
            settings.connectObject(`changed::${key}`, () => this._sync(), this);
        this._sync();
    }

    destroy() {
        this._settings.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);
        Main.osdWindowManager._osdWindows.forEach(osd => osd._level.disconnectObject(this));
        BarLevel.prototype.vfunc_repaint = this._gnomeBarRepaint;
        for (const className of Object.keys(TWEAK_CLASSES))
            Main.layoutManager.uiGroup.remove_style_class_name(className);
    }

    _sync() {
        for (const [className, when] of Object.entries(TWEAK_CLASSES)) {
            if (settingsSay(this._settings, when))
                Main.layoutManager.uiGroup.add_style_class_name(className);
            else
                Main.layoutManager.uiGroup.remove_style_class_name(className);
        }
    }

    // Sliders call BarLevel's vfunc_repaint() through super, so they pick up the wrapper.
    _wrapBarRepaint() {
        const gnomeRepaint = this._gnomeBarRepaint = BarLevel.prototype.vfunc_repaint;
        BarLevel.prototype.vfunc_repaint = function () {
            gnomeRepaint.call(this);
            const [hasBorder, color] = this.get_theme_node().lookup_color(SLIDER_BORDER_PROPERTY, false);
            if (hasBorder)
                drawEmptyPartBorder(this, color);
        };
    }

    // The bar of the volume and brightness pop-ups is a plain BarLevel, whose vfunc_repaint()
    // GJS bound when GNOME registered the class, so the wrapper above never runs for it. Its
    // border is drawn after its own drawing instead, at the end of the repaint signal. GNOME
    // makes one pop-up per monitor, again when monitors change (before this runs, as it
    // connected first).
    _hookOsdLevels() {
        for (const {_level: level} of Main.osdWindowManager._osdWindows) {
            level.disconnectObject(this);
            level.connectObject('repaint', () => {
                const [hasBorder, color] = level.get_theme_node().lookup_color(SLIDER_BORDER_PROPERTY, false);
                if (hasBorder)
                    drawEmptyPartBorder(level, color);
            }, GObject.ConnectFlags.AFTER, this);
        }
    }
}

// Outlines the bar from the end of its filled part (under the handle) to its round end,
// 0.5px inside, so the 1px line stays within the bar.
function drawEmptyPartBorder(bar, color) {
    const cr = bar.get_context();
    const [width, height] = bar.get_surface_size();
    const rtl = bar.get_text_direction() === Clutter.TextDirection.RTL;
    const radius = Math.min(width, bar._barLevelHeight) / 2;
    const progress = bar._maxValue > 0 ? bar._value / bar._maxValue : 0;
    const endX = radius + (width - 2 * radius) * (rtl ? 1 - progress : progress);
    const arcX = rtl ? radius : width - radius;
    const top = (height - bar._barLevelHeight) / 2 + 0.5;
    const bottom = (height + bar._barLevelHeight) / 2 - 0.5;

    cr.moveTo(endX, top);
    cr.lineTo(arcX, top);
    if (rtl)
        cr.arcNegative(arcX, height / 2, radius - 0.5, -Math.PI / 2, Math.PI / 2);
    else
        cr.arc(arcX, height / 2, radius - 0.5, -Math.PI / 2, Math.PI / 2);
    cr.lineTo(endX, bottom);
    cr.setSourceColor(color);
    cr.setLineWidth(1);
    cr.stroke();
    cr.$dispose();
}
