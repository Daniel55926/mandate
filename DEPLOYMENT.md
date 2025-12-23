# MANDATE: Railway Deployment Guide

## Quick Deploy

1. Push your code to GitHub
2. Create a new project in [Railway](https://railway.app)
3. Connect your GitHub repository
4. Railway will auto-detect and deploy

## Environment Variables

No required environment variables. Railway automatically provides `PORT`.

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP/WS server port | `3001` |

## How It Works

- **Single service**: Server handles both HTTP (static files) and WebSocket
- **Client build**: Served from `client/dist/`
- **WebSocket**: Connects on same hostname with wss:// in production
- **Health check**: Available at `/health`

## Local Production Test

```bash
# Build everything
npm run build

# Start production server
npm run start

# Open http://localhost:3001
```

## Troubleshooting

**WebSocket connection fails:**
- Check browser console for the WebSocket URL being used
- Ensure the server is running on the expected port
- In production, ensure HTTPS is enabled (Railway provides this)

**Static files not loading:**
- Ensure `npm run build` completed successfully
- Check that `client/dist/index.html` exists
