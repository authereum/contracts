.PHONY: test
test:
	truffle test

zos-update:
	npx zos update -n development AuthereumAccount

zos-update/kovan:
	npx zos update -n kovan AuthereumAccount

push/kovan:
	npx zos push -n kovan

lint:
	standard --fix test/*.js

deploy:
	node scripts/deploy.js $(NETWORK)

copy:
	mkdir -p dist/contracts
	cp -r build/contracts/* dist/contracts
	(cd ../abi && $(MAKE) copy)
