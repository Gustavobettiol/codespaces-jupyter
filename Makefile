.PHONY: setup estado dataset voz imgs lora video todo

PYTHON ?= python3
CHARACTER ?= sofia

setup:
	$(PYTHON) -m pip install --upgrade pip
	$(PYTHON) -m pip install -r requirements.txt

estado:
	$(PYTHON) -m src.cli estado

dataset:
	$(PYTHON) -m src.cli preparar-dataset --personaje $(CHARACTER)

voz:
	$(PYTHON) -m src.cli voz

imgs:
	$(PYTHON) -m src.cli imgs --personaje $(CHARACTER)

lora:
	$(PYTHON) -m src.cli lora-entrenar --personaje $(CHARACTER)

video:
	$(PYTHON) -m src.cli video $(ARGS)

todo:
	$(PYTHON) -m src.cli todo --personaje $(CHARACTER)
