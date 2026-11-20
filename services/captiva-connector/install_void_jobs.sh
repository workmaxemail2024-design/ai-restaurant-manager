#!/bin/bash
set -eu
umask 077
cd "$(dirname "$0")"
python3 void_jobs.py --proof
units="$HOME/.config/systemd/user"
mkdir -p "$units"
dir="$(pwd -P)"
for task in nightly backfill; do
    args=--nightly
    if [ "$task" = backfill ]; then args="--backfill-from 2026-01-01"; fi
    unit="captiva-void-$task.service"
    tmp="$(mktemp "$units/.captiva-void.XXXXXXXX")"
    cat > "$tmp" <<EOF
[Unit]
Description=Import Captiva void order details ($task)
[Service]
Type=oneshot
WorkingDirectory="$dir"
ExecStart=/usr/bin/python3 void_jobs.py $args
TimeoutStartSec=infinity
NoNewPrivileges=yes
UMask=0077
EOF
    mv "$tmp" "$units/$unit"
done
install -m 600 systemd/captiva-void-nightly.timer "$units/"
systemctl --user daemon-reload
systemctl --user enable --now captiva-void-nightly.timer
systemctl --user start --no-block captiva-void-backfill.service
systemctl --user list-timers captiva-void-nightly.timer
