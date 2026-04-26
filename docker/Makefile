SHELL := /bin/bash
IMAGE ?= registry.kralot.cloud/kralot/decap-stream
TAG   ?= ""

.PHONY: build push

build:
	@if [ -z "$(TAG)" ]; then \
		echo "❌ TAG não definida. Use ./build.sh ou passe TAG=x.x.x"; \
		exit 1; \
	fi
	docker build \
		-f Dockerfile \
		-t $(IMAGE):$(TAG) \
		..

push:
	@if [ -z "$(TAG)" ]; then \
		echo "❌ TAG não definida."; \
		exit 1; \
	fi
	docker push $(IMAGE):$(TAG)