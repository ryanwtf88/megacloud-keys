# MegaCloud & CloudVidz Key Extractor

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-success.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

Automated tool to extract decryption keys for **MegaCloud** (RabbitStream) and **CloudVidz** streaming services. This repository uses **Google Gemini 2.0 Flash** AI to intelligently deobfuscate and extract the 64-bit encryption keys used by these players.

The keys are automatically updated and committed to this repository.

## Extracted Keys

| Service | File | Description |
| :--- | :--- | :--- |
| **MegaCloud** | [`key.txt`](./key.txt) | 64-character hex decryption key |
| **CloudVidz** | [`rabbit.txt`](./rabbit.txt) | 64-character hex decryption key |

## Features

- **Automated Extraction**: Fetches the latest player scripts from live sites.
- **AI-Powered Analysis**: Uses Google Gemini 2.0 to handle complex JavaScript obfuscation.
- **Parallel Processing**: Extracts keys from multiple sources simultaneously.
- **Robust Validation**: Ensures only valid 64-character hex keys are committed.
- **GitHub Actions**: Fully automated workflow to keep keys up-to-date.

## Setup & Usage

### 1. Prerequisites

- Node.js 18+
- Google Gemini API Key (Free tier available at Google AI Studio)

### 2. Installation

```bash
git clone https://github.com/ryanwtf88/megacloud-keys.git
cd megacloud-keys
npm install
```

### 3. Environment Variables

Create a `.env` file or set these variables in your environment (or GitHub Secrets):

| Variable | Description |
| :--- | :--- |
| `API_KEY_1` | Google Gemini API Key for MegaCloud task |
| `API_KEY_2` | Google Gemini API Key for CloudVidz task (can be same as above) |

### 4. Running Locally

```bash
npm start
# or directly:
# node update_key.js
```

## GitHub Actions Configuration

This repository includes a workflow `.github/workflows/update_keys.yml` that runs automatically.

To enable it on your fork:
1. Go to **Settings** -> **Secrets and variables** -> **Actions**.
2. Add `API_KEY_1` and `API_KEY_2`.
3. Go to the **Actions** tab and enable workflows.

## Disclaimer

This tool is for educational and research purposes only. It is intended to demonstrate the capabilities of AI in code analysis and deobfuscation.
