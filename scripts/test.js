require('dotenv').config()
const { sha3, padLeft } = require('web3-utils');
const util = require('util')
const Web3 = require('web3')
const contract = require('truffle-contract')
const HDWalletProvider = require('truffle-hdwallet-provider')
const PrivateKeyProvider = require('truffle-privatekey-provider')

let provider = new Web3.providers.HttpProvider('http://localhost:8545')

let network = process.argv[2]
const infuraId = process.env.INFURA_ID

if (network && network != 'development') {
  const url = `https://${network}.infura.io/v3/${infuraId}`
  let key = process.env.PRIVATE_KEY
  if (process.env.MNEMONIC) {
    key = process.env.MNEMONIC
  }

  provider = new HDWalletProvider(key, url)
}

const web3 = new Web3(provider)

const Account = require('../build/contracts/Account.json')
const AccountProxy = require('../build/contracts/AccountProxy.json')
const AccountFactory = require('../build/contracts/AccountFactory.json')
const ENSRegistry = require('../build/contracts/ENSRegistry.json')

const { soliditySha3, toChecksumAddress, BN } = web3.utils
const { getGasPrice, sign } = web3.eth

function getEnsLabelHash(name) {
  const [label] = name.split('.');
  return sha3(label);
}

function getEnsNameHash(name) {
  let result = padLeft('0x0', 64);
  const labels = name.split('.');

  for (let i = labels.length - 1; i >= 0; i -= 1) {
    const labelHash = sha3(labels[i])
      .substr(2);
    result = sha3(`${result}${labelHash}`);
  }

  return result;
}

function getMethodSign(name, ...params) {
  return sha3(`${name}(${params.join(',')})`)
    .substr(0, 10);
}

function computeContractAddress(deployer, salt, byteCode) {
  const hash = soliditySha3(
    '0xff',
    deployer,
    salt,
    sha3(byteCode),
  );

  return toChecksumAddress(
    `0x${hash.substr(-40)}`,
  );
}

async function test() {
  const alice = '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1'

  const AccountProxyContract = contract(AccountProxy)
  AccountProxyContract.setProvider(provider)

  const ENSRegistryContract = contract(ENSRegistry)
  ENSRegistryContract.setProvider(provider)

  const AccountFactoryContract = contract(AccountFactory)
  AccountFactoryContract.setProvider(provider)

  const factory = await AccountFactoryContract.at('0x0290FB167208Af455bB137780163b7B7a9a10C16')

  const tx = await factory.createAccount('0x00', '0x00', 0, '0x0', {
    from: alice
  })

  console.log(JSON.stringify(tx, null, 2))

  process.exit(0)
}

test()
