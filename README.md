# Authereum Contracts

> Ethereum smart contract for [Authereum](http://authereum.org)

## Config

Environment variables:

```
NETWORK_NAME=kovan
ETH_HTTP_PROVIDER_URI='https://kovan.infura.io/v3/{infuraId}'
SENDER_ADDRESS=0x...
SENDER_PRIVATE_KEY=0x...
LOGIC_ADDRESS=0x...
ZOS_SESSION_PATH=/absolute-path-to/.openzeppelin/.session
```

You may also set the config by invoking the `setConfig(config)` static method.

## Deploy

The first thing required for deployment of the proxy accounts is the deployment and setup of ENS on the appropriate network. To do this, run the deploy script in 'monorepo/packages/backend/src/deploy/deploy.ts'. Once this has been completed, the ENS Manager addresses can be used in the initialization of the AuthereumAccount.


```bash
# Deploy the logic contract. Should only be called once.
npx zos push --network development

# Deploy a user's account
npx zos create2 AuthereumAccount --salt 0x1112 --from 0x0000000000000000000000000000000000000000 --network kovan --init initialize --args 0x0000000000000000000000000000000000000000,0x0000000000000000000000000000000000000000,ensname
```

### Addresses

#### Kovan
* ensRegistry = 0x455C52FE20DC395E850b3ED9b82c9d1A05BFc471
* authereumEnsResolver = 0x9604DD189B2d293d7f7fb540E273ac4daA0a48F7
* ensReverseRegistrar = 0x082D5E17d8773287115741d73bD3cE8232D83467
* authereumEnsManager = 0x8016194885195C4eD3ff553D52F7234654FF098C
* proxyContract = 0x6b4d70B5106fdAF95C5Bd00D8f72443AbDee6358

#### Rinkeby
* ensRegistry = 0xc071320F5087668971736DfE9E915C95D934cd6F
* authereumEnsResolver = 0xba52cA1B6f8Dbf80107dE59c82950b2f792a14C5
* ensReverseRegistrar = 0xB04f99FeD779CA143090CcDA228A77659Fd1F8C9
* authereumEnsManager = 0xcC7d7F62826D5080af12B9cc9865240Efbd130A4
* proxyContract = 0xD220e1681368cdd4Bff39F5E9Be02A3B0eE0E19D

#### Ropsten
* ensRegistry = 0x9604DD189B2d293d7f7fb540E273ac4daA0a48F7
* authereumEnsResolver = 0x8016194885195C4eD3ff553D52F7234654FF098C
* ensReverseRegistrar = 0xeb5acb4d359aA939e2DC4BB68b4B9532DED4860D
* authereumEnsManager = 0x203D879E8ADAcDe8225F75f8D8DC2Cd33528A6fa
* proxyContract = 0x3468A9D9dE4ED9Ed6f47b59e7185De14fD34b0d6

#### Goerli
* ensRegistry = 0x9604DD189B2d293d7f7fb540E273ac4daA0a48F7
* authereumEnsResolver = 0x8016194885195C4eD3ff553D52F7234654FF098C
* ensReverseRegistrar = 0xeb5acb4d359aA939e2DC4BB68b4B9532DED4860D
* authereumEnsManager = 0x203D879E8ADAcDe8225F75f8D8DC2Cd33528A6fa
* proxyContract = 0x3468A9D9dE4ED9Ed6f47b59e7185De14fD34b0d6

## Test
```bash
ganache-cli --port 8545 --deterministic --accounts 11
```

```bash
make tests
```


## Upgrading
Set up upgrade environment:
```bash
npm install
npx zos init authereumContracts
npx zos add AuthereumAccount
```
_Note: If the process hangs at `Updated zos.json`, simply end the process. The action has already been completed._

Update a contract:
```bash
make zos-update
```
_When asked "Do you want to run a function after updating the instance", type "N"_

# FAQ

* Why am I getting the following when I update my zos project (or run a test)?
    ```bash
    connection not open on send()
    connection not open
    ```
  * Try running ganache-cli on a different port (either `8545` or `9545`)

* Why is my test failing on a simple test? It seemingly reverts even when it shouldn't.

  * It is because you are running out of gas. There is an issue with zos (<2.4.0) and ganache (>= 6.4.0) where gas estimation does not work. You must manually set the gasLimit in the transaction, for now. See [herre](https://github.com/zeppelinos/zos/commit/4c2900ac3af6fd0a911c4bfeadd40631846102d7#diff-9594d32e7d1539a3d64960ff2cef07a1R220) for the proposed fix in 2.4.0rc2.

* Why are my tests not running with `Returned values aren't valid, did it run Out of Gas?`

  * You are trying to deploy on a different network. Try changing the `.env` file to reflect the network you are trying to depoy on.

  * Delete the `build` folder and run `truffle complie && truffle migrate --reset`

* Why am I getting the following error when running tests?
```
Error: EnsRegistry error: contract binary not set. Can't deploy new instance.
This contract may be abstract, not implement an abstract parent's methods completely
or not invoke an inherited contract's constructor correctly
```
  * Delete the `build` folder and run `truffle complie && truffle migrate --reset`

# License

[MIT](LICENSE)