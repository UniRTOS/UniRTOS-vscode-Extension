
# UniRTOS — VS Code Extension

UniRTOS is a unified embedded development kit developed by Quectel for its full range of cellular communication modules. It provides consistent APIs and component architecture, supports cross-platform development and efficient porting, and integrates rich middleware, drivers, protocol stacks, and application examples to accelerate the development and deployment of intelligent embedded devices.

## Features

- **Extension Overview**
	- Adds a UniRTOS icon to the activity bar with a Commands view for quick access to all major workflows.

- **Create New Project**
	- Launch a guided wizard to create a new UniRTOS project from scratch.
	- Choose platform, model, SDK version, and target directory.

- **Create Demo Project**
	- Instantly set up a demo project from a curated list of examples.
	- Demo projects are pre-configured for quick evaluation and prototyping.

- **Build SDK**
	- Build your UniRTOS SDK project directly from the extension.
	- View build output and errors in the integrated terminal.

- **Flash Firmware to Module**
	- Flash the compiled firmware to your target module with a single click.
	- Supports multiple connection types and auto-detects connected devices.

- **More Features Coming Soon**
	- Additional project templates, advanced debugging, and device monitoring are planned for future releases.

# How to use

<details>
<summary>📰 Create New Project</summary>

## Create New Project

1. From UniRTOS menu -> Development -> New Project

<p>
  <img src="https://raw.githubusercontent.com/QuecPython/vscode-extension-qpycom-issues/refs/heads/main/images/unirtos/new-project-1.png" alt="New Project">
</p>

2. Required fields will show in the panel
<p>
  <img src="https://raw.githubusercontent.com/QuecPython/vscode-extension-qpycom-issues/refs/heads/main/images/unirtos/new-project-2.png" alt="New Project">
</p>

3. Fill in the required fields, and push continue. The new project will open when cloning is done
<p>
  <img src="https://raw.githubusercontent.com/QuecPython/vscode-extension-qpycom-issues/refs/heads/main/images/unirtos/new-project-3.png" alt="New Project">
</p>
</details>

<details>
<summary>🪧 Create Demo Project</summary>

## Create Demo Project

1. From UniRTOS menu -> Development -> New Project From Demo.

<p>
  <img src="https://raw.githubusercontent.com/QuecPython/vscode-extension-qpycom-issues/refs/heads/main/images/unirtos/demo-project-1.png" alt="Demo Project">
</p>

2. Required fields will show in the panel, please choose to create a new project or use the current one.
<p>
  <img src="https://raw.githubusercontent.com/QuecPython/vscode-extension-qpycom-issues/refs/heads/main/images/unirtos/demo-project-2.png" alt="Demo Project">
</p>

3. Fill in the required fields, and push continue. The demo project will open when cloning is done for the sdk and demo project.
<p>
  <img src="https://raw.githubusercontent.com/QuecPython/vscode-extension-qpycom-issues/refs/heads/main/images/unirtos/demo-project-3.png" alt="Demo Project">
</p>

</details>

<details>
<summary>👷 Build UniRTOS Project</summary>

## Build UniRTOS sdk

Note:
- Please install all requirements before building the sdk (For More info, check requirements guide)
- Please open UniRTOS project to use this feature

1. From UniRTOS menu -> Development -> Build.

<p>
  <img src="https://raw.githubusercontent.com/QuecPython/vscode-extension-qpycom-issues/refs/heads/main/images/unirtos/build-1.png" alt="Build">
</p>
<br>

---
<br>

2. Output tab will open and will show the process, with successful message at the end.
<p>
  <img src="https://raw.githubusercontent.com/QuecPython/vscode-extension-qpycom-issues/refs/heads/main/images/unirtos/build-2.png" alt="Build">
</p>
</details>

<details>
<summary>🔦 Flash UniRTOS Firmware</summary>

## Flash UniRTOS Firmware

Note:
- Please install all requirements before building the sdk (For More info, check requirements guide)
- Please open UniRTOS project to use this feature

1. From UniRTOS menu -> Development -> Flash.

<p>
  <img src="https://raw.githubusercontent.com/QuecPython/vscode-extension-qpycom-issues/refs/heads/main/images/unirtos/flash-1.png" alt="Flashing">
</p>
<br>

---
<br>
2. The extension will find the port + the config file.
Or you can find config file manually: Find quec_download_usb.ini or at_command.hbinpkg

<p>
  <img src="https://raw.githubusercontent.com/QuecPython/vscode-extension-qpycom-issues/refs/heads/main/images/unirtos/flash-2.png" alt="Flashing">
</p>

3. Output tab will open and will show the process, with successful message at the end.
<p>
  <img src="https://raw.githubusercontent.com/QuecPython/vscode-extension-qpycom-issues/refs/heads/main/images/unirtos/flash-3.png" alt="Flashing">
</p>
</details>

<details>
<summary>✔️ UniRTOS Requirements</summary>

## UniRTOS Requirements
- unirtos-toolchain download link：https://www.quectel.com.cn/wp-content/uploads/2026/04/unirtos-toolchain_1.0.3.zip
  - download and install unirtos toolchain and add unirtos bin folder to Environment Variables (e.g. C:\unirtos-toolchain\bin)
  <p>
  <img src="https://raw.githubusercontent.com/QuecPython/vscode-extension-qpycom-issues/refs/heads/main/images/unirtos/req-1.png" alt="Requirements">
</p>

- git
- python

</details>

## License

See the [LICENSE](LICENSE) file.
