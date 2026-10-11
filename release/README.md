# Release

Place the built artifacts here (D2).

Build the Windows installer from the repository root:

```powershell
npm install
npm run package --workspace @bcis/desktop
```

The installer (NSIS `.exe`) and unpacked output are produced by electron-builder under
`apps/desktop/release/`. Copy the installer here for submission, for example:

```
release/
  BCIS-Setup-0.1.0.exe
```

The API/server and PostgreSQL setup are documented in `../DEPLOYMENT.md`.
