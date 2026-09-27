import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {QuickMenuToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';

const VCP_BRIGHTNESS = '10';

function runDdcutil(argv) {
    return new Promise((resolve, reject) => {
        const proc = Gio.Subprocess.new(['ddcutil', ...argv],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
        proc.communicate_utf8_async(null, null, (_p, res) => {
            try {
                const [, stdout, stderr] = proc.communicate_utf8_finish(res);
                if (proc.get_successful())
                    resolve(stdout);
                else
                    reject(new Error(stderr.trim() || stdout.trim() || 'ddcutil failed'));
            } catch (e) {
                reject(e);
            }
        });
    });
}

// Talks to the monitor. DDC writes are slow (~50-100 ms) and the monitor
// dislikes overlapping requests, so only one runs at a time and slider drags
// collapse to the latest value.
class Ddc {
    constructor(settings) {
        this._settings = settings;
        this._pending = null;
        this._busy = false;
    }

    get _target() {
        return ['--model', this._settings.get_string('model')];
    }

    async get() {
        // Brief output: "VCP 10 C 100 100"
        const out = await runDdcutil([...this._target, '--brief', 'getvcp', VCP_BRIGHTNESS]);
        const m = out.match(/VCP\s+10\s+C\s+(\d+)\s+(\d+)/);
        if (!m)
            throw new Error(`Unexpected ddcutil output: ${out.trim()}`);
        return Math.round(100 * Number(m[1]) / Number(m[2]));
    }

    set(value) {
        this._pending = value;
        if (!this._busy)
            this._flush();
    }

    async _flush() {
        this._busy = true;
        while (this._pending !== null) {
            const value = this._pending;
            this._pending = null;
            try {
                await runDdcutil([...this._target, '--noverify', 'setvcp', VCP_BRIGHTNESS, String(value)]);
            } catch (e) {
                logError(e, 'LG Brightness: setvcp');
            }
        }
        this._busy = false;
    }
}

const BrightnessSliderItem = GObject.registerClass(
class BrightnessSliderItem extends PopupMenu.PopupBaseMenuItem {
    constructor() {
        super({activate: false, style_class: 'lg-brightness-row'});
        this.add_child(new St.Icon({icon_name: 'display-brightness-symbolic', style_class: 'popup-menu-icon'}));
        this.slider = new Slider(0);
        this.slider.x_expand = true;
        this.add_child(this.slider);
        this.valueLabel = new St.Label({style_class: 'lg-brightness-value', y_align: Clutter.ActorAlign.CENTER});
        this.add_child(this.valueLabel);
    }
});

const LgBrightnessToggle = GObject.registerClass(
class LgBrightnessToggle extends QuickMenuToggle {
    constructor(extension) {
        super({
            title: 'LG Brightness',
            iconName: 'display-brightness-symbolic',
        });
        this._settings = extension.getSettings();
        this._ddc = new Ddc(this._settings);
        this._level = null;
        this._dimmed = false;

        this.menu.setHeader('display-brightness-symbolic', 'LG Brightness', 'Hardware backlight (DDC/CI)');

        this._sliderItem = new BrightnessSliderItem();
        this.menu.addMenuItem(this._sliderItem);
        this._sliderItem.slider.connect('notify::value', () => {
            if (this._syncing)
                return;
            const value = Math.round(this._sliderItem.slider.value * 100);
            // Dragging while bright adjusts the bright level, while dimmed the dim level.
            this._settings.set_int(this._dimmed ? 'dim-level' : 'bright-level', value);
            this._apply(value);
        });

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._brightItem = new PopupMenu.PopupMenuItem('');
        this._brightItem.connect('activate', () => this._setDimmed(false));
        this.menu.addMenuItem(this._brightItem);
        this._dimItem = new PopupMenu.PopupMenuItem('');
        this._dimItem.connect('activate', () => this._setDimmed(true));
        this.menu.addMenuItem(this._dimItem);

        this.connect('clicked', () => this._setDimmed(!this._dimmed));
        this.menu.connect('open-state-changed', (_m, open) => {
            if (open)
                this._refresh();
        });
        this._settings.connectObject('changed', () => this._sync(), this);

        this._sync();
        this._refresh();
    }

    async _refresh() {
        try {
            this._level = await this._ddc.get();
            this._dimmed = this._level <= this._settings.get_int('dim-level');
        } catch (e) {
            logError(e, 'LG Brightness: getvcp');
            this._level = null;
        }
        this._sync();
    }

    _setDimmed(dimmed) {
        this._dimmed = dimmed;
        this._apply(this._settings.get_int(dimmed ? 'dim-level' : 'bright-level'));
    }

    _apply(value) {
        this._level = value;
        this._ddc.set(value);
        this._sync();
    }

    _sync() {
        const bright = this._settings.get_int('bright-level');
        const dim = this._settings.get_int('dim-level');

        this.checked = this._level !== null && !this._dimmed;
        this.subtitle = this._level === null ? 'Unavailable' : `${this._level}%`;

        this._syncing = true;
        this._sliderItem.slider.value = (this._level ?? 0) / 100;
        this._syncing = false;
        this._sliderItem.valueLabel.text = this._level === null ? '—' : `${this._level}%`;

        this._brightItem.label.text = `Bright (${bright}%)`;
        this._dimItem.label.text = `Dim (${dim}%)`;
        this._brightItem.setOrnament(this._level !== null && !this._dimmed ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
        this._dimItem.setOrnament(this._level !== null && this._dimmed ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
    }
});

const LgBrightnessIndicator = GObject.registerClass(
class LgBrightnessIndicator extends SystemIndicator {
    constructor(extension) {
        super();
        this.quickSettingsItems.push(new LgBrightnessToggle(extension));
    }

    destroy() {
        this.quickSettingsItems.forEach(item => item.destroy());
        super.destroy();
    }
});

export default class LgBrightnessExtension extends Extension {
    enable() {
        this._indicator = new LgBrightnessIndicator(this);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }
}
