#!/bin/sh
cd "$(dirname "$0")" || exit 1
if [ ! -f .env ]; then
  echo "Create .env from .env.example and change TEACHER_PASSWORD"
  exit 1
fi
exec node server.mjs
