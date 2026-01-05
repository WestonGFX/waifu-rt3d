@echo off
setlocal enabledelayedexpansion
call .venv\Scripts\activate
uvicorn backend.server:app --host 127.0.0.1 --port 8000 --reload
