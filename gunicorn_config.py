"""
Gunicorn configuration for JANRAKSHAK Production Server
Optimized for WebSocket (Flask-SocketIO) and async telemetry feeds.
"""

import os
import multiprocessing

bind = "0.0.0.0:5555"
workers = 1  # For Flask-SocketIO in-memory coordination, default to 1 master worker with threads/async
threads = 8
worker_class = "gthread"
timeout = 120
keepalive = 5

accesslog = "-"
errorlog = "-"
loglevel = "info"
