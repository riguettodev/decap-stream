#!/bin/bash
set -e

DEFAULT_IMAGE="ghcr.io/riguettodev/decap-stream"
DEFAULT_VERSION="0.0.0"
DEFAULT_LATEST="latest"

echo "=== DecapStream Build ==="
echo

read -p "Image [${DEFAULT_IMAGE}]: " IMAGE
IMAGE=${IMAGE:-$DEFAULT_IMAGE}

read -p "Version/Tag [${DEFAULT_VERSION}]: " VERSION
VERSION=${VERSION:-$DEFAULT_VERSION}

read -p "Build tag 'latest' também? (y/n) [y]: " USE_LATEST
USE_LATEST=${USE_LATEST:-y}

LATEST_TAG=""
if [[ "$USE_LATEST" =~ ^[Yy]$ ]]; then
    read -p "Nome da tag latest [${DEFAULT_LATEST}]: " LATEST_TAG
    LATEST_TAG=${LATEST_TAG:-$DEFAULT_LATEST}
fi

read -p "Fazer push após o build? (y/n) [n]: " DO_PUSH
DO_PUSH=${DO_PUSH:-n}

echo
echo "=== CONFIRMAÇÃO ==="
echo "Image   : $IMAGE"
echo "Version : $VERSION"
[[ "$USE_LATEST" =~ ^[Yy]$ ]] && echo "Latest  : $LATEST_TAG" || echo "Latest  : não"
echo "Push    : $DO_PUSH"
echo

read -p "Confirmar build? (y/n): " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || exit 1

echo
echo "=== BUILDING ==="

make -C docker build \
    IMAGE="$IMAGE" \
    TAG="$VERSION"

if [[ "$USE_LATEST" =~ ^[Yy]$ ]]; then
    echo "🏷️  Taggeando como ${IMAGE}:${LATEST_TAG}..."
    docker tag "${IMAGE}:${VERSION}" "${IMAGE}:${LATEST_TAG}"
fi

if [[ "$DO_PUSH" =~ ^[Yy]$ ]]; then
    echo
    echo "=== PUSH ==="
    make -C docker push IMAGE="$IMAGE" TAG="$VERSION"
    [[ "$USE_LATEST" =~ ^[Yy]$ ]] && make -C docker push IMAGE="$IMAGE" TAG="$LATEST_TAG"
fi

echo
echo "✅ Concluído com sucesso."