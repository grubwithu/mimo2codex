.PHONY: build run test migrate docker clean

BIN_DIR := bin

build:
	go build -ldflags="-s -w" -o $(BIN_DIR)/docbackend ./cmd/docbackend

run: build
	./$(BIN_DIR)/docbackend -conf configs/config.yaml

test:
	go test -v ./...

# Convenience target that runs AutoMigrate against $DOCBACKEND_TEST_DSN.
# Run once after first checkout to provision the two tables in your PG.
migrate:
	go test -v -run TestAutoMigrate ./internal/data

# Builds the production image. CONTEXT MUST be the repo root so the Dockerfile
# can COPY ../doc into the image; the Makefile cd's there for you.
docker:
	cd .. && docker build -f docbackend/Dockerfile -t mimo2codex-docbackend .

clean:
	rm -rf $(BIN_DIR)
