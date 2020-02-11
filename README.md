# Authereum Contracts

> Ethereum smart contracts for [Authereum](http://authereum.com)

[![License](http://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/authereum/converter/master/LICENSE)
[![dependencies Status](https://david-dm.org/authereum/contracts/status.svg)](https://david-dm.org/authereum/contracts)

## Contract Design

The Authereum contracts are necessary pieces of the Authereum ecosystem. Users of the Authereum accounts own a proxy contract that points to an upgradeable logic contract. The contracts are organized in the following directories:

  * [account](#account) - The Authereum Account logic contract. All users on the Authereum platform will own a proxy contract that points to these contracts. This is upgradeable. Each users' state will live in their proxy contract but will interact with this contract.
  * [upgradeability](#upgradeability) - Upgradeability logic for Authereum accounts. Each user that joins Authereum creates a proxy (AuthereumProxy) through the Authereum proxy factory (AuthereumProxyFactory).
  * [admin](#admin) - Administrative contracts to be used by Authereum creators.
  * [base](#base) - Base contracts used throughout the system.
  * [ens](#ens) - Custom ENS contracts. Used to give Authereum users their own *.auth.eth subdomains. The Authereum ENS Resolver is upgradeable.
  * [firewall](#firewall) - Contracts that can be used as a firewall to protect user's accounts.
  * [interfaces](#interfaces) - Interfaces used throughout the system.
  * [libs](#libs) - Libraries used throughout the system.
  * [test](#test) - Contracts used during tests. None of these contracts are ever deployed as part of the system.
  * [utils](#utils) - Utils used throughout the system.

### Top Level Design Decisions
When a user signs up for an account on authereum.org, a proxy contract (`upgradeability/AuthereumProxy.sol`) is created for them through the Authereum proxy factory (`upgradeability/AuthereumProxyFactory.sol`). The creation of the proxy simply points the proxy to the latest Authereum account logic (implementation) address, initializes the proxy for that logic address, and gives the proxy and ENS subdomain (*.auth.eth).

Each proxy is fully owned by the user who created it, and Authereum has no custody or control over it at all.

The proxies are upgradeable with the proxy-delegate pattern, which simply means they can point to a new logic address and initialize themselves at that address. The user controls the upgrade and they are the only ones that can perform the upgrade.

The system is designed to be transacted with by meta transactions. Authereum users will sign messages that are sent to relayers who will broadcast the transactions.

There are two types of keys that interact with the contracts: auth keys and login keys. Auth keys have the most power and can perform administrative actions such as adding/removing auth keys and upgrading the account. Login keys are more restricted and can only send transactions.

A core component of the system is the signing of keys. Auth keys and login keys sign messages off-chain, and these messages and their signatures are passed into the contracts so that the signer can recovered and verified on-chain. There are two types of signatures checked:

* For an auth key transaction, the transaction message data is signed by the auth key, and the signed data and the signature are passed into the contract transaction. These two items are used to verify that the auth key signed the message.
* For a login key transaction, two signatures are required. One signature is identical to the one mentioned above, except it is signed by the login key instead of the auth key. The second piece of the login key transaction is a signature of the login key (and some data) signed by the auth key. This can be thought of as `authKey.sign(loginKey, data)`. Both pieces of data and both signatures are sent to the transaction. The login key and auth key are recovered on-chain, and the contract verifies that these addresses are correct.

More information can be found [here](https://medium.com/authereum/authereum-key-architecture-explained-8e0781cf3ea0).

### account

The `account` directory contains the logic contract for an Authereum Account. It is a single contract with `AuthereumAccount.sol` being the bottom-most contract on an inheritance tree. A user's proxy will point to this deployed contract and will use it for its logic.

This contract is upgradeable. Because of this, it is designed in such a way as to avoid overwriting any state variables. `accounts/state/`, `accounts/initializer/`, and `accounts/event/` have been separated out into subdirectories that each have the contract's state, initializers, and events, respectively. Any upgrades to the contract will create a new version (e.g. AccountStateV2.sol) that gets inherited, in order, as to completely avoid overwriting any state. The initializer functions are meant to be called when upgrading a contract and are protected from being called multiple times with the `lastInitializedVersion` state variable. Technically the contract events are able to be upgraded/overwritten without causing problems, but we put them in their own directory and will treat them similar to state upgrades. This is for cleanliness of code and so that the initializers can emit events.

In normal circumstances, transactions are meant to be sent by a relayer to one of two functions: `executeMultipleAuthKeyMetaTransactions()` and `executeMultipleLoginKeyMetaTransactions()`. See _Top Level Design Decisions_ for more information about the different keys. These transactions perform the following functions:

* perform an atomic transaction with itself
* verify that the signers of the data are the expected addresses (login key and auth key)
* execute each of the batched transactions sent in the transactions
* refund the relayer with ETH or tokens (if necessary - certain auth key transactions are not required to do this)

The following section will break down each point above.

**Atomic Transactions** - The Authereum contracts perform atomic transactions within their own transaction. In the context of an Authereum transaction, this means that transactions sent to an Authereum contract perform a `call` back _to itself_. The reason for this is to be able to revert within a transaction without reverting the entire transaction. This allows for the unwinding of state if a transaction fails while still allowing a relayer to be refunded.

**Verify Signatures** - See _Top Level Design Decisions_ for more information about the signing. In short, signatures are created off-chain that are verified on-chain. This was done for efficiency and to minimize the number of on-chain transactions.

**Execute Transactions** - Authereum users can send batched transactions. These are multiple transactions that are all batched into one, single on-chain transaction. See [here](https://medium.com/authereum/introducing-batched-transactions-with-authereum-f82dac9b62e7) for more information. The Authereum contracts loop through each passed-in transaction and executes them with a `call`.

**Refunds** - Most Authereum transactions should be sent by a relayer. Because of this, Authereum transactions refund the relayer who broadcasts the transaction at the conclusion of their transaction based on the amount of gas that was used. Refunds can be paid in ETH or tokens. It is expected that the relayer will not broadcast transactions that will be detrimental to themselves. The `feeTokenRate` is passed in by the user and is used to calculate the number of tokens that are paid to the relayer in a refund. It is expected that a relayer will not send a transaction with a token rate that they do not agree with.

There is a `gasOverhead` parameter that is passed into these functions as well. The value of this parameter is meant to be calculated off-chain and passed into the transaction. It represents the gas overhead that is not taken into account when calculating a refund. This may include the gas cost of the `calldata`, as well as any additional logic that is not captured by the gas calculations.

Upgradeability logic lives within this contract as well. In order to perform an upgrade, a user must send a transaction to `executeMultipleAuthKeyMetaTransactions()` that, in turn, calls its own `upgradeToAndCall()` function.

Finally, 721 and 1125 hooks are used in order to receive those types of tokens in the Authereum contracts.

### upgradeability
Authereum's contracts are upgradeable. Each Authereum user owns a proxy (`AuthereumProxy.sol`) that points to their desired logic contract. This contract's sole function is to provide a fallback function that delegates calls to the proxy's logic contract. All Authereum user transactions go through this fallback.

Each proxy is created by the Authereum proxy factory (`AuthereumProxyFactory.sol`). The Authereum proxy factory creates an account when `createProxy()` is called. This function creates a proxy with `create2`, initializes it, and registers a subdomain for the proxy. When a user creates an account on a later version of the Authereum contracts, they will have to iterate through each previous version's initializer. Because of this, the `createProxy()` function loops through each piece of the initialize data.

The `AuthereumEnsResolverProxy.sol` is nearly identical to the `AuthereumProxy.sol` contract and is used for upgrading the Authereum ENS Resolver Proxy.

### Additional Notes

### Known Issues
* A user can break their upgradeability on the Authereum system by upgrading their account to a logic address outside of the Authereum ecosystem.
* It is expected that a relayer will not broadcast a transaction that contains any data that would be detrimental to themselves. This includes:
  * Transactions that will revert (because of gas, bad data, or improperly signed data)
  * Transactions that contain a `feeTokenRate` that the relayer does not accept as a true rate

## Config

Environment variables:

```
NETWORK_NAME=kovan
ETH_HTTP_PROVIDER_URI='https://kovan.rpc.authereum.com'
SENDER_ADDRESS=0x...
SENDER_PRIVATE_KEY=0x...
LOGIC_ADDRESS=0x...
```

You may also set the config by invoking the `setConfig(config)` static method.

## Versioning
All the versioning in the Authereum system will use Unix timestamps. A dictionary will be kept that maps version numbers to human-readable names.

Advantage of Unix Timestamp:
* Consistent versioning
* Easy file/variable naming
* Infinitely scalable

Design Decisions:
* Semantinc versioning is hard to do on file names and variables
* Sequential may cause issues down the road (ie renaming files/contracts to have more left padding)

## Addresses

### Mainnet

* Authereum Account v2020020200 = [0x2e1723d1DFa2947f0d08D5c5D214b71deF4f951F](https://etherscan.io/address/0x2e1723d1dfa2947f0d08d5c5d214b71def4f951f)
* Authereum Account v2020010900 = [0x79fEe076B1BcD4054DFF0B4364C26899492198dc](https://etherscan.io/address/0x79fEe076B1BcD4054DFF0B4364C26899492198dc)
* Authereum Account v2019122000 = [0x211deB5c0a28A213FcF5976Ac22c70fF96b9004C](https://etherscan.io/address/0x211deB5c0a28A213FcF5976Ac22c70fF96b9004C)
* Authereum Account v2019111500 = [0x185c46c8d3EF5155F3678e69c827dB7a2116a6Cd](https://etherscan.io/address/0x185c46c8d3EF5155F3678e69c827dB7a2116a6Cd)
* Authereum Account v2019102500 = [0xD8CaB604BDd8cBb7c3eb0c26f7DC3AbFfb005A92](https://etherscan.io/address/0xD8CaB604BDd8cBb7c3eb0c26f7DC3AbFfb005A92)

<br>

* Authereum ENS Manager v2019111500 = [0x9442A2Eff399a9e97BCC6B2a4194399496F76e59](https://etherscan.io/address/0x9442A2Eff399a9e97BCC6B2a4194399496F76e59)
* Authereum ENS Manager v2019102500 = [0x6DCC6577650BBF5B70E9EeE7Cfd1364410867206](https://etherscan.io/address/0x6DCC6577650BBF5B70E9EeE7Cfd1364410867206)

<br>

* Authereum ENS Resolver v2019111500 = [0xA42D000187bd8d997df54267e4b27c08329fDFe1](https://etherscan.io/address/0xA42D000187bd8d997df54267e4b27c08329fDFe1)
* Authereum ENS Resolver v2019102500 (v1.0.0)= [0xd54FFAb6df175a7751e6E50373d213242DE938c3](https://etherscan.io/address/0xd54FFAb6df175a7751e6E50373d213242DE938c3)

<br>

* Authereum ENS Resolver Proxy v2019111500 = [0x4DA86a24e30a188608E1364A2D262166a87fCB7C](https://etherscan.io/address/0x4DA86a24e30a188608E1364A2D262166a87fCB7C)

<br>

* Authereum Proxy Factory v2019111500 = [0x69c0047531FD1cc24dAa9Eccd221Cb66b53c63f8](https://etherscan.io/address/0x69c0047531FD1cc24dAa9Eccd221Cb66b53c63f8)
* Authereum Proxy Factory v2019102500 = [0x0D54d0F1C1F5FE7a525713B85F36dE8fB6014046](https://etherscan.io/address/0x0D54d0F1C1F5FE7a525713B85F36dE8fB6014046)

### Kovan

* Authereum Account v2020020200 = [0x090D1E26170e5Db316B9a86b0d61601285f463A3](https://kovan.etherscan.io/address/0x090D1E26170e5Db316B9a86b0d61601285f463A3)
* Authereum Account v2020010900 = [0x024B110390FE302f6Ce1A2d81B9F3595B44179f4](https://kovan.etherscan.io/address/0x024B110390FE302f6Ce1A2d81B9F3595B44179f4)
* Authereum Account v2019122000 = [0xF29a9ACE9820dB1E0C92AAE20D9e32C7ce34D6E6](https://kovan.etherscan.io/address/0xF29a9ACE9820dB1E0C92AAE20D9e32C7ce34D6E6)
* Authereum Account v2019111500 = [0x8bb37aE005ADa8f7c1033843A7c7eB3004c64888](https://kovan.etherscan.io/address/0x8bb37aE005ADa8f7c1033843A7c7eB3004c64888)
* Authereum Account v2019102500 = [0xFF8C7Ed14a7D3c3Cb0d62Ef001cAD39746642B33](https://kovan.etherscan.io/address/0xFF8C7Ed14a7D3c3Cb0d62Ef001cAD39746642B33)

### Goerli

* Authereum Account v2020020200 = [0xc023d33c49c5BF521fd24Ea3cd43563335813b9C](https://goerli.etherscan.io/address/0xc023d33c49c5BF521fd24Ea3cd43563335813b9C)
* Authereum Account v2020010900 = [0x7E4624F2E1C365F0f800F46c2DBfE6b62F2f4383](https://goerli.etherscan.io/address/0x7E4624F2E1C365F0f800F46c2DBfE6b62F2f4383)
* Authereum Account v2019122000 = [0x41FeB8e32C07d83FcCe95cc03e77Fb0938006E1E](https://goerli.etherscan.io/address/0x41FeB8e32C07d83FcCe95cc03e77Fb0938006E1E)
* Authereum Account v2019111500 = [0x16766E4a74433c359D8d2F31F84a6eB6d3F4d7B3](https://goerli.etherscan.io/address/0x16766E4a74433c359D8d2F31F84a6eB6d3F4d7B3)
* Authereum Account v2019102500 = [0x1d445c2B2F78e81B62bec0793D9823B462858651](https://goerli.etherscan.io/address/0x1d445c2B2F78e81B62bec0793D9823B462858651)

### Rinkeby

* Authereum Account v2020020200 = [0x679785fA2fB8A71206A161D1DA79Dbf762332019](https://rinkeby.etherscan.io/address/0x679785fA2fB8A71206A161D1DA79Dbf762332019)
* Authereum Account v2020010900 = [0x7F9E8B9203cb2718F38Ac61109DC63C68986084E](https://rinkeby.etherscan.io/address/0x7F9E8B9203cb2718F38Ac61109DC63C68986084E)
* Authereum Account v2019122000 = [0xCC44F31717aE06390Eefe6320D05bcf1d95E15CE](https://rinkeby.etherscan.io/address/0xCC44F31717aE06390Eefe6320D05bcf1d95E15CE)
* Authereum Account v2019111500 = [0xC157873c86D78b7151670fbaB4C163383a164355](https://rinkeby.etherscan.io/address/0xC157873c86D78b7151670fbaB4C163383a164355)
* Authereum Account v2019102500 = [0x0f95c1bfD98FeB165ab3B018d5DC770c27a3346e](https://rinkeby.etherscan.io/address/0x0f95c1bfD98FeB165ab3B018d5DC770c27a3346e)

### Ropsten

* Authereum Account v2020020200 = [0x87413A03aa58635530990fBB5ea4D0E1818D2328](https://ropsten.etherscan.io/address/0x87413A03aa58635530990fBB5ea4D0E1818D2328)
* Authereum Account v2020010900 = [0x8A5580515fe1413e08a71D87eEB70C037972363b](https://ropsten.etherscan.io/address/0x8A5580515fe1413e08a71D87eEB70C037972363b)
* Authereum Account v2019122000 = [0x13A56BdF8EdCB80a8995BF8B50F248429Eb4179f](https://ropsten.etherscan.io/address/0x13A56BdF8EdCB80a8995BF8B50F248429Eb4179f)
* Authereum Account v2019111500 = [0x5811DD6b41942b7B6c9C65887a80214203f23Ed3](https://ropsten.etherscan.io/address/0x5811DD6b41942b7B6c9C65887a80214203f23Ed3)
* Authereum Account v2019102500 = [0x3D1F792509293abCb451316C9f52dDA6482604e4](https://ropsten.etherscan.io/address/0x3D1F792509293abCb451316C9f52dDA6482604e4)

## Test
```bash
# In terminal 1
npm run ganache

# In terminal 2
npm run test
```

# Changelog

## Authereum Accounts

### AuthereumAccountv2020020200

  This update was in response to our Quantstamp  audit.

  **Genearl**
  * Require that initialization data has a length of > 0. Prior to this verison, it simply did nothing if the length was 0.
  * Fix typos

  **Bugfixes**
  * Return the appropriate data from `executeMultipleMetaTransactions()`

### AuthereumAccountv2020010900

  **Bugfixes**
  * Fee token rate calculation

### AuthereumAccountv2019122000

  **General**
  * Major refactor
  * Introduce fee toke

### AuthereumAccountv2019111500

  **General**
  * Architecture upgrade
  * Introduce `_feeTokenAddress` and `_feeTokenRate`

  **Bugfixes**
  * General bug fixes

### AuthereumAccountv2019102500

  **General**
  * Original contract


# FAQ

* Why am I getting the following when I run a test?
    ```bash
    connection not open on send()
    connection not open
    ```
  * Try restarting ganache and runnning `npm run truffle-reset`
  * Try running ganache-cli on a different port (either `8545` or `9545`)

  _Update: 11/19/19 - This error is related to using WebSockets. If this error persists, try using https instead, if possible._

* Why is my test failing on a simple test? It seemingly reverts even when it shouldn't.

  * It is because you are running out of gas. There is an issue with zos (<2.4.0) and ganache (>= 6.4.0) where gas estimation does not work. You must manually set the gasLimit in the transaction, for now. See [here](https://github.com/zeppelinos/zos/commit/4c2900ac3af6fd0a911c4bfeadd40631846102d7#diff-9594d32e7d1539a3d64960ff2cef07a1R220) for the proposed fix in 2.4.0rc2.

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

* Why are my tests not running at all (and the output says 0 passing)

  * This happens because there are no actual tests (i.e. there is no `it(){}`). It is
  likely that you only have `describe(){}` and/or `context(){}`.

* What are the event topics for each of the events in AuthereumAccount.sol?
  * `event Upgraded(address indexed implementation);`: `0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b`
  * `event CallFailed(string reason);`: `0xb5e1dc2ddc0e1a0221e00b3c0446f36b707001d3ac7cfb494259863fdef7ccd7`

* What is the best way to verify my contract on Etherscan?
  * Run the following command: `truffle run verify xxx@yyy --network zzz`
    * xxx = contract name (per the ABI)
    * yyy = contract address
    * zzz = network name
      * `truffle run verify AuthereumAccount@0x2e1723d1DFa2947f0d08D5c5D214b71deF4f951F --network mainnet`

* How can I retroactively verify my contract on Etherscan if it has been a while since I deployed it.
  * The best way to do this is to find the commit where the contract was deployed using `git blame`. Once the commit is found, do the following:
    * `git checkout <commit>`
    * Update truffle.js to include the `truffle-plugin-verify` plugin
    * `npm run ganache`
    * `rm -rf build && truffle compile && truffle migrate`
    * `truffle run verify xxx@yyy --network zzz`

* Why does my deplopyed address not match my calculated address?
  * It is probably the bytecode
    * One thing to look at is `src/constants`. If you updated the compiler, this will need changed, along with the code that uses that data elsewhere.

# License

[MIT](LICENSE)
