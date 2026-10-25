import GLib from 'gi://GLib';

// How often the clock is checked. Checking often, instead of waiting for the next switch
// time, also catches up right after the computer wakes from suspend.
const CHECK_SECONDS = 30;

const SCHEDULE_KEYS = ['auto-switch', 'auto-switch-1-mode', 'auto-switch-1-time', 'auto-switch-2-time'];

// Switches between light and dark mode at two times of day: the first time turns on the
// chosen mode, the second the other one. Picking a mode by hand while it is on turns it
// off, so the choice stays; the preferences say so the next time they open.
export class AutoSwitch {
    constructor(settings, desktopSettings) {
        this._settings = settings;
        this._desktopSettings = desktopSettings;
        for (const key of SCHEDULE_KEYS)
            settings.connectObject(`changed::${key}`, () => this._start(true), this);
        desktopSettings.connectObject('changed::color-scheme', () => this._modeChanged(), this);
        this._start(false);
    }

    destroy() {
        this._stopTimer();
        this._settings.disconnectObject(this);
        this._desktopSettings.disconnectObject(this);
    }

    // At login, only a switch time that passed since the last switch applies. A changed
    // schedule applies its current mode right away.
    _start(scheduleChanged) {
        this._stopTimer();
        if (!this._isOn())
            return;
        if (scheduleChanged)
            this._settings.set_int64('auto-switch-applied', 0);
        this._check();
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, CHECK_SECONDS, () => {
            this._check();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopTimer() {
        if (this._timerId)
            GLib.Source.remove(this._timerId);
        this._timerId = 0;
    }

    // On, with two different times.
    _isOn() {
        const [first, second] = this._times();
        return this._settings.get_boolean('auto-switch') && first !== second;
    }

    _times() {
        return [this._settings.get_int('auto-switch-1-time'), this._settings.get_int('auto-switch-2-time')];
    }

    // Applies the latest switch time that passed, once.
    _check() {
        const latest = this._latestSwitch(GLib.DateTime.new_now_local());
        if (latest.time <= this._settings.get_int64('auto-switch-applied'))
            return;
        this._settings.set_int64('auto-switch-applied', latest.time);
        if (this._desktopSettings.get_string('color-scheme') !== latest.scheme) {
            this._switching = true;
            this._desktopSettings.set_string('color-scheme', latest.scheme);
            this._switching = false;
        }
    }

    // The most recent switch time before `now` (unix time) and the mode it turns on.
    _latestSwitch(now) {
        const [first, second] = this._times();
        const firstDark = this._settings.get_string('auto-switch-1-mode') === 'dark';
        const midnight = GLib.DateTime.new_local(now.get_year(), now.get_month(), now.get_day_of_month(), 0, 0, 0);
        const switches = [[first, firstDark], [second, !firstDark]].map(([minutes, dark]) => {
            let moment = midnight.add_minutes(minutes);
            if (moment.compare(now) > 0)
                moment = moment.add_days(-1);
            return {time: moment.to_unix(), scheme: dark ? 'prefer-dark' : 'prefer-light'};
        });
        return switches[0].time >= switches[1].time ? switches[0] : switches[1];
    }

    // A mode picked by hand turns the automatic switch off.
    _modeChanged() {
        if (this._switching || !this._isOn())
            return;
        this._settings.set_boolean('auto-switch', false);
        this._settings.set_boolean('auto-switch-off-notice', true);
    }
}
