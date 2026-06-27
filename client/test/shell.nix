{ pkgs ? import <nixpkgs> {}, run ? "bash" }:
(pkgs.buildFHSEnv {
  name = "puppeteer-env";
  targetPkgs = pkgs: with pkgs; [
    nix-index
    glib
    libx11
    nss_latest
    nspr
    atk
    dbus
    cups
    expat
    libxcb
    libxkbcommon
    libgbm
    alsa-lib
    libxext
    cairo
    pango
    udev
    libxcomposite
    libxdamage
    libxfixes
    libxrandr
  ];
  runScript = "${run}";
}).env
