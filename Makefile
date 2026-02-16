install:
	npm install
	npm run build
	npm link

build:
	npm run build

start:
	npm start

watch:
	npm run watch

check:
	npm run check

typecheck:
	npm run typecheck

test:
	npm run test

format:
	npm run format

sample-export:
	npm run sample-export

dev: install start
