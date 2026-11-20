FROM python:3.11-slim

WORKDIR /app

# Install system utilities and python packages
RUN pip install --no-cache-dir telethon python-dotenv requests

# Copy telegram userbot code
COPY storage/scripts/telegram_userbot.py ./storage/scripts/telegram_userbot.py

# Health check port for cloud providers
ENV PORT=8080
EXPOSE 8080

CMD ["python", "-u", "storage/scripts/telegram_userbot.py"]
