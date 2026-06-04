
# UniRTOS — VS Code Extension

UniRTOS is a unified embedded development kit developed by Quectel for its full range of cellular communication modules. It provides consistent APIs and component architecture, supports cross-platform development and efficient porting, and integrates rich middleware, drivers, protocol stacks, and application examples to accelerate the development and deployment of intelligent embedded devices.

## Features

- 🎯 **Create New Project**: Clone and create a new UniRTOS project.
- 🏛️ **Create Demo Project**: Choose a demo project and add to your current unirto proejct, or start from scratch.
- ⛩️ **Build SDK**: Build SDK from your unirtos project.
- 📸 **Flash Firmware to Module**: Flash your UniRTOS firmware to the module.
- 📜 **Requirements**: Follow the steps, to prepare your machine to build UniRTOS project.

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
