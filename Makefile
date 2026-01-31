.PHONY: install login dev start build status clean help

# Default target
help:
	@echo "Mini-Claw - Lightweight Telegram AI Bot"
	@echo ""
	@echo "Quick Start:"
	@echo "  make install    Install dependencies"
	@echo "  make login      Authenticate with AI provider (Claude/ChatGPT)"
	@echo "  make dev        Start in development mode"
	@echo ""
	@echo "Commands:"
	@echo "  make install    Install pnpm dependencies + pi-coding-agent"
	@echo "  make login      Run 'pi /login' to authenticate"
	@echo "  make dev        Start bot with hot reload"
	@echo "  make start      Start bot in production mode"
	@echo "  make build      Compile TypeScript"
	@echo "  make status     Check Pi auth status"
	@echo "  make clean      Remove build artifacts"
	@echo ""
	@echo "Setup:"
	@echo "  1. make install"
	@echo "  2. make login"
	@echo "  3. cp .env.example .env && edit .env"
	@echo "  4. make dev"

# Install dependencies
install:
	@echo "Installing pnpm dependencies..."
	pnpm install
	@echo ""
	@echo "Checking pi-coding-agent..."
	@which pi > /dev/null 2>&1 || (echo "Installing pi-coding-agent globally..." && npm install -g @mariozechner/pi-coding-agent)
	@echo ""
	@echo "Done! Next steps:"
	@echo "  1. Run 'make login' to authenticate with Claude/ChatGPT"
	@echo "  2. Copy .env.example to .env and add your Telegram bot token"
	@echo "  3. Run 'make dev' to start the bot"

# Login to AI provider
login:
	@echo "Starting Pi login..."
	@echo "Select your AI provider (Anthropic for Claude, OpenAI for ChatGPT)"
	@echo ""
	pi /login

# Development mode with hot reload
dev:
	@test -f .env || (echo "Error: .env file not found. Copy .env.example to .env first." && exit 1)
	pnpm dev

# Production start
start:
	@test -f .env || (echo "Error: .env file not found." && exit 1)
	pnpm build
	pnpm start

# Build TypeScript
build:
	pnpm build

# Check Pi status
status:
	@echo "Checking Pi installation..."
	@which pi > /dev/null 2>&1 && echo "Pi: installed at $$(which pi)" || echo "Pi: NOT INSTALLED"
	@echo ""
	@echo "Checking Pi auth..."
	@pi --version 2>/dev/null && echo "Pi: OK" || echo "Pi: not authenticated or not working"

# Clean build artifacts
clean:
	rm -rf dist
	rm -rf node_modules/.cache

# Install systemd service (Linux)
install-service:
	@echo "Creating systemd user service..."
	@mkdir -p ~/.config/systemd/user
	@echo "[Unit]" > ~/.config/systemd/user/mini-claw.service
	@echo "Description=Mini-Claw Telegram Bot" >> ~/.config/systemd/user/mini-claw.service
	@echo "After=network.target" >> ~/.config/systemd/user/mini-claw.service
	@echo "" >> ~/.config/systemd/user/mini-claw.service
	@echo "[Service]" >> ~/.config/systemd/user/mini-claw.service
	@echo "Type=simple" >> ~/.config/systemd/user/mini-claw.service
	@echo "WorkingDirectory=$$(pwd)" >> ~/.config/systemd/user/mini-claw.service
	@echo "ExecStart=$$(which node) $$(pwd)/dist/index.js" >> ~/.config/systemd/user/mini-claw.service
	@echo "Restart=on-failure" >> ~/.config/systemd/user/mini-claw.service
	@echo "RestartSec=5" >> ~/.config/systemd/user/mini-claw.service
	@echo "" >> ~/.config/systemd/user/mini-claw.service
	@echo "[Install]" >> ~/.config/systemd/user/mini-claw.service
	@echo "WantedBy=default.target" >> ~/.config/systemd/user/mini-claw.service
	@echo ""
	@echo "Service created. Run:"
	@echo "  systemctl --user daemon-reload"
	@echo "  systemctl --user start mini-claw"
	@echo "  systemctl --user enable mini-claw"
