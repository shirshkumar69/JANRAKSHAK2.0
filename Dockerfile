FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies (curl and gcc for native extensions if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create a non-root user for security
RUN useradd -m janrakshak
RUN chown -R janrakshak:janrakshak /app

# Ensure correct context for user
USER janrakshak

# Copy application files
COPY --chown=janrakshak:janrakshak . .

# Expose the application port
EXPOSE 5555

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fail http://localhost:5555/api/health || exit 1

# Start the application using Gunicorn (configured for Flask-SocketIO)
CMD ["gunicorn", "--config", "gunicorn_config.py", "app:app"]
