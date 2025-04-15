.PHONY: api install update 

# mingw32-make.exe

# WINDOWS: .venv\Scripts\Activate.ps1
# LINUX: source .venv/bin/activate

api:
ifeq ($(OS),Windows_NT)
	fastapi dev src/main.py --host 0.0.0.0 --port 8000
else
	sudo $(CURDIR)/.venv/bin/fastapi dev src/main.py --host 0.0.0.0 --port 8000
endif

install:
	pip install -r requirements.txt

update:
	pip freeze > requirements.txt
