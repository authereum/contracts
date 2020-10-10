# Authereum Contracts

> Ethereum smart contracts for [Authereum](http://authereum.com)

[![License](http://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/authereum/converter/master/LICENSE)
[![dependencies Status](https://david-dm.org/authereum/contracts/status.svg)](https://david-dm.org/authereum/contracts)

_Check out the Authereum contracts bug bounty program [here](https://support.authereum.com/hc/en-us/articles/360043760793-Does-Authereum-have-a-bug-bounty-program-)!_

## Contract Design

The Authereum contracts are necessary pieces of the Authereum ecosystem. Users of the Authereum accounts own a proxy contract that points to an upgradeable logic contract. The contracts are organized in the following directories:

  * [account](#account) - The Authereum Account logic contract. All users on the Authereum platform will own a proxy contract that points to these contracts. This is upgradeable. Each users' state will live in their proxy contract but will interact with this contract.
  * [upgradeability](#upgradeability) - Upgradeability logic for Authereum accounts. Each user that joins Authereum creates a proxy (AuthereumProxy) through the Authereum proxy factory (AuthereumProxyFactory).
  * [admin](#admin) - Administrative contracts to be used by Authereum creators.
  * [base](#base) - Base contracts used throughout the system.
  * [ens](#ens) - Custom ENS contracts. Used to give Authereum users their own *.auth.eth subdomains. The Authereum ENS Resolver is upgradeable.
  * [firewall](#firewall) - Contracts that can be used as a firewall to protect user's accounts.
  * [modules](#modules) - Independent contracts that are added as Auth Keys to Authereum accounts for extended functionality.
  * [interfaces](#interfaces) - Interfaces used throughout the system.
  * [libs](#libs) - Libraries used throughout the system.
  * [test](#test) - Contracts used during tests. None of these contracts are ever deployed as part of the system.
  * [utils](#utils) - Utils used throughout the system.

### Top Level Design Decisions

When a user signs up for an account on authereum.com, a proxy contract (`upgradeability/AuthereumProxy.sol`) is created for them through the Authereum proxy factory (`upgradeability/AuthereumProxyFactory.sol`). The creation of the proxy simply points the proxy to the latest Authereum account logic (implementation) address, initializes the proxy for that logic address, and gives the proxy and ENS subdomain (*.auth.eth).

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

### modules

The Authereum contracts support "module" contracts that can be used to introduce additional functionality to an Authereum account. A module contract is added to an Authereum account by adding its address as an Auth Key. Because modules may contain critical functionality (e.g. the RecoveryModule), Login Keys should not be able to interact with modules. To prevent this, a check in `LoginKeyMetaTxAccount.sol` will revert the transaction if a Login Key's transaction's destination is an Auth Key, which may be a module. In addition, when designing modules, care should be taken to ensure Login Key's cannot interact with a module _before_ it's added to an account as an Auth Key. Both the RecoverModule and DelegateKeyModule prevent this with the `onlyWhenRegisteredModule` modifier.

## Additional Notes

### Known Issues

* A user can break their upgradeability on the Authereum system by upgrading their account to a logic address outside of the Authereum ecosystem.
* It is expected that a relayer will not broadcast a transaction that contains any data that would be detrimental to themselves. This includes:
  * Transactions that will revert (because of gas, bad data, or improperly signed data)
  * Transactions that contain a `feeTokenRate` that the relayer does not accept as a true rate
* The DelegateKeyModule does not enforce that the length of `_lockedParameters` and `_lockedParameterValues` are equal to the actual number of parameters taken by the function being registered. In addition, dynamically-sized parameters cannot be locked but this is not enforced on-chain. When registering a Delegate Key, care should be taken to ensure that `_lockedParameters` and `_lockedParameterValues` equal the number of parameters in the function being registered and that none of the parameters being locked are dynamically-sized.

### Invariants

* An attacker cannot spend the account contract's funds, freeze the funds, or participate in account management.
* Transactions from the account contract can only be authorized by an Auth Key or Login Key either directly or through a meta transaction.
* Login Keys cannot participate in account management including adding and removing auth keys and upgrading the account. Anything marked as `onlySelf` or `onlyAuthKeySenderOrSelf` should not be accessible by a Login Key.
* Login Keys should not be able to interact with the RecoveryModule or the DelegateKeyModule in a meaningful way. Modules should prevent certain interactions when the module is not registered to the account contract and the account contract should not let Login Keys invoke functionality on Auth Keys which includes any modules registered to the account contract.
* Login Keys should only be able to interact with Auth Keys and with self in a limited capacity. Transactions from Login Keys to either an Auth Key or to self should be bounded by both data and gas values.
* Login Keys can bypass restrictions by setting the `validationContract` to `address(0)`. It is expected that relayers who process transactions validate these restrictions off-chain, if desired.

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
* Semantic versioning is hard to do on file names and variables
* Sequential may cause issues down the road (ie renaming files/contracts to have more left padding)

## Addresses

### Mainnet

| Index | Contract Name | Contract Version | Address |
|---|---|---|---|
| 01 | Authereum Account             | 2020070100 | [0xe45a5176bC0F2c1198E2451C4e4501D4eD9B65a6](https://etherscan.io/address/0xe45a5176bC0F2c1198E2451C4e4501D4eD9B65a6)
| 02 | Authereum Account             | 2020060100 | [0x237EDCDd43349227ef511581Cc834962ECf23076](https://etherscan.io/address/0x237EDCDd43349227ef511581Cc834962ECf23076)
| 03 | Authereum Account             | 2020021700 | [0x20AF9E54a3670EF6a601bcA1f1EC22b1f93CBE23](https://etherscan.io/address/0x20AF9E54a3670EF6a601bcA1f1EC22b1f93CBE23)
| 04 | Authereum Account             | 2020020200 | [0x2e1723d1DFa2947f0d08D5c5D214b71deF4f951F](https://etherscan.io/address/0x2e1723d1DFa2947f0d08D5c5D214b71deF4f951F)
| 05 | Authereum Account             | 2020010900 | [0x79fEe076B1BcD4054DFF0B4364C26899492198dc](https://etherscan.io/address/0x79fEe076B1BcD4054DFF0B4364C26899492198dc)
| 06 | Authereum Account             | 2019122000 | [0x211deB5c0a28A213FcF5976Ac22c70fF96b9004C](https://etherscan.io/address/0x211deB5c0a28A213FcF5976Ac22c70fF96b9004C)
| 07 | Authereum Account             | 2019111500 | [0x185c46c8d3EF5155F3678e69c827dB7a2116a6Cd](https://etherscan.io/address/0x185c46c8d3EF5155F3678e69c827dB7a2116a6Cd)
| 08 | Authereum Account             | 2019102500 | [0xD8CaB604BDd8cBb7c3eb0c26f7DC3AbFfb005A92](https://etherscan.io/address/0xD8CaB604BDd8cBb7c3eb0c26f7DC3AbFfb005A92)
| 09 | Authereum ENS Manager         | 2020070100 | [0xcB586eA6F8804003e8B51832c8789B5aC9720d24](https://etherscan.io/address/0xcB586eA6F8804003e8B51832c8789B5aC9720d24)
| 10 | Authereum ENS Manager         | 2020020200 | [0xd2dF497A03A67ebcF9c0Cf62E9165d52f634A2ae](https://etherscan.io/address/0xd2dF497A03A67ebcF9c0Cf62E9165d52f634A2ae)
| 11 | Authereum ENS Manager         | 2019111500 | [0x9442A2Eff399a9e97BCC6B2a4194399496F76e59](https://etherscan.io/address/0x9442A2Eff399a9e97BCC6B2a4194399496F76e59)
| 12 | Authereum ENS Manager         | 2019102500 | [0x6DCC6577650BBF5B70E9EeE7Cfd1364410867206](https://etherscan.io/address/0x6DCC6577650BBF5B70E9EeE7Cfd1364410867206)
| 13 | Authereum ENS Resolver        | 2019111500 | [0xA42D000187bd8d997df54267e4b27c08329fDFe1](https://etherscan.io/address/0xA42D000187bd8d997df54267e4b27c08329fDFe1)
| 14 | Authereum ENS Resolver        | 2019102500 | [0xd54FFAb6df175a7751e6E50373d213242DE938c3](https://etherscan.io/address/0xd54FFAb6df175a7751e6E50373d213242DE938c3)
| 15 | Authereum ENS Resolver Proxy  | 2019111500 | [0x4DA86a24e30a188608E1364A2D262166a87fCB7C](https://etherscan.io/address/0x4DA86a24e30a188608E1364A2D262166a87fCB7C)
| 16 | Authereum Proxy Factory       | 2020070100 | [0x260BA21bC0aE8DF6495FB0BC6de5d4d9B2814a1a](https://etherscan.io/address/0x260BA21bC0aE8DF6495FB0BC6de5d4d9B2814a1a) 
| 17 | Authereum Proxy Factory       | 2019111500 | [0x69c0047531FD1cc24dAa9Eccd221Cb66b53c63f8](https://etherscan.io/address/0x69c0047531FD1cc24dAa9Eccd221Cb66b53c63f8) 
| 18 | Authereum Proxy Factory       | 2019102500 | [0x0D54d0F1C1F5FE7a525713B85F36dE8fB6014046](https://etherscan.io/address/0x0D54d0F1C1F5FE7a525713B85F36dE8fB6014046) 
| 19 | Authereum Delegate Key Module | 2020070100 | [0xCCfe999a3Bb7922A5F4595e5d5F95C43FFf0692E](https://etherscan.io/address/0xCCfe999a3Bb7922A5F4595e5d5F95C43FFf0692E)
| 20 | Authereum Recovery Module     | 2020070100 | [0x891c1A794164C0DDaB3182c2b1b436b51B1F8B64](https://etherscan.io/address/0x891c1A794164C0DDaB3182c2b1b436b51B1F8B64)
| 21 | Authereum Login Key Validator | 2020070100 | [0x4Af9d139B2E6739fd05fc5b9a06FA8B4df0A8d20](https://etherscan.io/address/0x4Af9d139B2E6739fd05fc5b9a06FA8B4df0A8d20)
| 22 | ENS Registry                  | Public     | [0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e](https://etherscan.io/address/0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e)
| 23 | ENS Reverse Registrar         | Public     | [0x084b1c3C81545d370f3634392De611CaaBFf8148](https://etherscan.io/address/0x084b1c3C81545d370f3634392De611CaaBFf8148)

### Kovan

| Index | Contract Name | Contract Version | Address |
|---|---|---|---|
| 01 | Authereum Account             | 2020070100 | [0x5bD8b14f5F95b3f85Dab33e2281e936DDB5947a7](https://kovan.etherscan.io/address/0x5bD8b14f5F95b3f85Dab33e2281e936DDB5947a7)
| 02 | Authereum Account             | 2020060100 | [0x2072694ce1C8352FEa2FBA5CbA54839a4b62cF87](https://kovan.etherscan.io/address/0x2072694ce1C8352FEa2FBA5CbA54839a4b62cF87)
| 03 | Authereum Account             | 2020021700 | [0xD6A8E40C149aEA415DdC7a7F7743737Cd73e75a3](https://kovan.etherscan.io/address/0xD6A8E40C149aEA415DdC7a7F7743737Cd73e75a3)
| 04 | Authereum Account             | 2020020200 | [0x090D1E26170e5Db316B9a86b0d61601285f463A3](https://kovan.etherscan.io/address/0x090D1E26170e5Db316B9a86b0d61601285f463A3)
| 05 | Authereum Account             | 2020010900 | [0x024B110390FE302f6Ce1A2d81B9F3595B44179f4](https://kovan.etherscan.io/address/0x024B110390FE302f6Ce1A2d81B9F3595B44179f4)
| 06 | Authereum Account             | 2019122000 | [0xF29a9ACE9820dB1E0C92AAE20D9e32C7ce34D6E6](https://kovan.etherscan.io/address/0xF29a9ACE9820dB1E0C92AAE20D9e32C7ce34D6E6)
| 07 | Authereum Account             | 2019111500 | [0x8bb37aE005ADa8f7c1033843A7c7eB3004c64888](https://kovan.etherscan.io/address/0x8bb37aE005ADa8f7c1033843A7c7eB3004c64888)
| 08 | Authereum Account             | 2019102500 | [0xFF8C7Ed14a7D3c3Cb0d62Ef001cAD39746642B33](https://kovan.etherscan.io/address/0xFF8C7Ed14a7D3c3Cb0d62Ef001cAD39746642B33)
| 09 | Authereum ENS Manager         | 2020070100 | [0xAAb616857bB081006AE2C5E2C66e5422962F4FFF](https://kovan.etherscan.io/address/0xAAb616857bB081006AE2C5E2C66e5422962F4FFF)
| 10 | Authereum ENS Manager         | 2019111500 | [0x907925001C35431b154CE607E16e10Da309861A4](https://kovan.etherscan.io/address/0x907925001C35431b154CE607E16e10Da309861A4)
| 11 | Authereum ENS Manager         | 2019102500 | [0x1e397332f1e171CE06F37184f545Ef6B948278d5](https://kovan.etherscan.io/address/0x1e397332f1e171CE06F37184f545Ef6B948278d5)
| 12 | Authereum ENS Resolver        | 2019111500 | [0x05d104DA15491946c304987964D9B6bab6e38a12](https://kovan.etherscan.io/address/0x05d104DA15491946c304987964D9B6bab6e38a12)
| 13 | Authereum ENS Resolver        | 2019102500 | [0xb2eb9eb62C741f7Ee17f022A1132394ba5002e02](https://kovan.etherscan.io/address/0xb2eb9eb62C741f7Ee17f022A1132394ba5002e02)
| 14 | Authereum Proxy Factory       | 2020070100 | [0xdFa2b3Cc9258D26bb594514BbEc26F378004ED50](https://kovan.etherscan.io/address/0xdFa2b3Cc9258D26bb594514BbEc26F378004ED50) 
| 15 | Authereum Proxy Factory       | 2019111500 | [0x8C88C40bDEb6ad9cB5f1Fcc9B7e7C7Dc575bA1AB](https://kovan.etherscan.io/address/0x8C88C40bDEb6ad9cB5f1Fcc9B7e7C7Dc575bA1AB) 
| 16 | Authereum Proxy Factory       | 2019102500 | [0xef6738bDe15085294edACd337F616F7Bc6adCD73](https://kovan.etherscan.io/address/0xef6738bDe15085294edACd337F616F7Bc6adCD73) 
| 17 | Authereum Delegate Key Module | 2020070100 | [0x3306adF7DD266FBadADE35380DD2e884A5ccE344](https://kovan.etherscan.io/address/0x3306adF7DD266FBadADE35380DD2e884A5ccE344)
| 18 | Authereum Recovery Module     | 2020070100 | [0x03D038BFD70af73496A6DD7631cC39f2183A383F](https://kovan.etherscan.io/address/0x03D038BFD70af73496A6DD7631cC39f2183A383F)
| 19 | Authereum Login Key Validator | 2020070100 | [0x50a600111AFf466E96B280F04d8107F1E0cC8BF8](https://kovan.etherscan.io/address/0x50a600111AFf466E96B280F04d8107F1E0cC8BF8)
| 20 | ENS Registry                  | Public     | [0xb794A9c50a132f3Eb3Cee5f5e927f6F4D1420B70](https://kovan.etherscan.io/address/0xb794A9c50a132f3Eb3Cee5f5e927f6F4D1420B70)
| 21 | ENS Reverse Registrar         | Public     | [0xB84F94d5bf1ef3a117bA3B00F53f9b546E1f3baa](https://kovan.etherscan.io/address/0xB84F94d5bf1ef3a117bA3B00F53f9b546E1f3baa)

### Goerli

| Index | Contract Name | Contract Version | Address |
|---|---|---|---|
| 01 | Authereum Account             | 2020070100 | [0x5D2fE97854770739e3e1F26CdE234Ac0EEF2f8C9](https://goerli.etherscan.io/address/0x5D2fE97854770739e3e1F26CdE234Ac0EEF2f8C9)
| 02 | Authereum Account             | 2020060100 | [0x7141C7C9aAA6BdDa07a646E446461c2D32907B46](https://goerli.etherscan.io/address/0x7141C7C9aAA6BdDa07a646E446461c2D32907B46)
| 03 | Authereum Account             | 2020021700 | [0xD6A8E40C149aEA415DdC7a7F7743737Cd73e75a3](https://goerli.etherscan.io/address/0xD6A8E40C149aEA415DdC7a7F7743737Cd73e75a3)
| 04 | Authereum Account             | 2020020200 | [0xc023d33c49c5BF521fd24Ea3cd43563335813b9C](https://goerli.etherscan.io/address/0xc023d33c49c5BF521fd24Ea3cd43563335813b9C)
| 05 | Authereum Account             | 2020010900 | [0x7E4624F2E1C365F0f800F46c2DBfE6b62F2f4383](https://goerli.etherscan.io/address/0x7E4624F2E1C365F0f800F46c2DBfE6b62F2f4383)
| 06 | Authereum Account             | 2019122000 | [0x41FeB8e32C07d83FcCe95cc03e77Fb0938006E1E](https://goerli.etherscan.io/address/0x41FeB8e32C07d83FcCe95cc03e77Fb0938006E1E)
| 07 | Authereum Account             | 2019111500 | [0x16766E4a74433c359D8d2F31F84a6eB6d3F4d7B3](https://goerli.etherscan.io/address/0x16766E4a74433c359D8d2F31F84a6eB6d3F4d7B3)
| 08 | Authereum Account             | 2019102500 | [0x1d445c2B2F78e81B62bec0793D9823B462858651](https://goerli.etherscan.io/address/0x1d445c2B2F78e81B62bec0793D9823B462858651)
| 09 | Authereum ENS Manager         | 2020070100 | [0x1Deb8B4354415C763a6ade1CEe8cDA92d2E434e9](https://goerli.etherscan.io/address/0x1Deb8B4354415C763a6ade1CEe8cDA92d2E434e9)
| 10 | Authereum ENS Manager         | 2019111500 | [0xFf04927cab4a86a459A9D619FA5BF1B8a7015256](https://goerli.etherscan.io/address/0xFf04927cab4a86a459A9D619FA5BF1B8a7015256)
| 11 | Authereum ENS Manager         | 2019102500 | [0xbCB45bC4E0Ec6363B78CF28Eb60D06B2e94B7206](https://goerli.etherscan.io/address/0xbCB45bC4E0Ec6363B78CF28Eb60D06B2e94B7206)
| 12 | Authereum ENS Resolver        | 2019111500 | [0x796E0bcA1E75A23bc01CC714c7B67f12B945Dc0f](https://goerli.etherscan.io/address/0x796E0bcA1E75A23bc01CC714c7B67f12B945Dc0f)
| 13 | Authereum ENS Resolver        | 2019102500 | [0xb4D7b5c4f6A6d335876aE3df4C80e0E3B78462D6](https://goerli.etherscan.io/address/0xb4D7b5c4f6A6d335876aE3df4C80e0E3B78462D6)
| 14 | Authereum Proxy Factory       | 2020070100 | [0x4636e9dc617D132596634f07Ec17EeB662b1dF00](https://goerli.etherscan.io/address/0x4636e9dc617D132596634f07Ec17EeB662b1dF00) 
| 15 | Authereum Proxy Factory       | 2019111500 | [0xd6FA6Bea6950288710101090b625a1d3b33a73c3](https://goerli.etherscan.io/address/0xd6FA6Bea6950288710101090b625a1d3b33a73c3) 
| 16 | Authereum Proxy Factory       | 2019102500 | [0x5C9E807Cbd3430d64C2e23f51eC8CF4b65aa3805](https://goerli.etherscan.io/address/0x5C9E807Cbd3430d64C2e23f51eC8CF4b65aa3805) 
| 17 | Authereum Delegate Key Module | 2020070100 | [0x907925001C35431b154CE607E16e10Da309861A4](https://goerli.etherscan.io/address/0x907925001C35431b154CE607E16e10Da309861A4)
| 18 | Authereum Recovery Module     | 2020070100 | [0x90A56F8921954119b1a84FEC14577D8285500cE1](https://goerli.etherscan.io/address/0x90A56F8921954119b1a84FEC14577D8285500cE1)
| 19 | Authereum Login Key Validator | 2020070100 | [0x50a600111AFf466E96B280F04d8107F1E0cC8BF8](https://goerli.etherscan.io/address/0x50a600111AFf466E96B280F04d8107F1E0cC8BF8)
| 20 | ENS Registry                  | Public     | [0xFe25cd5cDFbb8d031Df5b6Ba97365b3A125ca504](https://goerli.etherscan.io/address/0xFe25cd5cDFbb8d031Df5b6Ba97365b3A125ca504)
| 21 | ENS Reverse Registrar         | Public     | [0x5728ABcBaf1B94E1a89C2a5403B179ee6A0F51f6](https://goerli.etherscan.io/address/0x5728ABcBaf1B94E1a89C2a5403B179ee6A0F51f6)

### Rinkeby

| Index | Contract Name | Contract Version | Address |
|---|---|---|---|
| 01 | Authereum Account             | 2020070100 | [0xE222D26708c646991Dc8685f5EDc62643514Efc4](https://rinkeby.etherscan.io/address/0xE222D26708c646991Dc8685f5EDc62643514Efc4)
| 02 | Authereum Account             | 2020060100 | [0x05a17e0aD6238c6fB0bB08Aa6a7e5AFC7A9266e9](https://rinkeby.etherscan.io/address/0x05a17e0aD6238c6fB0bB08Aa6a7e5AFC7A9266e9)
| 03 | Authereum Account             | 2020021700 | [0x4636e9dc617D132596634f07Ec17EeB662b1dF00](https://rinkeby.etherscan.io/address/0x4636e9dc617D132596634f07Ec17EeB662b1dF00)
| 04 | Authereum Account             | 2020020200 | [0x679785fA2fB8A71206A161D1DA79Dbf762332019](https://rinkeby.etherscan.io/address/0x679785fA2fB8A71206A161D1DA79Dbf762332019)
| 05 | Authereum Account             | 2020010900 | [0x7F9E8B9203cb2718F38Ac61109DC63C68986084E](https://rinkeby.etherscan.io/address/0x7F9E8B9203cb2718F38Ac61109DC63C68986084E)
| 06 | Authereum Account             | 2019122000 | [0xCC44F31717aE06390Eefe6320D05bcf1d95E15CE](https://rinkeby.etherscan.io/address/0xCC44F31717aE06390Eefe6320D05bcf1d95E15CE)
| 07 | Authereum Account             | 2019111500 | [0xC157873c86D78b7151670fbaB4C163383a164355](https://rinkeby.etherscan.io/address/0xC157873c86D78b7151670fbaB4C163383a164355)
| 08 | Authereum Account             | 2019102500 | [0x0f95c1bfD98FeB165ab3B018d5DC770c27a3346e](https://rinkeby.etherscan.io/address/0x0f95c1bfD98FeB165ab3B018d5DC770c27a3346e)
| 09 | Authereum ENS Manager         | 2020070100 | [0x89aB9fEBF7D9b3cc55d36b8616994B5cC8C20832](https://rinkeby.etherscan.io/address/0x89aB9fEBF7D9b3cc55d36b8616994B5cC8C20832)
| 10 | Authereum ENS Manager         | 2019111500 | [0x4C37952d749948B6F4C8A135EFfa4d5038b62577](https://rinkeby.etherscan.io/address/0x4C37952d749948B6F4C8A135EFfa4d5038b62577)
| 11 | Authereum ENS Manager         | 2019102500 | [0x86Ae991f87a5d0C132C5A222117b6B19eAf67967](https://rinkeby.etherscan.io/address/0x86Ae991f87a5d0C132C5A222117b6B19eAf67967)
| 12 | Authereum ENS Resolver        | 2019111500 | [0x690a5BbF31657f7713f4c25B1b5f5c57E2B5fEFF](https://rinkeby.etherscan.io/address/0x690a5BbF31657f7713f4c25B1b5f5c57E2B5fEFF)
| 13 | Authereum ENS Resolver        | 2019102500 | [0x2268C358fb636896913ADc2187BEb054C2E66199](https://rinkeby.etherscan.io/address/0x2268C358fb636896913ADc2187BEb054C2E66199)
| 14 | Authereum Proxy Factory       | 2020070100 | [0x4Dad098187ec81dDebB9BD3f7FbE10408e32F292](https://rinkeby.etherscan.io/address/0x4Dad098187ec81dDebB9BD3f7FbE10408e32F292) 
| 15 | Authereum Proxy Factory       | 2019111500 | [0x82931636003B155b7e08aD9519DCec0280FBe4C5](https://rinkeby.etherscan.io/address/0x82931636003B155b7e08aD9519DCec0280FBe4C5) 
| 16 | Authereum Proxy Factory       | 2019102500 | [0xb05e3F5DdECABAadc3b02A9259DB0CBD9656aFbB](https://rinkeby.etherscan.io/address/0xb05e3F5DdECABAadc3b02A9259DB0CBD9656aFbB) 
| 17 | Authereum Delegate Key Module | 2020070100 | [0x03D038BFD70af73496A6DD7631cC39f2183A383F](https://rinkeby.etherscan.io/address/0x03D038BFD70af73496A6DD7631cC39f2183A383F)
| 18 | Authereum Recovery Module     | 2020070100 | [0x04C47f60AA9b4F69b054cAF57D673D1697375282](https://rinkeby.etherscan.io/address/0x04C47f60AA9b4F69b054cAF57D673D1697375282)
| 19 | Authereum Login Key Validator | 2020070100 | [0x7141C7C9aAA6BdDa07a646E446461c2D32907B46](https://rinkeby.etherscan.io/address/0x7141C7C9aAA6BdDa07a646E446461c2D32907B46)
| 20 | ENS Registry                  | Public     | [0x5Ed073f8669Ea5145D43B199F59c4CB44acBBAd1](https://rinkeby.etherscan.io/address/0x5Ed073f8669Ea5145D43B199F59c4CB44acBBAd1)
| 21 | ENS Reverse Registrar         | Public     | [0xd860Da7b9600f4A24eE7228260744D385e22B389](https://rinkeby.etherscan.io/address/0xd860Da7b9600f4A24eE7228260744D385e22B389)

### Ropsten

| Index | Contract Name | Contract Version | Address |
|---|---|---|---|
| 01 | Authereum Account             | 2020070100 | [0x5bD8b14f5F95b3f85Dab33e2281e936DDB5947a7](https://ropsten.etherscan.io/address/0x5bD8b14f5F95b3f85Dab33e2281e936DDB5947a7)
| 02 | Authereum Account             | 2020060100 | [0x3ADc2cF2354380CBe022BcE532A14c78EAcae6bA](https://ropsten.etherscan.io/address/0x3ADc2cF2354380CBe022BcE532A14c78EAcae6bA)
| 03 | Authereum Account             | 2020021700 | [0x4636e9dc617D132596634f07Ec17EeB662b1dF00](https://ropsten.etherscan.io/address/0x4636e9dc617D132596634f07Ec17EeB662b1dF00)
| 04 | Authereum Account             | 2020020200 | [0x87413A03aa58635530990fBB5ea4D0E1818D2328](https://ropsten.etherscan.io/address/0x87413A03aa58635530990fBB5ea4D0E1818D2328)
| 05 | Authereum Account             | 2020010900 | [0x8A5580515fe1413e08a71D87eEB70C037972363b](https://ropsten.etherscan.io/address/0x8A5580515fe1413e08a71D87eEB70C037972363b)
| 06 | Authereum Account             | 2019122000 | [0x13A56BdF8EdCB80a8995BF8B50F248429Eb4179f](https://ropsten.etherscan.io/address/0x13A56BdF8EdCB80a8995BF8B50F248429Eb4179f)
| 07 | Authereum Account             | 2019111500 | [0x5811DD6b41942b7B6c9C65887a80214203f23Ed3](https://ropsten.etherscan.io/address/0x5811DD6b41942b7B6c9C65887a80214203f23Ed3)
| 08 | Authereum Account             | 2019102500 | [0x3D1F792509293abCb451316C9f52dDA6482604e4](https://ropsten.etherscan.io/address/0x3D1F792509293abCb451316C9f52dDA6482604e4)
| 09 | Authereum ENS Manager         | 2020070100 | [0x36eD94B328F583639dB3114b2fDa23f99C38a9A5](https://ropsten.etherscan.io/address/0x36eD94B328F583639dB3114b2fDa23f99C38a9A5)
| 10 | Authereum ENS Manager         | 2019111500 | [0x37F6c27C72819Cf800A75F3f3FC0cf3BA719Bf40](https://ropsten.etherscan.io/address/0x37F6c27C72819Cf800A75F3f3FC0cf3BA719Bf40)
| 11 | Authereum ENS Manager         | 2019102500 | [0x5dafd0015D8E2583FFB5262b1537f614AD8c07A0](https://ropsten.etherscan.io/address/0x5dafd0015D8E2583FFB5262b1537f614AD8c07A0)
| 12 | Authereum ENS Resolver        | 2019111500 | [0x82957328C8518eBf930101E8e6611c137F985B3B](https://ropsten.etherscan.io/address/0x82957328C8518eBf930101E8e6611c137F985B3B)
| 13 | Authereum ENS Resolver        | 2019102500 | [0x9205a60C0A930311C3aF1c7738180706B5609CD9](https://ropsten.etherscan.io/address/0x9205a60C0A930311C3aF1c7738180706B5609CD9)
| 14 | Authereum Proxy Factory       | 2020070100 | [0x90A56F8921954119b1a84FEC14577D8285500cE1](https://ropsten.etherscan.io/address/0x90A56F8921954119b1a84FEC14577D8285500cE1) 
| 15 | Authereum Proxy Factory       | 2019111500 | [0x01068575e9796e680913401B5a72b24E9e1d7ba2](https://ropsten.etherscan.io/address/0x01068575e9796e680913401B5a72b24E9e1d7ba2) 
| 16 | Authereum Proxy Factory       | 2019102500 | [0x601581e5C007fA944c3B53124B2E3de466d2D768](https://ropsten.etherscan.io/address/0x601581e5C007fA944c3B53124B2E3de466d2D768) 
| 17 | Authereum Delegate Key Module | 2020070100 | [0x3306adF7DD266FBadADE35380DD2e884A5ccE344](https://ropsten.etherscan.io/address/0x3306adF7DD266FBadADE35380DD2e884A5ccE344)
| 18 | Authereum Recovery Module     | 2020070100 | [0x03D038BFD70af73496A6DD7631cC39f2183A383F](https://ropsten.etherscan.io/address/0x03D038BFD70af73496A6DD7631cC39f2183A383F)
| 19 | Authereum Login Key Validator | 2020070100 | [0x932EC02d2ADB59B9ad705019098966Dd6DA20fF0](https://ropsten.etherscan.io/address/0x932EC02d2ADB59B9ad705019098966Dd6DA20fF0)
| 20 | ENS Registry                  | Public     | [0xc84E335bB9F3c097D67d7AE3f10C16c0A171aD26](https://ropsten.etherscan.io/address/0xc84E335bB9F3c097D67d7AE3f10C16c0A171aD26)
| 21 | ENS Reverse Registrar         | Public     | [0x4dcAcb91D04cA0f1FF1FE0eE321bd4582d674e40](https://ropsten.etherscan.io/address/0x4dcAcb91D04cA0f1FF1FE0eE321bd4582d674e40)

## Test

_Note: this requires a `ganache-cli` version with the muirGlacier compiler. Please use `ganache-cli@6.9.0` or greater._

```bash
# In terminal 1
npm run ganache

# In terminal 2
npm run test
```

## Changelog

### Authereum Account

#### 2020070100

  This update introduces a number of new features and cleans up existing code. It was audited by G0 Group.

  **General**
  * Update contract to Solidity 0.5.17
  * Normalize `loginKeyRestrictionData` to `loginKeyRestrictionsData`
  * Fix spelling issues
  * Remove 0 fee payments (don't transfer 0 tokens/ETH)
  * Remove refund check (now done by relayer)
  * Change all instances of `authereum.eth` to `auth.eth`
  * Update to Truffle `istanbul` compiler
  * Remove unnecessary return of the message hash from `_atomicExecuteMultipleMetaTransactions`
  * Add ERC777 support
  * Allow for limited sending of transactions from a login key to an auth key or self
  * Disallow auth keys from being `self`
  * Remove unused `onlyAuthKeySender` modifier
  * Add pre- and post-hooks to login key transactions
  * Add `name` variable to contracts
  * Convert `authereumVersion` to `version`
  * Add `implementation()`
  * Add `implementation()` and `upgradeToAndCall()` to `IAuthereumAccount.sol`
  * Add `executeMultipleTransactions()` function and scope it to auth keys
  * Update `executeMultipleMetaTransactions()` function scope to self
  * Update ERC1271 logic to reflect newly finalized specification
  * Add initialization v2 contract that registers the contract with the 1820 registry

  **Tests**
  * Add tests

#### 2020060100

  This update adds the ability to pay for contract deployments:

  **General**
  * Add logic to allow users to pay for deployments of their contracts

#### 2020021700

  This update is in response to samczsun's disclosure:

  **Bugfixes**
  * Validate both auth key and login key tx prior to execution

#### 2020020200

  This update is in response to our Quantstamp audit.

  **General**
  * Require that initialization data has a length of > 0. Prior to this version, it simply did nothing if the length was 0.
  * Fix typos

  **Bugfixes**
  * Return the appropriate data from `executeMultipleMetaTransactions()`

#### 2020010900

  **Bugfixes**
  * Fee token rate calculation

#### 2019122000

  **General**
  * Major refactor
  * Introduce fee toke

#### 2019111500

  **General**
  * Architecture upgrade
  * Introduce `_feeTokenAddress` and `_feeTokenRate`

  **Bugfixes**
  * General bug fixes

#### 2019102500

  **General**
  * Original contract

### Authereum Proxy Factory

#### 2020070100

  **General**
  * Update contract to Solidity 0.5.17
  * Add `name`
  * Add `version`
  * Pass `initCode` directly into the constructor
  * Hash `initData` in the `create2` salt to validate auth key
  * Update `salt` naming convention to be more explicit
  * Pass `_implementation` into the `createProxy()` function
  * Add `_implementation` to the salt hash

#### 2019111500

  **General**
  * Add `initCode` setter and change event
  * Add `authereumEnsManager` setter and change event

#### 2019102500

  **General**
  * Original contract

### Authereum ENS Manager

#### 2020070100

  **General**
  * Update contract to Solidity 0.5.17
  * Add `name`
  * Add `version`
  * Update internal variable from `name` to `_name`

#### 2019111500

  **General**
  * Add ability to change rootnode text
  * Add ability to change rootnode contenthash

#### 2019102500

  **General**
  * Original contract

### Authereum ENS Resolver

#### 2020070100

  **General**
  * Update contract to Solidity 0.5.17
  * Add `version`

#### 2019111500

  **General**
  * Update contract to Solidity 0.5.12
  * Add `text` and `contenthash` to interface
  * Add `text` and `contenthash` as setter and getter

#### 2019102500

  **General**
  * Original contract

### Authereum Delegate Key Module

#### 2020070100

  **General**
  * Original contract

### Authereum Recovery Module

#### 2020070100

  **General**
  * Original contract

### Authereum Login Key Validator

#### 2020070100

  **General**
  * Original contract

# License

[MIT](LICENSE)
