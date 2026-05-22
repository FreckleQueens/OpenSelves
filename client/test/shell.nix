{ pkgs ? import <nixpkgs> {} }:
  pkgs.mkShell {
    nativeBuildInputs = with pkgs; [
      playwright-driver.browsers
      mailpit
    ];

    shellHook = ''
      export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
      export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
      export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE="ubuntu-24.04"
    '';
}
