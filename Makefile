.PHONY: venv api install-reqs update-reqs 

# mingw32-make.exe
# sudo /home/davide/dev/netwatch/.venv/bin/fastapi dev src/api/main.py --host 0.0.0.0 --port 8000

# Activate Virtual Environment (Not Working)
venv:
ifeq ($(OS),Windows_NT)
	.venv\Scripts\Activate.ps1
else
	source .venv/bin/activate
endif

# Start API
api:
ifeq ($(OS),Windows_NT)
	fastapi dev src/api/main.py
else
	sudo $(CURDIR)/.venv/bin/fastapi dev src/api/main.py
endif

# Install dependencies
install-reqs:
	pip install -r requirements.txt

# Update requirements.txt
update-reqs:
	pip freeze > requirements.txt