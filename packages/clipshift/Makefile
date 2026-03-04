.PHONY: build install clean

# Build release binary
build:
	swift build -c release

# Install to /usr/local/bin
install: build
	@mkdir -p /usr/local/bin
	cp .build/release/clipshift /usr/local/bin/clipshift
	@echo "✓ Installed clipshift to /usr/local/bin/clipshift"

# Clean build artifacts
clean:
	swift package clean
	rm -rf .build
