.PHONY: start install update clean

# mingw32-make.exe

# WINDOWS: .venv\Scripts\Activate.ps1
# LINUX: source .venv/bin/activate

start:
ifeq ($(OS),Windows_NT)
	fastapi dev src/main.py --host 0.0.0.0 --port 8000
else
	sudo $(CURDIR)/.venv/bin/fastapi dev src/main.py --host 0.0.0.0 --port 8000
endif

install:
	pip install -r requirements.txt

update:
	pip freeze > requirements.txt

clean:
ifeq ($(OS),Windows_NT)
	if exist src\data rmdir /s /q src\data
	if exist logs rmdir /s /q logs
	for /d /r . %%d in (__pycache__) do @if exist "%%d" rmdir /s /q "%%d"
	if exist .pytest_cache rmdir /s /q .pytest_cache
else
	sudo rm -rf src/data logs
	sudo find . -type d -name __pycache__ -exec rm -rf {} +
	sudo find . -type d -name .pytest_cache -exec rm -rf {} +
endif