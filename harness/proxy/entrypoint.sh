#!/bin/bash
set -e

# Start LiteLLM proxy in background; log persists in the mounted workspace
litellm --config /litellm_config.yaml --port 4000 > /workspace/litellm.log 2>&1 &

# Wait up to 45 s for the proxy to accept connections
for i in $(seq 1 45); do
    code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/v1/models 2>/dev/null || true)
    case "$code" in 2*|3*|4*) echo "LiteLLM ready (HTTP $code)"; break ;; esac
    sleep 1
done

exec "$@"
