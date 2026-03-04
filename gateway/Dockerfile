# LiteLLM Proxy for AI Factory gateway
# Build: docker build -t ai-factory-gateway .
# Run: docker run -p 4000:4000 -e OPENAI_API_KEY=... ai-factory-gateway
FROM ghcr.io/berriai/litellm:main-latest

COPY config.yaml /app/config.yaml

ENV LITELLM_CONFIG_PATH=/app/config.yaml
EXPOSE 4000

CMD ["litellm", "--config", "/app/config.yaml", "--port", "4000"]
