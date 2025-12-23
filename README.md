# MANDATE: The District Game

A 3-player real-time online card game with server-authoritative gameplay.

## Project Structure

```
mandate/
├── client/          # PixiJS WebGL client
├── server/          # Node.js WebSocket server
├── shared/          # Shared TypeScript types
├── tools/           # Asset and audio pipelines
└── docs/            # Game documentation
```

## Quick Start

```bash
# Install all dependencies
npm install

# Start the server (in one terminal)
npm run dev:server

# Start the client (in another terminal)
npm run dev:client
```

## Development

- **Client**: http://localhost:5173
- **Server**: ws://localhost:3001

## Architecture

- **Server-authoritative**: All game logic runs on the server
- **Deterministic ordering**: Events are sequenced with `event_seq`
- **Protocol version**: 0.1

See `docs/` for detailed documentation.
