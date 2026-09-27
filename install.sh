#!/usr/bin/env bash
# Installs LG Brightness into your local GNOME Shell extensions folder.
set -euo pipefail

UUID="lg-brightness@tesla.local"
SRC="$(cd "$(dirname "$0")" && pwd)/$UUID"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

if ! command -v ddcutil >/dev/null; then
    echo "ddcutil is not installed. Install it first, e.g.:" >&2
    echo "  sudo pacman -S ddcutil   |   sudo dnf install ddcutil   |   sudo apt install ddcutil" >&2
    exit 1
fi

mkdir -p "$DEST"
cp -r "$SRC"/. "$DEST"/
glib-compile-schemas "$DEST/schemas"

# `gnome-extensions enable` fails until GNOME Shell has seen the extension
# (after re-login on Wayland), so fall back to adding it to the enabled list.
if ! gnome-extensions enable "$UUID" 2>/dev/null; then
    current="$(gsettings get org.gnome.shell enabled-extensions)"
    if [[ "$current" != *"'$UUID'"* ]]; then
        if [[ "$current" == "@as []" || "$current" == "[]" ]]; then
            new="['$UUID']"
        else
            new="${current%]}, '$UUID']"
        fi
        gsettings set org.gnome.shell enabled-extensions "$new"
    fi
fi

echo "Installed to $DEST"

model="$(gsettings --schemadir "$DEST/schemas" get org.gnome.shell.extensions.lg-brightness model | tr -d "'")"
if ddcutil --model "$model" --brief getvcp 10 >/dev/null 2>&1; then
    echo "Found monitor '$model' over DDC/CI."
else
    echo "Warning: couldn't read brightness from a monitor with model '$model'." >&2
    echo "Run 'ddcutil detect' to check DDC/CI access and see your monitor's model name." >&2
    echo "See the README's Troubleshooting section." >&2
fi

echo "Log out and back in to load it (required on Wayland)."
