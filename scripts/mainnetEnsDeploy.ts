require('dotenv').config()
// const { sha3, padLeft } = require('web3-utils');
// const util = require('util')
const Web3 = require('web3')
// const contract = require('truffle-contract')
// const HDWalletProvider = require('truffle-hdwallet-provider')
// const PrivateKeyProvider = require('truffle-privatekey-provider')

// Etheres imports
// import * as config from '../config'
// import web3, { provider } from '../relayer/web3'
import * as ethers from 'ethers'
const namehash = require('eth-ens-namehash')

const EnsRegistry = require('../build/contracts/EnsRegistry.json')
const AuthereumEnsResolver = require('../build/contracts/AuthereumEnsResolver.json')
const EnsReverseRegistrar = require('../build/contracts/EnsReverseRegistrar.json')
const AuthereumEnsManager = require('../build/contracts/AuthereumENSManager.json')
const EnsBaseRegistrar = require('../build/contracts/EnsBaseRegistrar.json')

const networkName = 'mainnet'
const infuraId = process.env.INFURA_ID
const httpProviderUri = `https://infura.io/v3/${infuraId}`

let provider = new Web3.providers.HttpProvider(httpProviderUri)
const web3 = new Web3(provider)

const { ZWeb3 } = require('zos-lib')
// const { setENSDefaults } = require('../test/utils/utils')

ZWeb3.initialize(web3.currentProvider)

// TODO: Await each transaction

// Set main vs test domains
let deployType = 'test'
let labelToUse
let tokenId
let DEPLOYED_AUTHEREUM_ENS_RESOLVER_ADDRESS
let DEPLOYED_AUTHEREUM_ENS_MANAGER
if (deployType === 'real') {
  labelToUse = 'authereum'
  tokenId = 0xEE794A0D106391FA3E778D214D16F504B2211FC0EE95B6AF522D8736943903A1
} else if (deployType === 'test') {
  labelToUse = 'testauthereum'
  tokenId = '0x9a9b8c907d02d896f8edf4068e014230bbc947ee81c30f8df0ca48c15ed3bf88'
  DEPLOYED_AUTHEREUM_ENS_RESOLVER_ADDRESS = '0x9604DD189B2d293d7f7fb540E273ac4daA0a48F7'
  DEPLOYED_AUTHEREUM_ENS_MANAGER = '0x8016194885195C4eD3ff553D52F7234654FF098C'
}
const AUTHEREUM_OWNER_ADDRESS = '0xaa0c264788F94EB24F6cA150449b3048777e11Ca'
const ENS_REGISTRY_ADDRESS = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e'
const ENS_REVERSE_REGISTRAR_ADDRESS = '0x9062C0A6Dbd6108336BcBe4593a3D1cE05512069'
const ENS_BASE_REGISTRAR_ADDRESS = '0xFaC7BEA255a6990f749363002136aF6556b31e04'

const AUTHEREUM_OWNER_PRIVATE_KEY = process.env.AUTHEREUM_OWNER_PRIVATE_KEY

async function deployEns () {
  const timelockContractAddress = '0xaa0c264788F94EB24F6cA150449b3048777e11Ca'  // To be changed after deployment
  const ethLabel = 'eth'
  const authereumLabel = labelToUse
  const reverseLabel = 'reverse'
  const addrLabel = 'addr'
  const authereumDotEthDomain = authereumLabel + '.' + ethLabel

  // Hashes
  const ethHash = web3.utils.soliditySha3(ethLabel)
  const authereumHash = web3.utils.soliditySha3(authereumLabel)
  const reverseHash = web3.utils.soliditySha3(reverseLabel)
  const addrHash = web3.utils.soliditySha3(addrLabel)

  // Nodes
  const ethTldNode = namehash.hash(ethLabel)
  const authereumDotEthNode = namehash.hash(authereumDotEthDomain)
  const reverseTldNode = namehash.hash(reverseLabel)

  // Create ethers.js contract factories
  const ethersProvider = new ethers.providers.InfuraProvider(networkName, httpProviderUri)
  const wallet = new ethers.Wallet(AUTHEREUM_OWNER_PRIVATE_KEY, ethersProvider)

  // Deploy contracts
  const ensRegistryFactory = new ethers.ContractFactory(EnsRegistry.abi, EnsRegistry.bytecode, wallet)
  const authereumEnsResolverFactory = new ethers.ContractFactory(AuthereumEnsResolver.abi, AuthereumEnsResolver.bytecode, wallet)
  const ensReverseRegistrarFactory = new ethers.ContractFactory(EnsReverseRegistrar.abi, EnsReverseRegistrar.bytecode, wallet)
  const authereumEnsManagerFactory = new ethers.ContractFactory(AuthereumEnsManager.abi, AuthereumEnsManager.bytecode, wallet)
  const ensBaseRegistrarFactory = new ethers.ContractFactory(EnsBaseRegistrar.abi, EnsBaseRegistrar.bytecode, wallet)
  console.log('Set up factories...')

  // Set up instances
  // NOTE: The addresses are already deployed here.
  // NOTE: If new addresses need to be deployed, uncommend the two lines that are commented out below
  const ensRegistry = ensRegistryFactory.attach(ENS_REGISTRY_ADDRESS)
  console.log(`ENS Registry Address = ${ensRegistry.address}`)
  await ensRegistry.deployed()

  const authereumEnsResolver = authereumEnsResolverFactory.attach(DEPLOYED_AUTHEREUM_ENS_RESOLVER_ADDRESS)
  // const authereumEnsResolver = await authereumEnsResolverFactory.deploy(ensRegistry.address, AUTHEREUM_OWNER_ADDRESS)
  console.log(`Authreum Ens Resolver Address = ${authereumEnsResolver.address}`)
  await authereumEnsResolver.deployed()

  const ensReverseRegistrar = ensReverseRegistrarFactory.attach(ENS_REVERSE_REGISTRAR_ADDRESS)
  console.log(`ENS Reverse Registrar Address = ${ensReverseRegistrar.address}`)
  await ensReverseRegistrar.deployed()

  const authereumEnsManager = authereumEnsManagerFactory.attach(DEPLOYED_AUTHEREUM_ENS_MANAGER)
  // const authereumEnsManager = await authereumEnsManagerFactory.deploy(authereumDotEthDomain, authereumDotEthNode, ensRegistry.address, authereumEnsResolver.address)
  console.log(`Authereum ENS Manager Address = ${authereumEnsManager.address}`)
  await authereumEnsManager.deployed()

  const ensBaseRegistrar = ensBaseRegistrarFactory.attach(ENS_BASE_REGISTRAR_ADDRESS)
  console.log(`ENS Base Registrar = ${ensBaseRegistrar.address}`)
  await ensBaseRegistrar.deployed()

  console.log('Contracts deployed...')

  let tx
  // Set the ENS manager as an owner
  // NOTE: The AUTHEREUM_OWNER_ADDRESS is still the registrant (owns the ERC721 token)
  // NOTE: This is because the registrant will have to pay rent, change ownership, etc.
  // NOTE: Upon social contract upgrade, this will be unset as an owner and the new manager will be set as an owner
  // NOte: https://docs.ens.domains/terminology
  tx = await ensRegistry.functions.setOwner(authereumDotEthNode, authereumEnsManager.address)
  await ethersProvider.waitForTransaction(tx.hash)
  console.log('Transferred authereum.eth...')

  // Set up Authereum managers
  tx = await authereumEnsResolver.functions.addManager(AUTHEREUM_OWNER_ADDRESS)
  await ethersProvider.waitForTransaction(tx.hash)
  console.log('Set up Authereum owner as a manager')
  tx = await authereumEnsResolver.functions.addManager(authereumEnsManager.address)
  await ethersProvider.waitForTransaction(tx.hash)

  console.log('ENS has been set up')
}

deployEns()