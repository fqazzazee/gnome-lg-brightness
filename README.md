# LG Brightness

A GNOME Shell Quick Settings toggle that controls the **real backlight** of an LG monitor (made for the LG UltraGear) over **DDC/CI**. You don't need to reach for the monitor's joystick.

GNOME's own brightness slider only appears for laptop panels. External monitors can't be dimmed from the desktop at all unless you use DDC/CI, which is what this extension does.

## Features

- **Quick Settings tile.** It shows the current brightness, e.g. *LG Brightness · 100%*.
  - **Click the tile** to switch between a **Bright** level (default 100%) and a **Dim** level (default 30%). The tile is highlighted when bright.
  - **Click the arrow** to open a 0–100% **slider** and pick *Bright* or *Dim* directly.
- **Your levels are remembered.** Moving the slider while bright changes the Bright level; moving it while dimmed changes the Dim level.
- **Stays in sync with the monitor.** It reads the actual brightness each time you open the menu, so changes made with the monitor's own buttons show up.
- **Smooth slider.** DDC writes are queued one at a time, and a drag sends only the latest value, so the monitor never gets flooded with requests.
- If the monitor can't be reached (off, asleep, or on another input), the tile shows *Unavailable*.

## Requirements

- GNOME Shell **50**
- [`ddcutil`](https://www.ddcutil.com/) 2.0 or newer
- A monitor with **DDC/CI enabled** in its on-screen menu. On LG monitors it's usually on by default, under *Settings → General*.
- Permission for your user to access `/dev/i2c-*`. Most distro `ddcutil` packages set this up; see [Troubleshooting](#troubleshooting).

Install `ddcutil`:

```bash
sudo pacman -S ddcutil        # Arch / CachyOS
sudo dnf install ddcutil      # Fedora
sudo apt install ddcutil      # Debian / Ubuntu
```

Check that it can see your monitor:

```bash
ddcutil detect
ddcutil --model 'LG ULTRAGEAR' getvcp 10   # should print the current brightness
```

## Installation

```bash
git clone https://github.com/fqazzazee/gnome-lg-brightness.git
cd gnome-lg-brightness
./install.sh
```

Then **log out and back in**. On Wayland, GNOME Shell only picks up new extensions at login. Afterwards you'll find the **LG Brightness** tile in Quick Settings (top-right menu).

<details>
<summary>Manual installation</summary>

```bash
cp -r lg-brightness@tesla.local ~/.local/share/gnome-shell/extensions/
glib-compile-schemas ~/.local/share/gnome-shell/extensions/lg-brightness@tesla.local/schemas
# log out and back in, then:
gnome-extensions enable lg-brightness@tesla.local
```
</details>

## Configuration

You change the settings with `gsettings`. The tile updates immediately.

```bash
S="--schemadir $HOME/.local/share/gnome-shell/extensions/lg-brightness@tesla.local/schemas"
K=org.gnome.shell.extensions.lg-brightness

gsettings $S set $K dim-level 20          # Dim level (0–100)
gsettings $S set $K bright-level 90       # Bright level (0–100)
gsettings $S set $K model 'LG ULTRAGEAR'  # which monitor to control
```

### Other LG models (or other brands)

The extension picks the monitor by the **model name** it reports over DDC. The default is `LG ULTRAGEAR`. To find yours, run:

```bash
ddcutil detect | grep Monitor
#   Monitor:          GSM:LG ULTRAGEAR:XXXXXXXXXXXX
#                         ^^^^^^^^^^^^ this part
```

Set the `model` key to the text in the middle. Any monitor that supports DDC/CI brightness (VCP code `0x10`) works, not just LG ones.

## Troubleshooting

**The tile says *Unavailable*.** Run `ddcutil --model 'LG ULTRAGEAR' getvcp 10` in a terminal. That's the same command the extension uses, and it will tell you what's wrong. Also check GNOME Shell's log:

```bash
journalctl --user -b | grep -i "lg brightness"
```

**`ddcutil` says it can't open `/dev/i2c-*` (permission denied).** Load the kernel module, then give your user access:

```bash
echo i2c-dev | sudo tee /etc/modules-load.d/i2c-dev.conf
sudo modprobe i2c-dev
sudo groupadd --system i2c 2>/dev/null; sudo usermod -aG i2c "$USER"
# log out and back in
```

Recent `ddcutil` packages ship a udev rule that gives the logged-in user access automatically, so this is often unnecessary.

**`ddcutil detect` finds no display.** Enable DDC/CI in the monitor's on-screen menu. Some docks and KVM switches don't pass DDC through, so try a direct cable.

**NVIDIA.** If detection fails on the proprietary driver, see the [ddcutil NVIDIA notes](https://www.ddcutil.com/nvidia/).

## How it works

The extension runs `ddcutil` asynchronously through `Gio.Subprocess`, so GNOME Shell never blocks:

- read: `ddcutil --model <model> --brief getvcp 10`
- write: `ddcutil --model <model> --noverify setvcp 10 <value>`

VCP code `0x10` is the standard MCCS *Luminance* control, which sets the backlight itself. It's not a software dimming filter, so it doesn't affect colors, screenshots or games.

## Uninstall

```bash
gnome-extensions uninstall lg-brightness@tesla.local
```

## Support

If it saved you a reach for the monitor's joystick, you can [buy me a coffee ☕](https://buymeacoffee.com/fqazzazee).

## License

[GPL-2.0-or-later](LICENSE)
