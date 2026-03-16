# Windows VM Test Environment (Docker)

This setup runs a Windows VM in Docker for testing the Windows app build.

## Notes

- This setup is configured for KVM acceleration (`KVM=Y`) and passes `/dev/kvm` into the container.
- First boot can take a long time because Windows image assets are downloaded.

## Docker Engine vs Docker Desktop

- If you use Docker Engine (`docker.io`), use `docker context use default`.
- If you use Docker Desktop, use `docker context use desktop-linux`.
- If you switched from Docker Desktop to Docker Engine and see:
  - `error getting credentials ... docker-credential-desktop not found`
  remove `"credsStore": "desktop"` from `~/.docker/config.json` and retry.

## Start

```bash
cd windows-vm
docker compose up -d
```

View startup logs:

```bash
docker compose logs -f
```

## Access VM

- Browser console: `http://localhost:8006`
- RDP (optional): `localhost:3389`

## Audio Limitations In Windows VM

- Audio may be unavailable in the browser console session even when the app is working.
- Prefer RDP for audio testing, and enable remote audio redirection:
  - set Remote Audio to play on the local computer in your RDP client
  - reconnect the RDP session after changing the setting
- If app playback logic needs verification without VM audio output, validate timeline/progress and played-state updates.

## Stop

```bash
docker compose down
```

## Reset VM Data

```bash
cd windows-vm
docker compose down
rm -rf storage
```

## Build/Test app inside Windows VM

1. Install Git, Node.js (LTS), Rust (`rustup`), and Visual Studio Build Tools (Desktop C++).
2. Clone repo in Windows.
3. Run:

```powershell
npm install
npm run tauri:build -- --bundles msi,nsis
```

4. Verify installers were generated:

```powershell
Get-ChildItem -Recurse .\src-tauri\target\release\bundle -Include *.msi,*.exe | Select-Object FullName
```

5. Test the generated `.msi`/`.exe` in the VM.

## Copy Windows Installers Into VM Storage

From the Linux host, copy generated Windows installers into the mounted VM storage path:

```bash
cd windows-vm
./copy-windows-build.sh
```

Or copy specific installer files:

```bash
cd windows-vm
./copy-windows-build.sh /path/to/installer.msi /path/to/installer.exe
```

Copied files are placed in:

- Host: `windows-vm/storage/transfer`
- Container: `/storage/transfer`

## If You Built Inside The Windows VM

`copy-windows-build.sh` runs on the Linux host and only sees host-side `src-tauri/target`.
If you built the app inside the Windows VM, find the installer from a Windows terminal:

```powershell
Get-ChildItem -Recurse -Path .\src-tauri\target -Include *.msi,*.exe | Select-Object FullName
```

Or save paths to a text file for easier copy/paste:

```powershell
Get-ChildItem -Recurse -Path .\src-tauri\target -Include *.msi,*.exe |
  Select-Object -ExpandProperty FullName |
  Set-Content .\windows-artifacts.txt
```

Then move/copy the installer out of the VM using your preferred method (RDP clipboard or shared folder path), and optionally run:

```bash
cd windows-vm
./copy-windows-build.sh /path/to/copied/installer.msi
```
