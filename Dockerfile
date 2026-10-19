FROM python:3.12-slim

# System deps + Node.js 20
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl git ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# LiteLLM proxy
RUN pip install --no-cache-dir 'litellm[proxy]'

# AI tools — versions pinned via npm at build time
RUN npm install -g @anthropic-ai/claude-code
RUN npm install -g opencode-ai
RUN npm install -g @openai/codex

WORKDIR /workspace

COPY harness/proxy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# litellm_config.yaml is mounted at runtime: -v .../litellm_config.yaml:/litellm_config.yaml:ro
# work_dir is mounted at runtime:            -v <work_dir>:/workspace:rw
# AZURE_API_KEY must be passed via:          -e AZURE_API_KEY

ENTRYPOINT ["/entrypoint.sh"]
