.PHONY: venv api install-reqs update-reqs 

# mingw32-make.exe

# WINDOWS: .venv\Scripts\Activate.ps1
# LINUX: source .venv/bin/activate

api:
ifeq ($(OS),Windows_NT)
	fastapi dev src/api/main.py --host 0.0.0.0 --port 8000
else
	sudo $(CURDIR)/.venv/bin/fastapi dev src/api/main.py --host 0.0.0.0 --port 8000
endif

install-reqs:
	pip install -r requirements.txt

update-reqs:
	pip freeze > requirements.txt