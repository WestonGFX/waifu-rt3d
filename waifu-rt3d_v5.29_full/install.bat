@echo off
setlocal enabledelayedexpansion
python -m venv .venv
call .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python backend\preflight.py
python tools\fetch_offline_libs.py
echo Install complete. Next: run.bat
