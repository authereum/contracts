const utils = require('../utils/utils')
const constants = require('../utils/constants.js')
const timeUtils = require('../utils/time.js')

const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactAuthereumProxy = artifacts.require('AuthereumProxy')
const ArtifactAuthereumProxyFactory = artifacts.require('AuthereumProxyFactory')
const ArtifactTestERC20 = artifacts.require('TestERC20')
const ArtifactAuthereumRecoveryModule = artifacts.require('AuthereumRecoveryModule')

contract('GanacheEnvironment', function (accounts) {
  const AUTHEREUM_OWNER = accounts[0]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3], accounts[4]]

  // Token Params
  const DEFAULT_TOKEN_SUPPLY = constants.DEFAULT_TOKEN_SUPPLY
  const DEFAULT_TOKEN_DECIMALS = constants.DEFAULT_TOKEN_DECIMALS

  // Testing params
  let beforeAllSnapshotId

  // Parameters
  let _ensRegistry
  let _ensReverseRegistrar
  let _authereumEnsResolver
  let _authereumEnsManager
  let label
  let daiToken
  let saiToken
  let batToken
  let gntToken

  // Addresses
  let expectedAddress

  // Logic Addresses
  let authereumProxyFactoryLogicContract
  let authereumAccountLogicContract

  // Contract Instances
  let authereumRecoveryModule
  let authereumProxyAccount

  before(async () => {
    // Take snapshot to reset to a known state
    // This is required due to the deployment of the 1820 contract
    beforeAllSnapshotId = await timeUtils.takeSnapshot()
    
    // Deploy the recovery module
    authereumRecoveryModule = await ArtifactAuthereumRecoveryModule.new()

    // Deploy the 1820 contract
    await utils.deploy1820Contract(AUTHEREUM_OWNER)

    // Set up ENS defaults
    const { ensRegistry, ensReverseRegistrar, authereumEnsResolver, authereumEnsManager }= await utils.setENSDefaults(AUTHEREUM_OWNER)
    _ensRegistry = ensRegistry
    _ensReverseRegistrar = ensReverseRegistrar
    _authereumEnsResolver = authereumEnsResolver
    _authereumEnsManager = authereumEnsManager

    // Create Logic Contracts
    authereumAccountLogicContract = await ArtifactAuthereumAccount.new()
    const _proxyInitCode = await utils.calculateProxyBytecodeAndConstructor(authereumAccountLogicContract.address)
    authereumProxyFactoryLogicContract = await ArtifactAuthereumProxyFactory.new(_proxyInitCode, authereumEnsManager.address)

    // Set up Authereum ENS Manager defaults
    await utils.setAuthereumENSManagerDefaults(authereumEnsManager, AUTHEREUM_OWNER, authereumProxyFactoryLogicContract.address, constants.AUTHEREUM_PROXY_RUNTIME_CODE_HASH)

    // Create default proxies
    label = constants.DEFAULT_LABEL
    expectedSalt = constants.SALT
    expectedCreationCodeHash = constants.AUTHEREUM_PROXY_CREATION_CODE_HASH

    expectedAddress = await utils.createDefaultProxy(
      expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
      AUTH_KEYS[0], label, authereumAccountLogicContract.address
    )

    // Wrap in truffle-contract
    authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)

    // Create 4 tokens
    daiToken = await ArtifactTestERC20.new([AUTHEREUM_OWNER], DEFAULT_TOKEN_SUPPLY, 'AUTH0', 'AuthereumToken0', DEFAULT_TOKEN_DECIMALS)
    saiToken = await ArtifactTestERC20.new([AUTHEREUM_OWNER], DEFAULT_TOKEN_SUPPLY, 'AUTH1', 'AuthereumToken1', DEFAULT_TOKEN_DECIMALS)
    batToken = await ArtifactTestERC20.new([AUTHEREUM_OWNER], DEFAULT_TOKEN_SUPPLY, 'AUTH2', 'AuthereumToken2', DEFAULT_TOKEN_DECIMALS)
    gntToken = await ArtifactTestERC20.new([AUTHEREUM_OWNER], DEFAULT_TOKEN_SUPPLY, 'AUTH3', 'AuthereumToken3', DEFAULT_TOKEN_DECIMALS)
  })

  after(async() => {
    await timeUtils.revertSnapshot(beforeAllSnapshotId.result)
  })

  //**********//
  //  Tests  //
  //********//

  describe('log', () => {
    it('Should log all values', async () => {
      const logs = `
      EOAs
      ====
      Authereum Owner (owns everything): ${AUTHEREUM_OWNER}
      Authereum Account 0 Auth Key: ${AUTH_KEYS[0]}

      Authereum Accounts
      ==================
      Authereum Account 0 (a user): ${authereumProxyAccount.address}
      Authereum Account 0 Name: ${constants.DEFAULT_LABEL}

      Logic Contracts
      ===============
      Authereum Account Logic Contract: ${authereumAccountLogicContract.address}
      Proxy Factory Logic Contract: ${authereumProxyFactoryLogicContract.address}

      Tokens
      ======
      DAI: ${daiToken.address}
      SAI: ${saiToken.address}
      BAT: ${batToken.address}
      GNT: ${gntToken.address}

      ENS
      ===
      ENS Registry: ${_ensRegistry.address}
      ENS Reverse Registrar: ${_ensReverseRegistrar.address}
      Authereum ENS Resolver: ${_authereumEnsResolver.address}
      Authereum ENS Manager: ${_authereumEnsManager.address}
      `
      console.log(logs)

      console.log('      Ganache Accounts')
      console.log('      ================')
      for (const [index, account] of accounts.entries()) {
          console.log(`      ${index}: ${account}`);
      }

    })
  })
})
