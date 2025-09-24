# Yuekebao Grabber

A Playwright MCP (Model Context Protocol) server for scraping content from yuekebao.cn homepage.

## Features

- Scrapes yuekebao.cn homepage content using Playwright
- Extracts page title, meta information, headings, links, images, and text content
- Runs as an MCP server for integration with Claude Code and other MCP clients
- Configurable headless mode and timeout settings

## Installation

```bash
npm install
```

## Usage

### As MCP Server

Run the server in MCP mode:

```bash
npm start
```

### Available Tools

- `scrape_yuekebao_homepage`: Scrape the homepage content from yuekebao.cn
  - Parameters:
    - `headless` (boolean, default: true): Whether to run browser in headless mode
    - `timeout` (number, default: 30000): Page load timeout in milliseconds

## Development

Run in development mode with auto-reload:

```bash
npm run dev
```

## Dependencies

- `@modelcontextprotocol/sdk`: MCP SDK for creating MCP servers
- `playwright`: Browser automation library for web scraping

## License

MIT